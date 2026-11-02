import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("../", import.meta.url));
const container = `lzc-upgrade-test-${randomUUID()}`;
let created = false;
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} failed`);
}
try {
  let address = process.env.LZC_TEST_DATABASE_URL;
  if (!address) {
    run("docker", [
      "run",
      "--rm",
      "-d",
      "--name",
      container,
      "-e",
      "POSTGRES_PASSWORD=local-test-only",
      "-e",
      "POSTGRES_DB=configurator_test",
      "-p",
      "127.0.0.1::5432",
      "postgres:17-alpine",
    ]);
    created = true;
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (
        spawnSync(
          "docker",
          ["exec", container, "pg_isready", "-U", "postgres"],
          { stdio: "ignore" },
        ).status === 0
      ) {
        ready = true;
        break;
      }
      await setTimeout(200);
    }
    if (!ready) throw new Error("Disposable PostgreSQL did not become ready");
    const mapped = spawnSync("docker", ["port", container, "5432/tcp"], {
      encoding: "utf8",
    });
    const port = /^127\.0\.0\.1:(\d+)\s*$/.exec(mapped.stdout ?? "")?.[1];
    if (!port) throw new Error("Expected an isolated loopback PostgreSQL port");
    address = `postgres://postgres:local-test-only@127.0.0.1:${port}/configurator_test`;
  }
  if (!process.argv.includes("--no-build")) run("npm", ["run", "build"]);
  run(
    process.execPath,
    [
      "node_modules/vitest/vitest.mjs",
      "run",
      "integration/application-template-upgrades.test.ts",
      "-t",
      "completes the upgrade wizard",
      "--no-file-parallelism",
    ],
    {
      ...process.env,
      LZC_TEST_DATABASE_URL: address,
      LZC_TEST_BROWSER_JOURNEY: "true",
    },
  );
} finally {
  if (created)
    spawnSync("docker", ["rm", "-f", container], { stdio: "ignore" });
}
