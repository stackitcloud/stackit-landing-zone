import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";

/** Bind synthetic receipts to source bytes, including uncommitted corrections. */
export function assistantSourceSha256() {
  const root = new URL("../", import.meta.url);
  const hash = createHash("sha256");
  const visit = (path: string) => {
    for (const entry of readdirSync(new URL(path, root), {
      withFileTypes: true,
    }).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile() && entry.name.endsWith(".ts"))
        hash
          .update(child)
          .update("\0")
          .update(readFileSync(new URL(child, root)));
    }
  };
  for (const path of [
    "apps/api/src",
    "packages/contracts/src",
    "packages/domain/src",
    "scripts",
  ])
    visit(path);
  return hash.digest("hex");
}
