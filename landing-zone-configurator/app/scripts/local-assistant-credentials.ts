import { execFileSync } from "node:child_process";
import { lstatSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export function loadLocalModelServingToken() {
  const local = fileURLToPath(new URL("../../.local/", import.meta.url));
  const state = join(local, "github-platform-applied.tfstate");
  const keyPath = join(local, "platform/state.passphrase");
  for (const path of [state, keyPath]) {
    const file = lstatSync(path);
    if (
      !file.isFile() ||
      (file.mode & 0o077) !== 0 ||
      file.uid !== process.getuid?.()
    )
      throw new Error("private_file_required");
  }
  const passphrase = readFileSync(keyPath, "utf8").trim();
  if (passphrase.length < 32) throw new Error("original_key_required");
  const directory = mkdtempSync(join(tmpdir(), "lzc-assistant-output-"));
  try {
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      TF_INPUT: "0",
      TF_ENCRYPTION: `key_provider "pbkdf2" "state" {\npassphrase = ${JSON.stringify(passphrase)}\n}\nmethod "aes_gcm" "state" {\nkeys = key_provider.pbkdf2.state\n}\nstate {\nmethod = method.aes_gcm.state\nenforced = true\n}`,
    };
    for (const name of Object.keys(environment))
      if (/^(TF_LOG|TF_CLI_ARGS|TF_DATA_DIR)/.test(name))
        delete environment[name];
    const token: unknown = JSON.parse(
      execFileSync(
        join(local, "ubuntu-release-37929894997/runner/tools/tofu"),
        ["output", "-json", `-state=${state}`, "model_serving_token"],
        {
          cwd: directory,
          env: environment,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 30000,
          maxBuffer: 65536,
        },
      ),
    );
    if (typeof token !== "string" || !token.trim())
      throw new Error("token_output_required");
    return token;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
