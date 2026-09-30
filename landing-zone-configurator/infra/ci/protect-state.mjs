// Encrypt captured state files only; state pull is an explicit workflow step.
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { writeProtectedArtifact } from "./artifact.mjs";
const root = process.env.LZC_ROOT;
if (!["bootstrap", "backend", "platform", "runtime"].includes(root)) throw new Error("Invalid state root");
const privateDir = process.env.LZC_PRIVATE;
const key = JSON.parse(readFileSync(resolve(privateDir, `${root}.encryption.json`))).key_provider.pbkdf2.state.passphrase;
const destination = resolve(".local/ci-recovery");
mkdirSync(destination, { recursive: true, mode: 0o700 });
for (const [name, path] of [["remote-state", resolve(privateDir,"state.snapshot")], ["emergency-state", resolve("infra",root,"errored.tfstate")]]) {
  if (existsSync(path) && statSync(path).size > 0) {
    writeProtectedArtifact(resolve(destination, `${name}.enc.json`), readFileSync(path), key);
    console.log(`Protected ${name} snapshot saved.`);
  }
}
