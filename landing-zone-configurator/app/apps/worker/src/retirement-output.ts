import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { openTofuProgress } from "@lzc/contracts";

const maximum = 2 * 1024 * 1024;
/** Same bounded, complete-line publication and key redaction as the normal runner.
 * State pulls and machine-readable saved-plan JSON are never publishable output. */
export async function retirementOutput(
  directory: string,
  secrets: readonly string[],
  live = false,
) {
  const redactions = [...new Set(secrets.filter((s) => s.length > 0))]
    .flatMap((s) => [s, JSON.stringify(s).slice(1, -1)])
    .sort((a, b) => b.length - a.length);
  let text = "",
    truncated = false;
  for (const name of [
    "init",
    "validate",
    "plan",
    "plan-details",
    "bucket-cleanup",
    "apply",
  ]) {
    for (const stream of ["out", "err"]) {
      const file = await open(
        join(directory, `${name}.${stream}`),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      ).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (!file) continue;
      try {
        const metadata = await file.stat();
        if (!metadata.isFile()) throw Error("retirement_output_invalid");
        const remaining = Math.max(0, maximum - Buffer.byteLength(text));
        const size = metadata.size;
        const bytes = Buffer.alloc(Math.min(size, remaining + 32768));
        const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
        let content = bytes.subarray(0, bytesRead).toString("utf8");
        if (live || bytesRead < size)
          content = content.slice(0, content.lastIndexOf("\n") + 1);
        if ((name === "apply" || name === "plan") && stream === "out") {
          // Apply uses -json. Publish only the existing allowlisted progress projection.
          content = openTofuProgress(
            content.slice(0, content.lastIndexOf("\n") + 1),
          ).text;
        }
        for (const secret of redactions)
          content = content.replaceAll(secret, "(sensitive value)");
        content = content.replace(
          /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g,
          "(sensitive value)",
        );
        content = content.replace(
          /((?:password|secret|access[_-]?key|private[_-]?key|token|authorization)[\w-]*["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\r\n]+)/gi,
          "$1(sensitive value)",
        );
        const command =
          name === "plan-details"
            ? "show retirement.plan"
            : name === "apply"
              ? "apply retirement.plan"
              : name;
        const chunk = `$ ${name === "bucket-cleanup" ? "bucket cleanup" : `tofu ${command}`}${stream === "err" ? " (stderr)" : ""}\n${content}\n`;
        truncated ||= bytesRead < size || Buffer.byteLength(chunk) > remaining;
        text += new TextDecoder().decode(
          Buffer.from(chunk).subarray(0, remaining),
          { stream: true },
        );
      } finally {
        await file.close();
      }
    }
  }
  return { text, truncated };
}

export function retirementOutputSecrets(
  key: unknown,
  ticket: string,
  variables: unknown,
) {
  const strings: string[] = [ticket];
  const collect = (value: unknown) => {
    if (typeof value === "string") strings.push(value);
    else if (value && typeof value === "object")
      Object.values(value).forEach(collect);
  };
  collect(key);
  const sensitive = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    for (const [name, item] of Object.entries(value)) {
      if (
        /password|secret|token|private.?key|access.?key|credential/i.test(name)
      )
        collect(item);
      else sensitive(item);
    }
  };
  sensitive(variables);
  return strings;
}
