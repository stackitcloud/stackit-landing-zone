import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  retirementOutput,
  retirementOutputSecrets,
} from "../apps/worker/src/retirement-output.js";
import { readRetirementBackendState } from "../apps/worker/src/retirement-state.js";

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0))
    await rm(path, { recursive: true, force: true });
});
async function fixture() {
  const path = await mkdtemp(join(tmpdir(), "lzc-retirement-output-"));
  directories.push(path);
  return path;
}
it("publishes native diagnostics and human Plan details while excluding raw State and saved-plan JSON", async () => {
  const path = await fixture();
  await writeFile(join(path, "init.out"), "Initializing the backend...\n");
  await writeFile(join(path, "validate.err"), "Error: Invalid configuration\n");
  await writeFile(
    join(path, "before.out"),
    "RAW_STATE_MUST_NEVER_LEAVE_WORKER",
  );
  await writeFile(
    join(path, "show.out"),
    "RAW_PLAN_JSON_MUST_NEVER_LEAVE_WORKER",
  );
  await writeFile(
    join(path, "plan-details.out"),
    "Plan: 0 to add, 0 to change, 3 to destroy.\n",
  );
  const result = await retirementOutput(path, []);
  expect(result.text).toContain("Initializing the backend");
  expect(result.text).toContain("Error: Invalid configuration");
  expect(result.text).toContain("3 to destroy");
  expect(result.text).not.toMatch(/RAW_STATE|RAW_PLAN_JSON/);
});
it("redacts uploaded keys, tickets, short passwords, escaped secrets and diagnostic assignments", async () => {
  const path = await fixture();
  const secret = "line one\nline two";
  const secrets = retirementOutputSecrets(
    {
      credentials: {
        privateKey:
          "-----BEGIN PRIVATE KEY-----\nRSA_FIXTURE\n-----END PRIVATE KEY-----",
      },
    },
    "TICKET_SENTINEL",
    { firewall_admin_password: "tiny", secrets: { value: secret } },
  );
  await writeFile(
    join(path, "validate.err"),
    `tiny TICKET_SENTINEL ${JSON.stringify(secret).slice(1, -1)}\npassword = unknown-provider-secret\nAuthorization: Bearer UNEXPECTED_BEARER_SECRET\naccess_key_secret = GENERATED_CLOUD_SECRET\n-----BEGIN PRIVATE KEY-----\nRSA_FIXTURE\n-----END PRIVATE KEY-----\n`,
  );
  const output = await retirementOutput(path, secrets);
  expect(output.text).not.toMatch(
    /tiny|TICKET_SENTINEL|line one|line two|unknown-provider-secret|UNEXPECTED_BEARER_SECRET|GENERATED_CLOUD_SECRET|RSA_FIXTURE/,
  );
  expect(output.text).toContain("(sensitive value)");
});
it("does not publish an incomplete sensitive line while a command is still writing", async () => {
  const path = await fixture();
  await writeFile(
    join(path, "init.out"),
    "Safe complete line\nPRIVATE_INCOMPLETE",
  );
  expect((await retirementOutput(path, [], true)).text).not.toContain(
    "PRIVATE_INCOMPLETE",
  );
});
it("projects only allowed plan/apply JSON events, keeping arbitrary event metadata out of output", async () => {
  const path = await fixture();
  await writeFile(
    join(path, "plan.out"),
    [
      JSON.stringify({
        type: "version",
        ui: "1.2",
        "@message": "OpenTofu 1.12.6",
      }),
      JSON.stringify({
        type: "planned_change",
        "@message":
          "module.management.stackit_resourcemanager_project.this: Plan to delete",
        change: {
          action: "delete",
          resource: {
            addr: "module.management.stackit_resourcemanager_project.this",
          },
        },
        private: "EVENT_SECRET",
      }),
      "",
    ].join("\n"),
  );
  const output = await retirementOutput(path, []);
  expect(output.text).not.toContain("EVENT_SECRET");
  expect(output.text).toContain(
    "module.management.stackit_resourcemanager_project.this",
  );
});
it("bounds output without exposing a clipped secret or partial UTF-8 text", async () => {
  const path = await fixture();
  await writeFile(
    join(path, "init.out"),
    "ü".repeat(1024 * 1024) + "SECRET_TAIL",
  );
  const output = await retirementOutput(path, ["SECRET_TAIL"]);
  expect(Buffer.byteLength(output.text)).toBeLessThanOrEqual(2 * 1024 * 1024);
  expect(output.truncated).toBe(true);
  expect(output.text).not.toContain("SECRET_TAIL");
  expect(output.text).not.toContain("\uFFFD");
});
it("reads the unnormalized authoritative State with one scoped GET, no redirects or writes", async () => {
  const state = { version: 4, serial: 1, lineage: "synthetic", resources: [] };
  const requests: Array<{ url: unknown; options: RequestInit | undefined }> =
    [];
  const value = await readRetirementBackendState(
    "https://example.test/api/retirement-runner/state",
    "ticket",
    Date.now() + 1000,
    async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify(state));
    },
  );
  expect(value).toEqual(state);
  expect(Object.hasOwn(value as object, "check_results")).toBe(false);
  expect(requests).toHaveLength(1);
  expect(requests[0]?.options).toMatchObject({
    method: "GET",
    redirect: "error",
    headers: {
      authorization: `Basic ${Buffer.from("runner:ticket").toString("base64")}`,
    },
  });
});
it("refuses oversized or failed backend reads", async () => {
  await expect(
    readRetirementBackendState(
      "https://example.test",
      "ticket",
      Date.now() + 1000,
      async () => new Response("no", { status: 403 }),
    ),
  ).rejects.toThrow("retirement_backend_read_failed");
  await expect(
    readRetirementBackendState(
      "https://example.test",
      "ticket",
      Date.now() + 1000,
      async () => new Response("x".repeat(16 * 1024 * 1024 + 1)),
    ),
  ).rejects.toThrow("retirement_native_output_invalid");
});

it("refuses a diagnostic symlink rather than exposing State through an output filename", async () => {
  const path = await fixture();
  await writeFile(join(path, "before.out"), "PRIVATE_STATE_SENTINEL");
  await symlink(join(path, "before.out"), join(path, "plan-details.out"));
  await expect(retirementOutput(path, [])).rejects.toThrow();
});
