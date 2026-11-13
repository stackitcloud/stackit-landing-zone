import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSync } from "rolldown/utils";
import { describe, expect, it } from "vitest";
import { englishMessages } from "../apps/web/src/locales/en";

type Node = { type: string; start: number; [key: string]: unknown };
const technicalText = new Set([
  "· OpenTofu",
  "eu01",
  "eu02",
  "lzc/configurations",
  "landing-zone.json",
  "landing-zone.tfvars",
  "Deutsch",
  "English",
  "-lz-",
  "terraform.tfstate",
  "https://object.storage.eu01.onstackit.cloud",
  "organisation/repository",
  "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "dev",
]);
function node(value: unknown): Node | undefined {
  return value &&
    typeof value === "object" &&
    "type" in value &&
    typeof value.type === "string"
    ? (value as Node)
    : undefined;
}
function strings(value: unknown): string[] {
  const item = node(value);
  if (!item) return [];
  if (item.type === "Literal" && typeof item.value === "string")
    return [item.value];
  if (item.type === "ConditionalExpression")
    return [...strings(item.consequent), ...strings(item.alternate)];
  if (item.type === "LogicalExpression")
    return [...strings(item.left), ...strings(item.right)];
  if (
    [
      "ParenthesizedExpression",
      "TSAsExpression",
      "TSNonNullExpression",
    ].includes(item.type)
  )
    return strings(item.expression);
  if (
    item.type === "MemberExpression" &&
    node(item.object)?.type === "ObjectExpression"
  )
    return strings(item.object);
  if (item.type === "ObjectExpression" && Array.isArray(item.properties))
    return item.properties.flatMap((property) =>
      strings(node(property)?.value),
    );
  return [];
}
function coverage(source: string, filename = "fixture.tsx") {
  const parsed = parseSync(filename, source);
  expect(parsed.errors, filename).toEqual([]);
  const errors: string[] = [];
  function report(item: Node, message: string, kind: string) {
    if (!message.trim()) return;
    errors.push(
      `${filename}:${source.slice(0, item.start).split("\n").length}: ${kind}: ${message}`,
    );
  }
  function registered(item: Node, value: unknown) {
    for (const text of strings(value))
      if (text.trim() && !Object.hasOwn(englishMessages, text))
        report(item, text, "missing English translation");
  }
  function visible(item: Node, value: unknown) {
    for (const text of strings(value)) {
      const normalized = text.replace(/\s+/g, " ").trim();
      if (/[\p{L}]/u.test(normalized) && !technicalText.has(normalized))
        report(item, normalized, "interface text must use t()");
    }
  }
  function visit(item: Node, parent?: Node) {
    if (
      item.type === "CallExpression" &&
      ["t", "formatMessage"].includes(String(node(item.callee)?.name)) &&
      Array.isArray(item.arguments)
    )
      registered(item, item.arguments[0]);
    if (item.type === "JSXText" && typeof item.value === "string")
      visible(item, { type: "Literal", start: item.start, value: item.value });
    if (
      item.type === "JSXAttribute" &&
      ["aria-label", "title", "placeholder", "alt"].includes(
        String(node(item.name)?.name),
      )
    )
      visible(
        item,
        node(item.value)?.type === "JSXExpressionContainer"
          ? node(item.value)?.expression
          : item.value,
      );
    if (
      item.type === "JSXExpressionContainer" &&
      parent &&
      ["JSXElement", "JSXFragment"].includes(parent.type)
    )
      visible(item, item.expression);
    if (
      item.type === "VariableDeclarator" &&
      ["errors", "messages", "labels", "hints", "descriptions"].includes(
        String(node(item.id)?.name),
      ) &&
      node(item.init)?.type === "ObjectExpression"
    )
      registered(item, item.init);
    for (const value of Object.values(item)) {
      if (Array.isArray(value))
        for (const child of value) {
          const next = node(child);
          if (next) visit(next, item);
        }
      else {
        const next = node(value);
        if (next) visit(next, item);
      }
    }
  }
  visit(parsed.program as unknown as Node);
  return errors;
}

describe("interface translation coverage", () => {
  it("detects untranslated headings, accessible labels and omitted dictionary keys", () => {
    const failures = coverage(
      'const view = <><h2>Mitglieder</h2><button aria-label="Schließen" /><p>{t("Neue fehlende Meldung")}</p></>;',
    );
    expect(failures).toHaveLength(3);
    expect(failures.join("\n")).toContain("missing English translation");
    expect(
      coverage(
        'const view = <p>{ready ? "Deutsch bleibt stehen" : t("Mitglieder")}</p>;',
      ),
    ).toHaveLength(1);
    expect(
      coverage('const errors = { failed: "Diese Meldung fehlt im Katalog" };'),
    ).toHaveLength(1);
  });

  it("allows customer data, generated content and explicit technical values without translating them", () => {
    expect(
      coverage(
        'const view = <><h2>{workspace.name}</h2><p>{message.content}</p><code>landing-zone.tfvars</code><option>Deutsch</option><p>{t("Mitglieder")}</p></>;',
      ),
    ).toEqual([]);
  });

  it("covers every web component and frontend message dictionary", () => {
    const root = fileURLToPath(new URL("../apps/web/src/", import.meta.url));
    const errors: string[] = [];
    function scan(directory: string) {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "locales") scan(path);
        } else if (/\.tsx?$/.test(path))
          errors.push(
            ...coverage(readFileSync(path, "utf8"), path.slice(root.length)),
          );
      }
    }
    scan(root);
    expect(errors).toEqual([]);
  });
});
