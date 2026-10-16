import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { buildAssistantTopicFieldPaths } from "../apps/api/src/assistant/topic-fields.js";
import {
  acceleratorInputs,
  featureGroups,
  supportedAcceleratorRevision,
} from "../packages/domain/dist/index.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const directory = resolve(
  root,
  "landing-zone-configurator/docs/assistant-knowledge",
);
const output = new URL(
  "../apps/api/src/assistant/knowledge-topics.generated.ts",
  import.meta.url,
);
const identifier = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
export const knowledgeManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  topics: z
    .array(
      z.strictObject({
        id: identifier,
        file: z.string().regex(/^[a-z][a-z0-9-]*\.md$/),
        version: z.number().int().positive(),
        checkedOn: z.iso.date(),
        qualification: z.literal("local-draft-not-reviewed-release"),
        groups: z
          .array(z.enum(Object.keys(featureGroups) as [string, ...string[]]))
          .max(8),
        mandatory: z.boolean(),
        inputs: z
          .array(z.enum(acceleratorInputs.map((input) => input.name)))
          .max(acceleratorInputs.length),
        dependencies: z.array(identifier).max(8),
        sources: z.array(z.string().min(1).max(300)).min(1).max(12),
        externalSources: z
          .array(
            z.url().refine((value) => new URL(value).protocol === "https:"),
          )
          .max(8),
        scenarios: z
          .array(z.string().regex(/^A(?:0[1-9]|1[0-9]|2[0-4])$/))
          .min(1)
          .max(24),
      }),
    )
    .min(1)
    .max(20),
});
const sections = [
  "Purpose",
  "Accelerator Contract",
  "Dependencies",
  "Dialogue",
  "Examples",
  "Limits",
  "Credentials",
  "Sources",
];
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

export function validateKnowledgeText(id: string, text: string) {
  const headings = [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
  if (
    !/^# [^\n]+\n/.test(text) ||
    JSON.stringify(headings) !== JSON.stringify(sections) ||
    text.length > 8000
  )
    throw new Error(`Invalid knowledge topic structure: ${id}`);
  for (const section of sections) {
    const content = text.split(`## ${section}\n`)[1]?.split("\n## ")[0]?.trim();
    if (!content) throw new Error(`Empty knowledge topic section: ${id}`);
  }
  return text;
}

export function validateKnowledgeManifest(input: unknown) {
  const manifest = knowledgeManifestSchema.parse(input);
  const ids = manifest.topics.map((topic) => topic.id);
  if (
    ids.some((id) =>
      [
        "configuration-contract",
        "public-corporate",
        "protected-inputs",
        "execution-capability",
        "folder-description",
      ].includes(id),
    )
  )
    throw new Error("Knowledge topic conflicts with global contract");
  if (
    new Set(ids).size !== ids.length ||
    new Set(manifest.topics.map((topic) => topic.file)).size !== ids.length
  )
    throw new Error("Duplicate knowledge topic");
  for (const mandatory of ["credential-foundations", "configuration-lifecycle"])
    if (
      !manifest.topics.some(
        (topic) => topic.id === mandatory && topic.mandatory,
      )
    )
      throw new Error(`Mandatory knowledge topic missing: ${mandatory}`);
  const visit = (id: string, chain: string[]) => {
    if (chain.includes(id)) throw new Error("Cyclic knowledge dependencies");
    const topic = manifest.topics.find((entry) => entry.id === id);
    if (!topic) throw new Error("Unknown knowledge dependency");
    for (const dependency of topic.dependencies)
      visit(dependency, [...chain, id]);
  };
  for (const topic of manifest.topics) visit(topic.id, []);
  const coveredInputs = new Set(
    manifest.topics.flatMap((topic) => topic.inputs),
  );
  if (acceleratorInputs.some((input) => !coveredInputs.has(input.name)))
    throw new Error("Uncovered Accelerator inputs in knowledge manifest");
  return manifest;
}

export function buildAssistantKnowledgeTopics() {
  const manifest = validateKnowledgeManifest(
    JSON.parse(readFileSync(resolve(directory, "manifest.json"), "utf8")),
  );
  const fieldPaths = buildAssistantTopicFieldPaths(
    manifest.topics.map((topic) => topic.id),
  );
  const topics = manifest.topics.map((topic) => {
    const text = readFileSync(
      resolve(directory, topic.file),
      "utf8",
    ).replaceAll("\r\n", "\n");
    validateKnowledgeText(topic.id, text);
    const sources = [
      ...new Set([
        ...topic.sources,
        "landing-zone-configurator/app/apps/api/src/assistant/editor.ts",
      ]),
    ].map((path) => {
      const absolute = resolve(root, path);
      const local = relative(root, absolute);
      if (
        local.startsWith("..") ||
        path.includes("\\") ||
        path.includes("/../") ||
        (!/^(?:src\/.*\.tf|landing-zone-configurator\/(?:docs\/.*\.md|app\/(?:packages\/domain|apps\/api)\/src\/.*\.ts))$/.test(
          path,
        ) &&
          path !==
            "landing-zone-configurator/app/packages/contracts/src/assistant.ts")
      )
        throw new Error("Knowledge source outside approved code/documentation");
      return { path, sha256: hash(readFileSync(absolute, "utf8")) };
    });
    return {
      ...topic,
      fieldPaths: fieldPaths[topic.id] ?? [],
      source: `landing-zone-configurator/docs/assistant-knowledge/${topic.file}`,
      sources,
      text,
      sha256: hash(text),
    };
  });
  if (topics.reduce((size, topic) => size + topic.text.length, 0) > 48000)
    throw new Error("Knowledge bundle exceeds context budget");
  return {
    schemaVersion: manifest.schemaVersion,
    engineRevision: supportedAcceleratorRevision,
    topics,
  };
}

export function renderAssistantKnowledgeTopics() {
  return `export const assistantKnowledgeTopics = ${JSON.stringify(buildAssistantKnowledgeTopics(), null, 2)} as const;\n`;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const rendered = renderAssistantKnowledgeTopics();
  if (process.argv.includes("--check")) {
    const bundled = (await import(output.href)).assistantKnowledgeTopics;
    if (
      JSON.stringify(bundled) !==
      JSON.stringify(buildAssistantKnowledgeTopics())
    )
      throw new Error(
        "Assistant knowledge bundle is stale; regenerate and review",
      );
  } else writeFileSync(output, rendered);
}
