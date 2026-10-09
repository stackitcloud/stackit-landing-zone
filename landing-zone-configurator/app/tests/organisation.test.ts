import { createHash, randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { buildApp } from "../apps/api/src/app.js";
import { ApplicationError } from "../apps/api/src/applications/service.js";
import { platformAccessError } from "../apps/api/src/auth/platform-access.js";
import type { AuthServices } from "../apps/api/src/auth/routes.js";
import type { Session } from "../apps/api/src/auth/store.js";
import { applicationOrderDecisionSchema } from "../packages/contracts/src/index.js";

const session: Session = {
  id: randomUUID(),
  userId: randomUUID(),
  tenantId: randomUUID(),
  githubId: "101",
  login: "alice",
  csrfToken: "a".repeat(43),
  expiresAt: new Date(Date.now() + 3600000),
};
const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

it("requires explicit application order decisions and a rejection reason", () => {
  expect(
    applicationOrderDecisionSchema.parse({
      decision: "approved",
      confirmDecision: true,
    }),
  ).toEqual({ decision: "approved", reason: "", confirmDecision: true });
  expect(
    applicationOrderDecisionSchema.parse({
      decision: "rejected",
      reason: "  Not permitted  ",
      confirmDecision: true,
    }).reason,
  ).toBe("Not permitted");
  for (const input of [
    { decision: "approved" },
    { decision: "approved", confirmDecision: false },
    { decision: "rejected", reason: " ", confirmDecision: true },
    { decision: "approved", confirmDecision: true, decidedBy: randomUUID() },
  ])
    expect(applicationOrderDecisionSchema.safeParse(input).success).toBe(false);
});

function runnerSetup() {
  const instanceId = randomUUID();
  const binding = {
    runnerPackageId: randomUUID(),
    acceleratorRevision: "c4b43c36af198985980b17626c48d357795e3fbd",
    providerLockSha256:
      "d40debbff204aee590c2a76d09f6ad3234643329b438fd5c6497de60687f6fa5",
  } as const;
  const applications = {
    runnerInput: vi.fn(async () => ({
      id: "test-application-job",
      mode: "application-plan" as const,
      acceleratorCommit: binding.acceleratorRevision,
      lockHash: binding.providerLockSha256,
      tfvars: "",
      tfvarsSha256: createHash("sha256").update("").digest("hex"),
      key: {
        credentials: {
          kid: randomUUID(),
          iss: "test@sa.stackit.cloud",
          sub: randomUUID(),
          aud: "https://accounts.stackit.cloud" as const,
          privateKey: "test-only-key-never-executed",
        },
      },
      backend: {
        kind: "s3" as const,
        descriptor: {
          bucket: "management-tfstate",
          endpoint: "https://object.storage.eu01.onstackit.cloud" as const,
          region: "eu01" as const,
          key: `applications/${session.tenantId}/${instanceId}/terraform.tfstate`,
          useLockfile: true as const,
        },
        credentials: {
          accessKeyId: "test-only-access",
          secretAccessKey: "test-only-secret",
        },
      },
      application: { tenantId: session.tenantId, instanceId },
    })),
    runnerStage: vi.fn(async () => {}),
    runnerArtifact: vi.fn(async () => ({ sha256: "a".repeat(64) })),
    runnerOutput: vi.fn(async () => {}),
    runnerResult: vi.fn(async () => {}),
  };
  const app = buildApp({ applicationRunner: { applications, binding } });
  apps.push(app);
  return { app, binding, applications };
}

it("keeps application machine routes closed without an explicit trusted package binding", async () => {
  const app = buildApp();
  apps.push(app);
  const reply = await app.inject({
    method: "POST",
    url: "/api/application-runner/input",
    payload: {},
  });
  expect(reply.statusCode).toBe(404);
});

it.each([
  undefined,
  "Bearer short",
  `Basic ${"t".repeat(43)}`,
  `Bearer ${"t".repeat(43)} extra`,
])(
  "rejects malformed application runner authorization: %s",
  async (authorization) => {
    const { app, applications } = runnerSetup();
    const reply = await app.inject({
      method: "POST",
      url: "/api/application-runner/input",
      headers: authorization ? { authorization } : {},
      payload: {},
    });
    expect(reply.statusCode).toBe(401);
    expect(applications.runnerInput).not.toHaveBeenCalled();
  },
);

it("uses server-side application package binding and never accepts browser-selected capabilities", async () => {
  const { app, binding, applications } = runnerSetup();
  const authorization = `Bearer ${"t".repeat(43)}`;
  const invalid = await app.inject({
    method: "POST",
    url: "/api/application-runner/input",
    headers: { authorization },
    payload: { runnerPackageId: randomUUID() },
  });
  expect(invalid.statusCode).toBe(400);
  expect(applications.runnerInput).not.toHaveBeenCalled();
  const reply = await app.inject({
    method: "POST",
    url: "/api/application-runner/input",
    headers: { authorization },
    payload: {},
  });
  expect(reply.statusCode).toBe(200);
  expect(applications.runnerInput).toHaveBeenCalledWith(
    "t".repeat(43),
    binding,
  );
  expect(reply.headers["cache-control"]).toBe("no-store");
  const platform = await app.inject({
    method: "POST",
    url: "/api/runner/input",
    headers: { authorization },
    payload: {},
  });
  expect(platform.statusCode).toBe(404);
});

it.each([
  {
    path: "stage",
    method: "runnerStage",
    payload: { stage: "planning" },
    code: 204,
  },
  {
    path: "artifact",
    method: "runnerArtifact",
    payload: { data: "test" },
    code: 200,
  },
  {
    path: "output",
    method: "runnerOutput",
    payload: { text: "test", truncated: false },
    code: 204,
  },
  {
    path: "result",
    method: "runnerResult",
    payload: { status: "failed", errorCode: "input_invalid" },
    code: 204,
  },
] as const)(
  "routes application $path only with its trusted ticket and package",
  async ({ path, method, payload, code }) => {
    const { app, binding, applications } = runnerSetup();
    const reply = await app.inject({
      method: "POST",
      url: `/api/application-runner/${path}`,
      headers: { authorization: `Bearer ${"t".repeat(43)}` },
      payload,
    });
    expect(reply.statusCode).toBe(code);
    expect(applications[method]).toHaveBeenCalledWith(
      "t".repeat(43),
      binding,
      payload,
    );
  },
);

function setup(dispatchEnabled = false, groupsEnabled = false) {
  const auth: AuthServices = {
    origin: "https://configurator.example",
    clientId: "test",
    store: {
      resolveSession: vi.fn(async () => session),
      beginLogin: vi.fn(),
      consumeLogin: vi.fn(),
      createSession: vi.fn(),
      deleteSession: vi.fn(),
    },
    github: { authorize: vi.fn() },
    tokens: { put: vi.fn(), get: vi.fn(), remove: vi.fn() },
  };
  const service = {
    overview: vi.fn(async () => ({
      userId: session.userId,
      activeTenantId: session.tenantId,
      tenants: [],
      members: [],
    })),
    create: vi.fn(async () => randomUUID()),
    switch: vi.fn(async () => {}),
    archive: vi.fn(async () => {}),
    editMember: vi.fn(async () => {}),
  };
  const applications = {
    listTemplates: vi.fn(async () => []),
    ...(groupsEnabled
      ? {
          listGroups: vi.fn(async () => ({ groups: [], members: [] })),
          createGroup: vi.fn(async (_session: Session, _input: unknown) => ({
            id: randomUUID(),
          })),
          setGroupMembers: vi.fn(
            async (_session: Session, id: string, _input: unknown) => ({ id }),
          ),
          setTemplateGroups: vi.fn(
            async (_session: Session, id: string, _input: unknown) => ({ id }),
          ),
        }
      : {}),
    retire: vi.fn(async () => ({
      versionId: randomUUID(),
      retiredAt: new Date().toISOString(),
      retiredBy: session.userId,
    })),
    listInstances: vi.fn(async () => []),
    outputJob: vi.fn(async () => ({
      text: "Apply complete",
      truncated: false,
      kind: "execution" as const,
    })),
    listExecutionBindings: vi.fn(async () => []),
    configureExecution: vi.fn(
      async (_session: Session, revision: string, input: unknown) => ({
        id: randomUUID(),
        platformRevision: revision,
        enabled: (input as { enabled: boolean }).enabled,
      }),
    ),
    deleteOrder: vi.fn(async (_session: Session, id: string) => ({
      instanceId: id,
      deletedBy: session.userId,
      deletedAt: new Date().toISOString(),
    })),
    decideOrder: vi.fn(
      async (_session: Session, id: string, input: unknown) => ({
        id,
        ...applicationOrderDecisionSchema.parse(input),
      }),
    ),
    listPlatformContracts: vi.fn(async () => []),
    preparePlanInput: vi.fn(async () => {
      throw new ApplicationError(409, "application_platform_contract_required");
    }),
    approvePlatformContract: vi.fn(async () => {
      throw new ApplicationError(403, "application_access_denied");
    }),
    publish: vi.fn(async () => {
      throw new ApplicationError(403, "application_access_denied");
    }),
    ...(dispatchEnabled
      ? {
          executionCapabilities: vi.fn(() => ({
            planEnabled: true,
            applyEnabled: false,
          })),
          listJobs: vi.fn(async () => []),
          prepareJob: vi.fn(
            async (_session: Session, id: string, _input: unknown) => ({
              id: randomUUID(),
              instanceId: id,
              status: "prepared" as const,
              expiresAt: new Date(Date.now() + 60000).toISOString(),
              executionEnabled: false as const,
              cloudPlanExecuted: false as const,
            }),
          ),
          dispatchJob: vi.fn(
            async (_session: Session, jobId: string, _input: unknown) => ({
              jobId,
              dispatched: true,
            }),
          ),
          startPlan: vi.fn(
            async (_session: Session, id: string, _input: unknown) => ({
              jobId: id,
              dispatched: true,
            }),
          ),
          startApply: vi.fn(
            async (_session: Session, id: string, _input: unknown) => ({
              jobId: id,
              dispatched: true,
            }),
          ),
          previewPlan: vi.fn(async (_session: Session, id: string) => ({
            jobId: id,
            artifactSha256: "a".repeat(64),
            resources: [],
          })),
        }
      : {}),
    order: vi.fn(async () => {
      throw new ApplicationError(409, "idempotency_conflict");
    }),
  };
  const app = buildApp({ auth, organisations: service, applications });
  apps.push(app);
  const headers = {
    cookie: `__Host-lzc-session=${"b".repeat(43)}`,
    origin: auth.origin,
    "x-lzc-csrf": session.csrfToken,
    "x-lzc-tenant": session.tenantId,
  };
  return { app, service, headers, applications, auth };
}

it("protects group and template-access mutations with the current tenant, origin and CSRF", async () => {
  const { app, headers, applications } = setup(false, true);
  const groupId = randomUUID();
  const versionId = randomUUID();
  for (const operation of [
    {
      url: "/api/v1/applications/groups",
      payload: { name: "Research" },
      handler: applications.createGroup,
    },
    {
      url: `/api/v1/applications/groups/${groupId}/members`,
      payload: { memberIds: [session.userId], confirmMembershipChange: true },
      handler: applications.setGroupMembers,
    },
    {
      url: `/api/v1/applications/templates/${versionId}/groups`,
      payload: { groupIds: [groupId], confirmAccessChange: true },
      handler: applications.setTemplateGroups,
    },
  ]) {
    for (const rejected of [
      { ...headers, "x-lzc-tenant": randomUUID() },
      { ...headers, "x-lzc-csrf": "" },
      { ...headers, origin: "https://untrusted.example" },
    ])
      expect(
        (
          await app.inject({
            method: "POST",
            url: operation.url,
            headers: rejected,
            payload: operation.payload,
          })
        ).statusCode,
      ).toBe(403);
    expect(operation.handler).not.toHaveBeenCalled();
    expect(
      (
        await app.inject({
          method: "POST",
          url: operation.url,
          headers,
          payload: operation.payload,
        })
      ).statusCode,
    ).toBe(200);
    expect(operation.handler).toHaveBeenCalledTimes(1);
  }
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/applications/groups/not-a-group/members",
        headers,
        payload: { memberIds: [], confirmMembershipChange: true },
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (await app.inject({ url: "/api/v1/applications/groups", headers })).json(),
  ).toEqual({ groups: [], members: [] });
  expect(applications.listGroups).toHaveBeenCalledExactlyOnceWith(session);
  expect(
    (
      await app.inject({ url: "/api/v1/applications/templates", headers })
    ).json(),
  ).toMatchObject({ groupAccessEnabled: true });
});

it("protects one-click application planning and saved-plan apply with strict tenant, origin and CSRF", async () => {
  const { app, applications, headers } = setup(true);
  const id = randomUUID();
  for (const endpoint of [
    {
      path: `instances/${id}/plan`,
      body: { idempotencyKey: randomUUID() },
      method: applications.startPlan,
    },
    {
      path: `jobs/${id}/apply`,
      body: { artifactSha256: "a".repeat(64) },
      method: applications.startApply,
    },
  ]) {
    const url = `/api/v1/applications/${endpoint.path}`;
    for (const invalid of [
      { ...headers, origin: "https://other.example" },
      { ...headers, "x-lzc-csrf": "wrong" },
      { ...headers, "x-lzc-tenant": randomUUID() },
    ])
      expect(
        (
          await app.inject({
            method: "POST",
            url,
            headers: invalid,
            payload: endpoint.body,
          })
        ).statusCode,
      ).toBe(403);
    expect(endpoint.method).not.toHaveBeenCalled();
    expect(
      (
        await app.inject({
          method: "POST",
          url,
          headers,
          payload: { ...endpoint.body, credential: "must-not-be-accepted" },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url,
          headers,
          payload: endpoint.body,
        })
      ).statusCode,
    ).toBe(202);
    expect(endpoint.method).toHaveBeenCalledTimes(1);
  }
  expect(
    (
      await app.inject({
        method: "GET",
        url: `/api/v1/applications/jobs/${id}/preview`,
        headers: { ...headers, "x-lzc-tenant": randomUUID() },
      })
    ).statusCode,
  ).toBe(403);
  expect(applications.previewPlan).not.toHaveBeenCalled();
  expect(
    (
      await app.inject({
        method: "GET",
        url: `/api/v1/applications/jobs/${id}/preview`,
        headers,
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await app.inject({
        url: `/api/v1/applications/jobs/${id}/output`,
        headers: { ...headers, "x-lzc-tenant": randomUUID() },
      })
    ).statusCode,
  ).toBe(403);
  expect(applications.outputJob).not.toHaveBeenCalled();
  const output = await app.inject({
    url: `/api/v1/applications/jobs/${id}/output`,
    headers,
  });
  expect(output.statusCode).toBe(200);
  expect(output.json()).toEqual({
    text: "Apply complete",
    truncated: false,
    kind: "execution",
  });
  expect(output.headers["cache-control"]).toBe("no-store");
  expect(applications.outputJob).toHaveBeenCalledExactlyOnceWith(session, id);
});

it("protects application order decisions with current tenant, origin, CSRF and explicit confirmation", async () => {
  const { app, headers, applications } = setup();
  const id = randomUUID();
  const url = `/api/v1/applications/instances/${id}/decision`;
  const payload = { decision: "approved", confirmDecision: true };
  for (const rejected of [
    { ...headers, "x-lzc-tenant": randomUUID() },
    { ...headers, "x-lzc-csrf": "" },
    { ...headers, origin: "https://untrusted.example" },
  ])
    expect(
      (await app.inject({ method: "POST", url, headers: rejected, payload }))
        .statusCode,
    ).toBe(403);
  for (const invalid of [
    { decision: "approved" },
    { decision: "rejected", confirmDecision: true },
    { ...payload, decidedBy: randomUUID() },
  ])
    expect(
      (await app.inject({ method: "POST", url, headers, payload: invalid }))
        .statusCode,
    ).toBe(400);
  expect(applications.decideOrder).not.toHaveBeenCalled();
  expect(
    (await app.inject({ method: "POST", url, headers, payload })).statusCode,
  ).toBe(200);
  expect(applications.decideOrder).toHaveBeenCalledExactlyOnceWith(
    session,
    id,
    { ...payload, reason: "" },
  );
  applications.decideOrder.mockRejectedValueOnce(
    Object.assign(new Error("application_order_decision_conflict"), {
      code: "40001",
    }),
  );
  expect(
    (await app.inject({ method: "POST", url, headers, payload })).statusCode,
  ).toBe(409);
});

it("protects once-per-platform execution setup and revocation with tenant, origin, CSRF and strict confirmation", async () => {
  const { app, headers, applications } = setup();
  const revision = randomUUID();
  const url = `/api/v1/applications/platform-contracts/${revision}/execution`;
  const payload = {
    enabled: true,
    stateBackendId: randomUUID(),
    confirmExecution: true,
  };
  for (const rejected of [
    { ...headers, "x-lzc-tenant": randomUUID() },
    { ...headers, "x-lzc-csrf": "" },
    { ...headers, origin: "https://untrusted.example" },
  ])
    expect(
      (await app.inject({ method: "POST", url, headers: rejected, payload }))
        .statusCode,
    ).toBe(403);
  for (const invalid of [
    {},
    { ...payload, confirmExecution: false },
    { ...payload, key: "forbidden" },
    { enabled: false },
    { enabled: false, confirmRevocation: false },
  ])
    expect(
      (await app.inject({ method: "POST", url, headers, payload: invalid }))
        .statusCode,
    ).toBe(400);
  expect(applications.configureExecution).not.toHaveBeenCalled();
  expect(
    (await app.inject({ method: "POST", url, headers, payload })).statusCode,
  ).toBe(200);
  expect(applications.configureExecution).toHaveBeenCalledWith(
    expect.any(Object),
    revision,
    payload,
  );
  expect(
    (
      await app.inject({
        method: "POST",
        url,
        headers,
        payload: { enabled: false, confirmRevocation: true },
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await app.inject({
        url: "/api/v1/applications/execution-bindings",
        headers,
      })
    ).json(),
  ).toEqual({ bindings: [] });
});

it("protects pre-execution deletion with tenant, origin, CSRF and explicit confirmation", async () => {
  const { app, headers, applications } = setup();
  const id = randomUUID();
  const url = `/api/v1/applications/instances/${id}`;
  const payload = { confirmDeletion: true };
  for (const rejected of [
    { ...headers, "x-lzc-tenant": randomUUID() },
    { ...headers, "x-lzc-csrf": "" },
    { ...headers, origin: "https://untrusted.example" },
  ])
    expect(
      (await app.inject({ method: "DELETE", url, headers: rejected, payload }))
        .statusCode,
    ).toBe(403);
  for (const invalid of [
    {},
    { confirmDeletion: false },
    { confirmArchive: false },
    { confirmDeletion: true, confirmArchive: true },
    { ...payload, deletedBy: randomUUID() },
  ])
    expect(
      (await app.inject({ method: "DELETE", url, headers, payload: invalid }))
        .statusCode,
    ).toBe(400);
  expect(applications.deleteOrder).not.toHaveBeenCalled();
  expect(
    (
      await app.inject({
        method: "DELETE",
        url,
        headers: { ...headers, cookie: "" },
        payload,
      })
    ).statusCode,
  ).toBe(401);
  expect(
    (await app.inject({ method: "DELETE", url, headers, payload })).statusCode,
  ).toBe(200);
  expect(applications.deleteOrder).toHaveBeenCalledExactlyOnceWith(
    session,
    id,
    payload,
  );
  for (const code of [
    "application_order_execution_started",
    "application_order_deleted",
    "application_order_archive_unavailable",
  ]) {
    applications.deleteOrder.mockRejectedValueOnce(
      Object.assign(new Error(code), { code: "40001" }),
    );
    expect(
      (await app.inject({ method: "DELETE", url, headers, payload })).json(),
    ).toEqual({ error: code });
  }
  const archive = { confirmArchive: true };
  for (const rejected of [
    { ...headers, "x-lzc-tenant": randomUUID() },
    { ...headers, "x-lzc-csrf": "" },
    { ...headers, origin: "https://untrusted.example" },
  ])
    expect(
      (
        await app.inject({
          method: "DELETE",
          url,
          headers: rejected,
          payload: archive,
        })
      ).statusCode,
    ).toBe(403);
  expect(
    (await app.inject({ method: "DELETE", url, headers, payload: archive }))
      .statusCode,
  ).toBe(200);
  expect(applications.deleteOrder).toHaveBeenLastCalledWith(
    session,
    id,
    archive,
  );
});

it("reports actual plan capabilities and protects job reads with the current tenant", async () => {
  const disabled = setup();
  const unavailable = await disabled.app.inject({
    method: "GET",
    url: "/api/v1/applications/instances",
    headers: disabled.headers,
  });
  expect(unavailable.json()).toMatchObject({
    planJobsEnabled: false,
    execution: { planEnabled: false, applyEnabled: false },
  });
  const { app, headers, applications } = setup(true);
  const enabled = await app.inject({
    method: "GET",
    url: "/api/v1/applications/instances",
    headers,
  });
  expect(enabled.json()).toMatchObject({
    planJobsEnabled: true,
    execution: { planEnabled: true, applyEnabled: false },
  });
  const id = randomUUID();
  const url = `/api/v1/applications/instances/${id}/jobs`;
  expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
  expect(
    (
      await app.inject({
        method: "GET",
        url,
        headers: { ...headers, "x-lzc-tenant": randomUUID() },
      })
    ).statusCode,
  ).toBe(403);
  expect(applications.listJobs).not.toHaveBeenCalled();
  const reply = await app.inject({ method: "GET", url, headers });
  expect(reply.statusCode).toBe(200);
  expect(reply.json()).toEqual({ jobs: [] });
  expect(applications.listJobs).toHaveBeenCalledExactlyOnceWith(session, id);
});

it("requires current tenant, origin, CSRF and explicit plan confirmation before application dispatch", async () => {
  const { app, headers, applications } = setup(true);
  const jobId = randomUUID();
  const url = `/api/v1/applications/jobs/${jobId}/dispatch`;
  const payload = { confirmPlan: true };
  for (const rejected of [
    { ...headers, "x-lzc-tenant": randomUUID() },
    { ...headers, "x-lzc-csrf": "" },
    { ...headers, origin: "https://untrusted.example" },
  ])
    expect(
      (await app.inject({ method: "POST", url, headers: rejected, payload }))
        .statusCode,
    ).toBe(403);
  for (const invalid of [
    {},
    { confirmPlan: false },
    { confirmPlan: true, runnerPackageId: randomUUID() },
  ])
    expect(
      (await app.inject({ method: "POST", url, headers, payload: invalid }))
        .statusCode,
    ).toBe(400);
  expect(applications.dispatchJob).not.toHaveBeenCalled();
  const reply = await app.inject({ method: "POST", url, headers, payload });
  expect(reply.statusCode).toBe(202);
  expect(reply.json()).toEqual({ jobId, dispatched: true });
  expect(applications.dispatchJob).toHaveBeenCalledExactlyOnceWith(
    session,
    jobId,
    payload,
  );
  applications.dispatchJob?.mockRejectedValueOnce(
    Object.assign(new Error("application_instance_running"), { code: "40001" }),
  );
  const conflict = await app.inject({ method: "POST", url, headers, payload });
  expect(conflict.statusCode).toBe(409);
  expect(conflict.json()).toEqual({ error: "application_instance_running" });
});

it("keeps application dispatch disabled when the service has no runner capability", async () => {
  const { app, headers } = setup();
  const reply = await app.inject({
    method: "POST",
    url: `/api/v1/applications/jobs/${randomUUID()}/dispatch`,
    headers,
    payload: { confirmPlan: true },
  });
  expect(reply.statusCode).toBe(503);
  expect(reply.json()).toEqual({ error: "application_dispatch_disabled" });
});

it("protects template retirement with current tenant, origin, CSRF and a valid version ID", async () => {
  const { app, headers, applications } = setup();
  const versionId = randomUUID();
  const url = `/api/v1/applications/templates/${versionId}/retire`;
  const payload = { confirmRetirement: true };
  expect(
    (await app.inject({ method: "POST", url, headers, payload })).statusCode,
  ).toBe(200);
  expect(applications.retire).toHaveBeenCalledWith(session, versionId, payload);
  applications.retire.mockClear();
  for (const rejected of [
    { ...headers, "x-lzc-tenant": randomUUID() },
    { ...headers, "x-lzc-csrf": "" },
    { ...headers, origin: "https://untrusted.example" },
  ])
    expect(
      (await app.inject({ method: "POST", url, headers: rejected, payload }))
        .statusCode,
    ).toBe(403);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/applications/templates/not-a-version/retire",
        headers,
        payload,
      })
    ).statusCode,
  ).toBe(400);
  expect(applications.retire).not.toHaveBeenCalled();
});

it("allows organisation platform engineers to access credentials, catalogues and platform plans but denies application owners", () => {
  const engineer = {
    ...session,
    tenantKind: "organisation" as const,
    productRoles: ["platform-engineer" as const],
  };
  const owner = { ...engineer, productRoles: ["application-owner" as const] };
  for (const path of [
    "/api/v1/credentials",
    "/api/v1/cloud-catalogues/automatic",
    "/api/v1/preparations",
    "/api/v1/plans",
  ]) {
    expect(platformAccessError(engineer, path)).toBeNull();
    expect(platformAccessError(owner, path)).toBe("platform_engineer_required");
  }
});

it("keeps the original authenticated tenant throughout an application request", async () => {
  const { app, applications, headers, auth } = setup();
  vi.mocked(auth.store.resolveSession)
    .mockResolvedValueOnce(session)
    .mockResolvedValueOnce({ ...session, tenantId: randomUUID() });
  expect(
    (await app.inject({ url: "/api/v1/applications/templates", headers }))
      .statusCode,
  ).toBe(200);
  expect(auth.store.resolveSession).toHaveBeenCalledTimes(1);
  expect(applications.listTemplates).toHaveBeenCalledWith(session);
});

it("scopes every application read and mutation to the authenticated active tenant", async () => {
  const { app, applications, headers } = setup();
  for (const resource of ["templates", "instances"]) {
    const url = `/api/v1/applications/${resource}`;
    expect((await app.inject({ url })).statusCode).toBe(401);
    expect(
      (await app.inject({ url, headers: { cookie: headers.cookie } }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url,
          headers: { ...headers, "x-lzc-tenant": randomUUID() },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url,
          headers: { ...headers, origin: "https://attacker.example" },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url,
          headers: { cookie: headers.cookie, "x-lzc-tenant": session.tenantId },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
  }
  for (const operation of Object.values(applications))
    expect(operation).not.toHaveBeenCalled();
  expect(
    (
      await app.inject({ url: "/api/v1/applications/templates", headers })
    ).json(),
  ).toEqual({
    versions: [],
    retirementEnabled: true,
    deploymentPolicyEnabled: true,
  });
  expect(applications.listTemplates).toHaveBeenCalledWith(session);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/applications/templates",
        headers,
        payload: {},
      })
    ).json(),
  ).toEqual({ error: "application_access_denied" });
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/applications/instances",
        headers,
        payload: {},
      })
    ).statusCode,
  ).toBe(409);
});
it("requires authentication and same-origin CSRF on all organisation mutations", async () => {
  const { app, service, headers } = setup();
  const endpoints = [
    {
      method: "POST" as const,
      url: "/api/v1/organisation",
      payload: { name: "Team", organizationId: randomUUID() },
    },
    {
      method: "POST" as const,
      url: "/api/v1/organisation/switch",
      payload: { tenantId: randomUUID() },
    },
    {
      method: "PUT" as const,
      url: "/api/v1/organisation/members",
      payload: {
        userId: randomUUID(),
        roles: ["application-owner"],
        manageMembers: false,
      },
    },
    {
      method: "DELETE" as const,
      url: `/api/v1/organisation/members/${randomUUID()}`,
    },
  ];
  for (const endpoint of endpoints) {
    expect((await app.inject(endpoint)).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          ...endpoint,
          headers: { ...headers, origin: "https://attacker.example" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          ...endpoint,
          headers: { cookie: headers.cookie, origin: headers.origin },
        })
      ).statusCode,
    ).toBe(403);
  }
  expect((await app.inject({ url: "/api/v1/organisation" })).statusCode).toBe(
    401,
  );
  for (const operation of Object.values(service))
    expect(operation).not.toHaveBeenCalled();
});
it("rejects identity injection and malformed membership requests before service access", async () => {
  const { app, service, headers } = setup();
  for (const payload of [
    { userId: randomUUID(), roles: ["admin"], manageMembers: true },
    {
      userId: randomUUID(),
      roles: ["application-owner"],
      manageMembers: false,
      tenantId: randomUUID(),
    },
    {
      userId: "someone@example.com",
      roles: ["application-owner"],
      manageMembers: false,
    },
  ]) {
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/api/v1/organisation/members",
          headers,
          payload,
        })
      ).statusCode,
    ).toBe(400);
  }
  expect(service.editMember).not.toHaveBeenCalled();
});
it("uses only server-resolved identity and sanitizes database errors", async () => {
  const { app, service, headers } = setup();
  const payload = { name: "Team", organizationId: randomUUID() };
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/organisation",
        headers,
        payload,
      })
    ).statusCode,
  ).toBe(201);
  expect(service.create).toHaveBeenCalledWith(
    session,
    payload.name,
    payload.organizationId,
  );
  for (const [code, status, error] of [
    ["42501", 403, "membership_management_forbidden"],
    ["23503", 400, "registered_user_required"],
    ["23514", 409, "membership_constraints"],
    ["unexpected", 503, "organisation_operation_failed"],
  ] as const) {
    service.editMember.mockRejectedValueOnce(
      Object.assign(new Error("private SQL detail"), { code }),
    );
    const response = await app.inject({
      method: "DELETE",
      url: `/api/v1/organisation/members/${randomUUID()}`,
      headers,
    });
    expect(response.statusCode).toBe(status);
    expect(response.json()).toEqual({ error });
    expect(response.body).not.toContain("private SQL");
  }
});

it("rejects stale workspace headers before membership mutations", async () => {
  const { app, service, headers } = setup();
  const response = await app.inject({
    method: "DELETE",
    url: `/api/v1/organisation/members/${randomUUID()}`,
    headers: { ...headers, "x-lzc-tenant": randomUUID() },
  });
  expect(response.statusCode).toBe(409);
  expect(response.json()).toEqual({ error: "stale_tenant_context" });
  expect(service.editMember).not.toHaveBeenCalled();
});

it("protects draft deletion with authentication, CSRF and explicit target context", async () => {
  const { app, service, headers } = setup();
  const id = randomUUID();
  const url = `/api/v1/organisation/workspaces/${id}`;
  expect((await app.inject({ method: "DELETE", url })).statusCode).toBe(401);
  expect(
    (
      await app.inject({
        method: "DELETE",
        url,
        headers: { ...headers, origin: "https://evil.example" },
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (await app.inject({ method: "DELETE", url, headers })).statusCode,
  ).toBe(409);
  expect(service.archive).not.toHaveBeenCalled();
  expect(
    (
      await app.inject({
        method: "DELETE",
        url,
        headers: { ...headers, "x-lzc-tenant": id },
      })
    ).statusCode,
  ).toBe(200);
  expect(service.archive).toHaveBeenCalledWith(session, id);
  service.archive.mockRejectedValueOnce(
    Object.assign(new Error("private detail"), { code: "55000" }),
  );
  const response = await app.inject({
    method: "DELETE",
    url,
    headers: { ...headers, "x-lzc-tenant": id },
  });
  expect(response.statusCode).toBe(409);
  expect(response.json()).toEqual({ error: "organisation_not_empty_draft" });
});
