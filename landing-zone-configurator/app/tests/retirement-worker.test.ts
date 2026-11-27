import { createHash, generateKeyPairSync } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
import { runRetirementWorker } from "../apps/worker/src/retirement.js";
import { brokerOrigin } from "../apps/worker/src/runner.js";
import {
  applicationSourcePayloadSha256,
  retirementAdapterCommit,
  retirementInventory,
  retirementProviderLockSha256,
  retirementStateSha256,
} from "../packages/contracts/src/recovery/index.js";

const sha = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const repo = fileURLToPath(new URL("../../../", import.meta.url));
const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0))
    await rm(dir, { recursive: true, force: true });
});
const folderAddress =
  'module.governance.stackit_resourcemanager_folder.this["platform"]';
const projectAddress = "module.management.stackit_resourcemanager_project.this";
const key = {
  credentials: {
    kid: "fixture-key",
    iss: "cleanup-fixture@sa.stackit.cloud",
    sub: "55555555-5555-4555-8555-555555555555",
    aud: "https://accounts.stackit.cloud",
    privateKey: generateKeyPairSync("rsa", { modulusLength: 2048 })
      .privateKey.export({ type: "pkcs8", format: "pem" })
      .toString(),
  },
};
const projectId = "77777777-7777-4777-8777-777777777777",
  folderId = "88888888-8888-4888-8888-888888888888";
const original = {
  version: 4,
  terraform_version: "1.12.6",
  lineage: "99999999-9999-4999-8999-999999999999",
  serial: 1,
  resources: [
    {
      module: "module.governance",
      mode: "managed",
      type: "stackit_resourcemanager_folder",
      name: "this",
      provider: 'provider["registry.opentofu.org/stackitcloud/stackit"]',
      instances: [
        { index_key: "platform", attributes: { folder_id: folderId } },
      ],
    },
    {
      module: "module.management",
      mode: "managed",
      type: "stackit_resourcemanager_project",
      name: "this",
      provider: 'provider["registry.opentofu.org/stackitcloud/stackit"]',
      instances: [
        {
          attributes: {
            project_id: projectId,
            private_value: "PRIVATE_STATE_SENTINEL",
          },
        },
      ],
    },
  ],
};
async function fixture(
  options: {
    operation?: "plan" | "apply";
    finalize?: boolean;
    failure?: "folder-conflict" | "state-write";
    ackRecovery?: boolean;
    hosted?: boolean;
    recoveryAcknowledgedAfter?: number;
    normalizedState?: boolean;
    changedBackend?: boolean;
    slowPlan?: boolean;
    outputUnavailable?: boolean;
  } = {},
) {
  const dir = await mkdtemp(join(tmpdir(), "lzc-retirement-worker-test-"));
  dirs.push(dir);
  const root = join(dir, "package"),
    workRoot = join(dir, "jobs");
  await mkdir(join(root, "tools"), { recursive: true });
  await mkdir(join(root, "providers"));
  await mkdir(workRoot);
  for (const [source, destination] of [
    ["src/retirement", "retirement-src/retirement"],
    ["src/modules/governance", "retirement-src/modules/governance"],
  ]) {
    if (!source || !destination) throw Error("Fixture path missing");
    await cp(join(repo, source), join(root, destination), {
      recursive: true,
      filter: (path) =>
        !/(^|\/)(\.terraform|__pycache__|.*\.tfstate(?:\..*)?)(\/|$)/.test(
          path,
        ),
    });
  }
  await writeFile(
    join(root, "retirement-source.json"),
    JSON.stringify({
      schemaVersion: 1,
      revision: retirementAdapterCommit,
      providerLockSha256: retirementProviderLockSha256,
      payloadSha256: await applicationSourcePayloadSha256(
        join(root, "retirement-src"),
      ),
    }),
  );
  const before = options.finalize
    ? { ...original, serial: 2, resources: original.resources.slice(0, 1) }
    : original;
  const after = options.failure
    ? before
    : {
        ...before,
        serial: before.serial + 1,
        resources: options.finalize ? [] : before.resources.slice(0, 1),
      };
  const plan = {
    format_version: "1.2",
    complete: true,
    resource_changes: [
      {
        address: folderAddress,
        mode: "managed",
        type: "stackit_resourcemanager_folder",
        change: {
          actions: options.finalize ? ["delete"] : ["no-op"],
          before: { folder_id: folderId },
        },
      },
      ...(!options.finalize
        ? [
            {
              address: projectAddress,
              mode: "managed",
              type: "stackit_resourcemanager_project",
              change: {
                actions: ["delete"],
                before: {
                  project_id: projectId,
                  password: "PLAN_SECRET_SENTINEL",
                },
              },
            },
          ]
        : []),
    ],
  };
  const nativePlan = Buffer.from("synthetic native saved plan fixture");
  const script = `#!${process.execPath}
const fs=require("node:fs"),path=require("node:path");
const cmd=process.argv[2];const before=${JSON.stringify(options.normalizedState ? { ...before, check_results: null } : before)},after=${JSON.stringify(options.normalizedState ? { ...after, check_results: null } : after)},plan=${JSON.stringify(plan)};
if(cmd==="version")console.log(JSON.stringify({terraform_version:"1.12.6"}));
else if(cmd==="state")console.log(JSON.stringify(fs.existsSync("fixture-applied")?after:before,null,2));
else if(cmd==="plan"){
 console.log(JSON.stringify({type:"version",ui:"1.2","@message":"OpenTofu 1.12.6"}));
 console.log(JSON.stringify({type:"refresh_start","@message":"Refreshing synthetic resources..."}));
 const finish=()=>fs.writeFileSync("retirement.plan",Buffer.from(${JSON.stringify(nativePlan.toString("base64"))},"base64"));
 if(${JSON.stringify(options.slowPlan)})setTimeout(finish,1800);else finish();
}
else if(cmd==="show"){if(process.argv.includes("-no-color"))console.log("Plan: 0 to add, 0 to change, 1 to destroy.");else console.log(JSON.stringify(plan));}
else if(cmd==="apply"){
 console.log(JSON.stringify({type:"version",ui:"1.2"}));
 fs.writeFileSync("fixture-applied","");
 if(${JSON.stringify(options.failure)}==="state-write"){fs.writeFileSync("errored.tfstate",JSON.stringify({...before,serial:before.serial+1,resources:[]}));process.exit(1);}
 if(${JSON.stringify(options.failure)}==="folder-conflict"){console.log(JSON.stringify({type:"apply_errored",hook:{action:"delete",resource:{addr:${JSON.stringify(folderAddress)}}}}));console.log(JSON.stringify({type:"diagnostic",diagnostic:{severity:"error",summary:"Error deleting folder. Deletion may fail because associated projects remain hidden for up to 7 days after user deletion due to technical requirements.",detail:"Calling API: 409 Conflict, status code 409, Body: Folder has children. Deletion not permitted"}}));process.exit(1);}
 for(const resource of plan.resource_changes)if(resource.change.actions.includes("delete"))console.log(JSON.stringify({type:"apply_complete",hook:{action:"delete",resource:{addr:resource.address}}}));
}
`;
  await writeFile(join(root, "tools/tofu"), script, { mode: 0o700 });
  const ticket = "a".repeat(43),
    origin = options.hosted ? brokerOrigin : "http://127.0.0.1:3000",
    variables = {
      retirement_phase: options.finalize
        ? "finalize_folders"
        : "remove_projects",
    };
  const input = {
    id: "11111111-1111-4111-8111-111111111111",
    operation: options.operation ?? "plan",
    retirementId: "22222222-2222-4222-8222-222222222222",
    generation: 1,
    scopeId: "33333333-3333-4333-8333-333333333333",
    phase: options.finalize ? "finalize_folders" : "remove_projects",
    sourceRevision: retirementAdapterCommit,
    providerLockSha256: retirementProviderLockSha256,
    variables,
    variablesSha256: sha(JSON.stringify(variables)),
    baseline: retirementInventory(original),
    before: retirementInventory(before),
    beforeStateSha256: retirementStateSha256(before),
    protectedServiceAccount: key.credentials.iss,
    protectedProjectIds: ["44444444-4444-4444-8444-444444444444"],
    key,
    backend: {
      address: `${origin}/api/retirement-runner/state`,
      lockAddress: `${origin}/api/retirement-runner/state/lock`,
      unlockAddress: `${origin}/api/retirement-runner/state/unlock`,
      username: "runner",
      password: ticket,
    },
    ...(options.operation === "apply"
      ? {
          plan: {
            data: nativePlan.toString("base64"),
            sha256: sha(nativePlan),
          },
        }
      : {}),
  };
  const reports: { path: string; body: unknown }[] = [];
  let recoveryCount = 0;
  let backendReads = 0;
  const run = () =>
    runRetirementWorker({
      root,
      workRoot,
      local: !options.hosted,
      recoveryRetryMilliseconds: 1,
      brokerOrigin: origin,
      id: input.id,
      ticket,
      timeoutMilliseconds: 20000,
      fetch: async (_address, request) => {
        expect(request?.method).toBe("GET");
        expect(request?.redirect).toBe("error");
        expect(request?.headers).toMatchObject({
          authorization: `Basic ${Buffer.from(`runner:${ticket}`).toString("base64")}`,
        });
        const snapshot = ++backendReads === 1 ? before : after;
        return new Response(
          JSON.stringify(
            options.changedBackend
              ? {
                  ...before,
                  outputs: {
                    changed: {
                      value: "different retained output",
                      sensitive: true,
                      type: "string",
                    },
                  },
                }
              : snapshot,
          ),
          { status: 200 },
        );
      },
      report: async (path, body) => {
        reports.push({ path, body });
        if (path === "input") return input;
        if (path === "output" && options.outputUnavailable)
          throw Error("synthetic_output_transport_failure");
        if (path === "recovery") {
          recoveryCount += 1;
          return {
            accepted: options.recoveryAcknowledgedAfter
              ? recoveryCount >= options.recoveryAcknowledgedAfter
              : options.ackRecovery !== false,
          };
        }
        return {};
      },
    });
  return { root, workRoot, input, reports, run, after };
}
it("accepts OpenTofu's reserialized checks while retaining exact authoritative backend checksums", async () => {
  const f = await fixture({ normalizedState: true });
  expect(await f.run()).toBe("succeeded");
  expect(f.reports.some((r) => r.path === "artifact")).toBe(true);
});
it("rejects an actual authoritative State change before publishing an artifact", async () => {
  const f = await fixture({ normalizedState: true, changedBackend: true });
  expect(await f.run()).toBe("failed");
  expect(f.reports.some((r) => r.path === "artifact")).toBe(false);
  expect(f.reports.findLast((r) => r.path === "result")?.body).toMatchObject({
    errorCode: "retirement_state_changed",
  });
});
it("binds the Apply receipt to the authoritative post-Apply document despite normalized checks", async () => {
  const f = await fixture({ operation: "apply", normalizedState: true });
  expect(await f.run()).toBe("succeeded");
  expect(f.reports.findLast((r) => r.path === "result")?.body).toMatchObject({
    status: "succeeded",
    stateSha256: retirementStateSha256(f.after),
  });
});
it("publishes native progress before a long-running Plan completes", async () => {
  const f = await fixture({ slowPlan: true });
  const execution = f.run();
  try {
    await vi.waitFor(
      () => {
        expect(
          f.reports.some(
            (r) =>
              r.path === "output" &&
              JSON.stringify(r.body).includes("Refreshing synthetic resources"),
          ),
        ).toBe(true);
        expect(f.reports.some((r) => r.path === "artifact")).toBe(false);
      },
      { timeout: 1500 },
    );
  } finally {
    expect(await execution).toBe("succeeded");
  }
});
it("keeps output transport failure separate from native Plan execution", async () => {
  const f = await fixture({ outputUnavailable: true });
  expect(await f.run()).toBe("succeeded");
  expect(f.reports.filter((r) => r.path === "artifact")).toHaveLength(1);
});
it("plans the captured scope and reports only a secret-free projection and exact artifact", async () => {
  const f = await fixture();
  expect(await f.run()).toBe("succeeded");
  expect(
    f.reports.filter((r) => r.path !== "output").map((r) => r.path),
  ).toEqual(["input", "stage", "stage", "stage", "artifact", "result"]);
  expect(JSON.stringify(f.reports)).not.toMatch(
    /PRIVATE_STATE_SENTINEL|PLAN_SECRET_SENTINEL|PRIVATE KEY/,
  );
  const artifact = f.reports.find((r) => r.path === "artifact")?.body as {
    projection: { resource_changes: unknown[] };
    sha256: string;
  };
  expect(artifact.projection.resource_changes).toHaveLength(2);
  expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(await readdir(f.workRoot)).toEqual([]);
});
it("applies only the saved artifact and checks its persisted State transition", async () => {
  const f = await fixture({ operation: "apply" });
  expect(await f.run()).toBe("succeeded");
  expect(f.reports.at(-1)).toMatchObject({
    path: "result",
    body: { status: "succeeded", removed: [{ address: projectAddress }] },
  });
});
it("keeps native folder-409 Apply failed while classifying the bounded purge wait", async () => {
  const f = await fixture({
    operation: "apply",
    finalize: true,
    failure: "folder-conflict",
  });
  expect(await f.run()).toBe("failed");
  expect(f.reports.at(-1)).toMatchObject({
    path: "result",
    body: {
      status: "failed",
      errorCode: "retirement_folder_purge_pending",
      removed: [],
    },
  });
});
it("uploads interrupted State privately before cleanup when persistence failed", async () => {
  const f = await fixture({ operation: "apply", failure: "state-write" });
  expect(await f.run()).toBe("failed");
  expect(f.reports.find((r) => r.path === "recovery")).toBeDefined();
  expect(await readdir(f.workRoot)).toEqual([]);
  expect(f.reports.at(-1)).toMatchObject({
    path: "result",
    body: {
      status: "failed",
      errorCode: "retirement_apply_outcome_unconfirmed",
    },
  });
});
it("retains the private recovery directory when durable recovery upload is unconfirmed", async () => {
  const f = await fixture({
    operation: "apply",
    failure: "state-write",
    ackRecovery: false,
  });
  expect(await f.run()).toBe("failed");
  const [dir] = await readdir(f.workRoot);
  expect(dir).toBeDefined();
  expect(
    (
      await lstat(
        join(f.workRoot, String(dir), "source/retirement/errored.tfstate"),
      )
    ).isFile(),
  ).toBe(true);
});
it("refuses a modified source package before native execution", async () => {
  const f = await fixture();
  await writeFile(
    join(f.root, "retirement-src/retirement/main.tf"),
    "# changed source",
  );
  expect(await f.run()).toBe("failed");
  expect(f.reports.some((r) => r.path === "artifact")).toBe(false);
});
it("rejects a changed native artifact before Apply", async () => {
  const f = await fixture({ operation: "apply" });
  if (f.input.plan) f.input.plan.sha256 = "0".repeat(64);
  expect(await f.run()).toBe("failed");
  expect(
    f.reports.some(
      (r) =>
        r.path === "stage" &&
        (r.body as { stage: string }).stage === "applying",
    ),
  ).toBe(false);
});

it("keeps a hosted CF task alive for durable recovery upload without repeating native Apply", async () => {
  const f = await fixture({
    operation: "apply",
    failure: "state-write",
    hosted: true,
    recoveryAcknowledgedAfter: 2,
  });
  expect(await f.run()).toBe("failed");
  expect(f.reports.filter((row) => row.path === "recovery")).toHaveLength(2);
  expect(
    f.reports.filter(
      (row) =>
        row.path === "stage" &&
        (row.body as { stage: string }).stage === "applying",
    ),
  ).toHaveLength(1);
  expect(await readdir(f.workRoot)).toEqual([]);
});
