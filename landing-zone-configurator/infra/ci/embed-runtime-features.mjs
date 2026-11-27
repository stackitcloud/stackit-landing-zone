import { readFileSync, writeFileSync } from "node:fs";
const source = readFileSync(new URL("./runtime-features.mjs", import.meta.url), "utf8").trimEnd();
for (const name of ["configurator-release.yml", "configurator-production.yml"]) {
  const path = new URL(`../../../.github/workflows/${name}`, import.meta.url);
  const workflow = readFileSync(path, "utf8");
  const start = "          # BEGIN GENERATED RUNTIME FEATURE POLICY\n";
  const end = "          # END GENERATED RUNTIME FEATURE POLICY";
  const block = `${start}          node --input-type=module <<'LZC_RUNTIME_FEATURES'\n${source.split("\n").map(line => line ? `          ${line}` : "").join("\n")}\n          LZC_RUNTIME_FEATURES\n${end}`;
  const first = workflow.indexOf(start), last = workflow.indexOf(end, first);
  if (first < 0 || last < 0) throw new Error("Missing runtime policy generation anchors");
  const generated = workflow.slice(0, first) + block + workflow.slice(last + end.length);
  if (process.argv.includes("--check")) {
    if (generated !== workflow) throw new Error("Stale runtime feature policy in workflow");
  } else writeFileSync(path, generated);
}
