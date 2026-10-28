import { createHash, randomUUID } from "node:crypto";
import {
  applicationExecutionCurrentRevision,
  applicationExecutionProfiles,
} from "@lzc/contracts";
import type pg from "pg";
import { describe, expect, it, vi } from "vitest";
import { availableApplicationExecutionContext } from "../apps/api/src/applications/execution-lifecycle.js";
import { Applications } from "../apps/api/src/applications/service.js";
import type { Session } from "../apps/api/src/auth/store.js";
import type { PlanRunner } from "../apps/api/src/plans/cloud-foundry.js";

const old = "9e7fb46c329aca32e878ce1f0ea3b944ea240354";
const current = applicationExecutionCurrentRevision;
const session = {
  id: randomUUID(),
  userId: randomUUID(),
  tenantId: randomUUID(),
  expiresAt: new Date(Date.now() + 3600000),
  githubId: "test",
  login: "test",
  csrfToken: "c".repeat(43),
} satisfies Session;
const context = () => ({
  revision: old,
  originRevision: old,
  bindingId: null,
  lastAppliedRevision: old,
  sourceStatus: "supported",
  replacementRevision: current,
  canUpgrade: true,
  blockers: [],
});
function fixture() {
  let value: unknown = context();
  const query = vi.fn(async (sql: string, _values?: unknown[]) => ({
    rows: sql.includes("application_runner_binding")
      ? [{ binding: value }]
      : [{ context: value }],
  }));
  const client = { query, release: vi.fn() };
  const pool = {
    query,
    connect: vi.fn(async () => client),
  } as unknown as pg.Pool;
  const runner = {
    start: vi.fn(),
    remove: vi.fn(),
    supportsAccelerator: vi.fn((revision: string) =>
      applicationExecutionProfiles.some(
        (p) => p.revision === revision && p.status === "supported",
      ),
    ),
  } as unknown as PlanRunner;
  const service = new Applications(pool, undefined, undefined, undefined, {
    runner,
    origin: "https://configurator.example",
  });
  return {
    service,
    pool,
    query,
    runner,
    set(next: unknown) {
      value = next;
    },
  };
}
describe("existing Application execution binding", () => {
  it("keeps a historical order executable with a current multi-source runner without writing State or jobs", async () => {
    const f = fixture();
    expect(
      await f.service.executionLifecycle(session, randomUUID()),
    ).toMatchObject({
      revision: old,
      originRevision: old,
      lastAppliedRevision: old,
      sourceStatus: "supported",
      canUpgrade: true,
    });
    expect(
      f.query.mock.calls.some(([sql]) => /INSERT|UPDATE|DELETE/.test(sql)),
    ).toBe(false);
    expect(f.runner.start).not.toHaveBeenCalled();
  });
  it("separates an unavailable package from withdrawal while retaining its reviewed replacement", () => {
    const f = fixture();
    vi.mocked(f.runner.supportsAccelerator!).mockImplementation(
      (r) => r === current,
    );
    expect(
      availableApplicationExecutionContext(context(), f.runner),
    ).toMatchObject({
      sourceStatus: "unavailable",
      canUpgrade: true,
      blockers: ["application_execution_package_unavailable"],
    });
    expect(
      availableApplicationExecutionContext(
        { ...context(), sourceStatus: "withdrawn" },
        f.runner,
      ),
    ).toMatchObject({ sourceStatus: "withdrawn", canUpgrade: true });
  });
  it("switches only desired binding through expected-source CAS and explicit confirmation", async () => {
    const f = fixture(),
      id = randomUUID(),
      bindingId = randomUUID();
    f.set({ ...context(), revision: current, bindingId, canUpgrade: false });
    expect(
      await f.service.upgradeExecution(session, id, {
        targetRevision: current,
        expectedRevision: old,
        confirmUpgrade: true,
      }),
    ).toMatchObject({ revision: current, lastAppliedRevision: old, bindingId });
    expect(f.query).toHaveBeenCalledWith(
      "SELECT lzc_auth.upgrade_application_execution($1,$2,$3,$4,$5) AS context",
      [session.id, id, current, old, true],
    );
    expect(f.runner.start).not.toHaveBeenCalled();
    expect(
      f.query.mock.calls.some(
        ([sql]) =>
          sql.includes("application_jobs") || sql.includes("state_push"),
      ),
    ).toBe(false);
  });
  it("rejects arbitrary or unpackaged upgrade targets before any binding mutation", async () => {
    const f = fixture();
    await expect(
      f.service.upgradeExecution(session, randomUUID(), {
        targetRevision: "a".repeat(40),
        expectedRevision: old,
        confirmUpgrade: true,
      }),
    ).rejects.toThrow("application_execution_package_unavailable");
    vi.mocked(f.runner.supportsAccelerator!).mockReturnValue(false);
    await expect(
      f.service.upgradeExecution(session, randomUUID(), {
        targetRevision: current,
        expectedRevision: old,
        confirmUpgrade: true,
      }),
    ).rejects.toThrow("application_execution_package_unavailable");
    expect(f.pool.connect).not.toHaveBeenCalled();
  });
  it.each([
    {},
    { targetRevision: current, expectedRevision: old },
    { targetRevision: current, expectedRevision: old, confirmUpgrade: false },
    {
      targetRevision: current,
      expectedRevision: old,
      confirmUpgrade: true,
      stateKey: "override",
    },
  ])("rejects incomplete or injected upgrades %#", async (input) => {
    const f = fixture();
    await expect(
      f.service.upgradeExecution(session, randomUUID(), input),
    ).rejects.toThrow();
    expect(f.pool.connect).not.toHaveBeenCalled();
  });
  it("derives original in-flight package/source from the ticket capability across API releases", async () => {
    const f = fixture();
    const trusted = {
      runnerPackageId: randomUUID(),
      acceleratorRevision: current,
      providerLockSha256:
        "d40debbff204aee590c2a76d09f6ad3234643329b438fd5c6497de60687f6fa5",
    };
    const original = {
      ...trusted,
      runnerPackageId: randomUUID(),
      acceleratorRevision: old,
    };
    f.set(original);
    const ticket = "t".repeat(43);
    expect(await f.service.resolveRunnerBinding(ticket, trusted)).toEqual(
      original,
    );
    expect(f.query).toHaveBeenCalledWith(
      "SELECT lzc_auth.application_runner_binding($1,$2) AS binding",
      [
        createHash("sha256").update(ticket).digest("base64url"),
        trusted.providerLockSha256,
      ],
    );
    f.set(null);
    await expect(
      f.service.resolveRunnerBinding(ticket, trusted),
    ).rejects.toThrow("invalid_application_runner_ticket");
  });
});

// The live advice oracle must reject the old "order again" workaround.
it("requires lifecycle advice to retain the order and State with an explicit upgrade/Apply boundary", async () => {
  const { assistantExecutionLifecycleFailures } = await import(
    "../scripts/assistant-scenarios.js"
  );
  const complete =
    "Die ursprüngliche Template-Quelle bleibt erhalten; die gewünschte Revision ist separat vom zuletzt erfolgreichen Apply. Bestehende Bestellung und State bleiben erhalten. Die Quelle bleibt gebunden. Upgrade benötigt einen neuen Plan und die normale Apply-Freigabe. Eine zurückgezogene Quelle braucht einen geprüften Ersatz; keine Neubestellung.";
  expect(assistantExecutionLifecycleFailures(complete)).toEqual([]);
  expect(
    assistantExecutionLifecycleFailures(
      complete.replace(
        "Upgrade benötigt einen neuen Plan",
        "Upgrade: Danach ist ein separater Plan erforderlich",
      ),
    ),
  ).toEqual([]);
  expect(
    assistantExecutionLifecycleFailures(
      complete.replace(
        "keine Neubestellung",
        "ein Neubestellen ist nicht erforderlich",
      ),
    ),
  ).toEqual([]);
  expect(
    assistantExecutionLifecycleFailures(
      "Veröffentliche eine neue Revision und bestelle erneut.",
    ),
  ).toEqual(
    expect.arrayContaining([
      "application_execution_missing_same-order",
      "application_execution_missing_state",
      "application_execution_missing_fresh-plan",
      "application_execution_missing_apply-approval",
      "application_execution_missing_withdrawal",
      "application_execution_missing_no-reorder",
    ]),
  );
});

it.each([
  [
    "lastApplied bleibt die Basis für Recovery.",
    "application_execution_confuses_state_with_last_applied",
  ],
  [
    "Der neue Plan zeigt Änderungen gegenüber lastApplied.",
    "application_execution_confuses_state_with_last_applied",
  ],
  [
    "Ein neuer Plan ist nicht nötig.",
    "application_execution_denies_fresh_plan",
  ],
  [
    "Apply braucht keine Freigabe.",
    "application_execution_denies_apply_approval",
  ],
  [
    "Zurückgezogene Quellen laufen automatisch weiter.",
    "application_execution_runs_withdrawn_source",
  ],
  [
    "Der State bleibt unverändert auf dem zuletzt erfolgreichen Stand.",
    "application_execution_promises_unchanged_failed_state",
  ],
  [
    "Sie können erneut versuchen, ohne Datenverlust.",
    "application_execution_promises_no_data_loss",
  ],
  [
    "Gewünschter Stand: Ihre aktuelle Konfiguration rm_folders.",
    "application_execution_confuses_desired_source",
  ],
  [
    "Sie können weiterhin manuell bearbeiten und anwenden.",
    "application_execution_manual_withdrawal_bypass",
  ],
  [
    "Ich führe das Upgrade hier im Chat aus.",
    "application_execution_claims_chat_upgrade",
  ],
])("rejects contradictory lifecycle advice: %s", async (claim, failure) => {
  const { assistantExecutionLifecycleFailures } = await import(
    "../scripts/assistant-scenarios.js"
  );
  expect(assistantExecutionLifecycleFailures(claim)).toContain(failure);
});
it("accepts explicit prohibitions on unapproved or withdrawn execution", async () => {
  const { assistantExecutionLifecycleFailures } = await import(
    "../scripts/assistant-scenarios.js"
  );
  const failures = assistantExecutionLifecycleFailures(
    "Apply ohne Freigabe ist nicht zulässig. Zurückgezogene Quellen dürfen nicht automatisch weiterlaufen. Der Chat führt kein Upgrade aus.",
  );
  expect(failures).not.toContain("application_execution_denies_apply_approval");
  expect(failures).not.toContain("application_execution_runs_withdrawn_source");
  expect(failures).not.toContain("application_execution_claims_chat_upgrade");
  expect(
    assistantExecutionLifecycleFailures(
      "Beim reinen Upgrade bleibt der State unverändert auf seinem aktuellen Stand; geändert wird nur die gewünschte Ausführungsbindung.",
    ),
  ).not.toContain("application_execution_promises_unchanged_failed_state");
});
