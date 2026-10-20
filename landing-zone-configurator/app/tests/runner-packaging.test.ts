import { execFile } from "node:child_process";
import { constants } from "node:fs";
import {
  chmod,
  copyFile,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const run = promisify(execFile);
const runner = fileURLToPath(new URL("../../deploy/runner/", import.meta.url));
const publicPackage = process.env.LZC_MIRROR_TEST_PACKAGE;

it("packages unpacked providers only after readonly-lock offline verification", async () => {
  const script = await readFile(join(runner, "package.sh"), "utf8");
  expect(script).toContain("prepare-provider-mirror.sh");
  const config = await readFile(join(runner, "runner.tfrc"), "utf8");
  expect(config).toContain("filesystem_mirror");
  expect(config).not.toMatch(/\bdirect\b|\bnetwork_mirror\b/);
});

it.runIf(Boolean(publicPackage))(
  "proves unpacked native provider checksums, per-job symlinks and offline failure with OpenTofu 1.12.6",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "lzc-mirror-test-"));
    const sockets = await mkdtemp(
      join(tmpdir().length <= 60 ? tmpdir() : "/tmp", "lzc-mirror-ipc-"),
    );
    const mirror = join(root, "providers");
    const source = join(root, "source");
    const tofu = join(publicPackage as string, "tools/tofu");
    const provider = "registry.opentofu.org/hashicorp/random";
    try {
      const engine = JSON.parse((await run(tofu, ["version", "-json"])).stdout);
      expect(engine.terraform_version).toBe("1.12.6");
      expect([
        "linux_amd64",
        "linux_arm64",
        "darwin_amd64",
        "darwin_arm64",
      ]).toContain(engine.platform);
      const platform = engine.platform as string;
      await mkdir(join(mirror, provider), { recursive: true });
      await mkdir(source);
      for (const [name, version] of [
        ["random", "3.9.0"],
        ["time", "0.14.1"],
      ] as const) {
        const path = `registry.opentofu.org/hashicorp/${name}`;
        await mkdir(join(mirror, path), { recursive: true });
        const archive = `terraform-provider-${name}_${version}_${platform}.zip`;
        const packed = join(
          publicPackage as string,
          "providers",
          path,
          archive,
        );
        const info = await lstat(packed).catch(
          (error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") throw error;
            return undefined;
          },
        );
        if (info) {
          expect(info.isFile()).toBe(true);
          expect(info.isSymbolicLink()).toBe(false);
          await copyFile(
            packed,
            join(mirror, path, archive),
            constants.COPYFILE_FICLONE,
          );
        } else {
          await cp(
            join(publicPackage as string, "providers", path, version, platform),
            join(mirror, path, version, platform),
            {
              recursive: true,
              dereference: true,
              mode: constants.COPYFILE_FICLONE,
            },
          );
        }
      }
      const pinnedLock = await readFile(
        join(runner, "accelerator.lock.hcl"),
        "utf8",
      );
      await writeFile(
        join(source, ".terraform.lock.hcl"),
        `${["random", "time"]
          .map((name) => {
            const block = pinnedLock.match(
              new RegExp(
                `provider "registry.opentofu.org/hashicorp/${name}" \\{[\\s\\S]*?\\n\\}`,
              ),
            );
            if (!block)
              throw new Error("Missing pinned public provider fixture");
            return block[0];
          })
          .join("\n\n")}\n`,
      );
      const lock = await readFile(join(source, ".terraform.lock.hcl"), "utf8");
      await writeFile(
        join(source, "main.tf"),
        'terraform {\n required_providers {\n random = {\n source = "hashicorp/random"\n version = ">= 3.9.0, 3.9.0"\n }\n time = {\n source = "hashicorp/time"\n version = ">= 0.14.1, 0.14.1"\n }\n }\n}\nresource "random_uuid" "fixture" {}\nresource "time_static" "fixture" {}\n',
      );
      await run(
        "/bin/bash",
        [join(runner, "prepare-provider-mirror.sh"), tofu, mirror, source],
        { timeout: 30000, env: { ...process.env, TMPDIR: sockets } },
      );
      expect(await readFile(join(source, ".terraform.lock.hcl"), "utf8")).toBe(
        lock,
      );
      const unpacked = join(mirror, provider, "3.9.0", platform);
      expect((await lstat(unpacked)).mode & 0o222).toBe(0);
      expect(await readdir(join(mirror, provider))).toEqual(["3.9.0"]);
      const config = join(root, "runner.tfrc");
      await writeFile(
        config,
        `provider_installation {\n filesystem_mirror {\n path = ${JSON.stringify(mirror)}\n }\n}\ndisable_checkpoint = true\n`,
      );
      const init = () =>
        run(
          tofu,
          [
            `-chdir=${source}`,
            "init",
            "-backend=false",
            "-input=false",
            "-lockfile=readonly",
            "-no-color",
          ],
          {
            env: {
              PATH: process.env.PATH,
              HOME: root,
              TMPDIR: sockets,
              CHECKPOINT_DISABLE: "1",
              TF_CLI_CONFIG_FILE: config,
            },
            timeout: 30000,
          },
        );
      await init();
      expect(
        (
          await lstat(
            join(source, ".terraform/providers", provider, "3.9.0", platform),
          )
        ).isSymbolicLink(),
      ).toBe(true);
      expect(await readFile(join(source, ".terraform.lock.hcl"), "utf8")).toBe(
        lock,
      );
      await rm(join(source, ".terraform"), { recursive: true, force: true });
      await chmod(mirror, 0o700);
      await run("chmod", ["-R", "u+w", mirror]);
      const binary = (await readdir(unpacked)).find((name) =>
        name.startsWith("terraform-provider-random"),
      ) as string;
      await writeFile(
        join(unpacked, binary),
        "corrupt public provider fixture",
      );
      await expect(init()).rejects.toThrow(/checksum|checksums/);
      await rm(join(source, ".terraform"), { recursive: true, force: true });
      await rm(join(mirror, provider), { recursive: true, force: true });
      await expect(init()).rejects.toThrow(/not\s+found|not available/);
    } finally {
      await run("chmod", ["-R", "u+w", root]);
      await rm(root, { recursive: true, force: true });
      await rm(sockets, { recursive: true, force: true });
    }
  },
  60000,
);
