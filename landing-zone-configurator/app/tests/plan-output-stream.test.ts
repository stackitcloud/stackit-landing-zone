import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { PlanOutput } from "@lzc/contracts";
import { expect, it, vi } from "vitest";
import { buildApp } from "../apps/api/src/app.js";
import type { AuthServices } from "../apps/api/src/auth/routes.js";
import type { Session } from "../apps/api/src/auth/store.js";
import { CredentialError } from "../apps/api/src/credentials/profiles.js";
import { readPlanOutput } from "../apps/web/src/plan-output.js";

async function fixture() {
  const session: Session = {
    id: randomUUID(),
    userId: randomUUID(),
    tenantId: randomUUID(),
    githubId: "101",
    login: "alice",
    csrfToken: "c".repeat(43),
    expiresAt: new Date(Date.now() + 3600000),
  };
  const resolveSession = vi.fn(async (): Promise<Session | null> => session);
  const auth: AuthServices = {
    origin: "https://configurator.example",
    clientId: "test",
    store: {
      resolveSession,
      beginLogin: vi.fn(),
      consumeLogin: vi.fn(),
      createSession: vi.fn(),
      deleteSession: vi.fn(),
    },
    github: { authorize: vi.fn() },
    tokens: { get: vi.fn(), put: vi.fn(), remove: vi.fn() },
  };
  const current: { output: PlanOutput } = {
    output: { text: "Refreshing state...\n", truncated: false, kind: "live" },
  };
  const output = vi.fn(async () => current.output);
  const waitForOutput = vi.fn(async (_id: string, signal: AbortSignal) =>
    delay(10, undefined, { signal }),
  );
  const app = buildApp({
    auth,
    plans: {
      list: vi.fn(),
      start: vi.fn(),
      cancel: vi.fn(),
      input: vi.fn(),
      stage: vi.fn(),
      result: vi.fn(),
      output,
      waitForOutput,
    },
  });
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  const url = `${address}/api/v1/plans/${randomUUID()}/output`;
  const headers = {
    cookie: `__Host-lzc-session=${"b".repeat(43)}`,
    accept: "application/x-ndjson",
  };
  return {
    app,
    url,
    headers,
    current,
    session,
    resolveSession,
    output,
    waitForOutput,
  };
}

it("delivers output over a real open HTTP connection before the terminal result", async () => {
  const f = await fixture();
  try {
    const response = await fetch(f.url, { headers: f.headers });
    expect(response.headers.get("content-type")).toContain(
      "application/x-ndjson",
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    const updates: PlanOutput[] = [];
    const reading = readPlanOutput(response, (value) => updates.push(value));
    await expect.poll(() => updates.length).toBe(1);
    expect(updates[0]?.text).toContain("Refreshing state...");
    expect(f.current.output.kind).toBe("live");
    f.current.output = {
      text: "Full saved plan\n",
      truncated: false,
      kind: "execution",
    };
    await reading;
    expect(updates.at(-1)).toEqual(f.current.output);
    expect(f.resolveSession.mock.calls.length).toBeGreaterThan(1);
  } finally {
    await f.app.close();
  }
});

it.each(["session", "tenant", "role", "owner"] as const)(
  "stops an open stream when %s access is revoked",
  async (revoked) => {
    const f = await fixture();
    try {
      const response = await fetch(f.url, { headers: f.headers });
      const updates: PlanOutput[] = [];
      const reading = readPlanOutput(response, (value) => updates.push(value));
      await expect.poll(() => updates.length).toBe(1);
      const denied = expect(reading).rejects.toThrow(
        revoked === "session" || revoked === "tenant"
          ? "Bitte erneut anmelden."
          : "Keine Berechtigung",
      );
      if (revoked === "session") f.resolveSession.mockResolvedValue(null);
      else if (revoked === "tenant")
        f.resolveSession.mockResolvedValue({
          ...f.session,
          tenantId: randomUUID(),
        });
      else
        f.output.mockRejectedValue(
          new CredentialError(
            revoked === "role" ? 403 : 404,
            revoked === "role" ? "credential_role_required" : "plan_not_found",
          ),
        );
      await denied;
      expect(updates).toHaveLength(1);
    } finally {
      await f.app.close();
    }
  },
);

it("rejects unauthenticated streams and releases polling after a disconnect", async () => {
  const f = await fixture();
  const controller = new AbortController();
  try {
    expect((await fetch(f.url)).status).toBe(401);
    expect(f.output).not.toHaveBeenCalled();
    const response = await fetch(f.url, {
      headers: f.headers,
      signal: controller.signal,
    });

    const updates: PlanOutput[] = [];
    const reading = readPlanOutput(response, (value) => updates.push(value));
    await expect.poll(() => updates.length).toBe(1);
    const aborted = expect(reading).rejects.toThrow();
    controller.abort();
    await aborted;
    await delay(30);
    const reads = f.output.mock.calls.length;
    await delay(50);
    expect(f.output).toHaveBeenCalledTimes(reads);
  } finally {
    controller.abort();
    f.app.server.closeAllConnections();
    await f.app.close();
  }
});

it("bounds concurrent streams per owner and makes the slot reusable after disconnect", async () => {
  const f = await fixture();
  const controllers: AbortController[] = [];
  try {
    for (let index = 0; index < 8; index++) {
      const controller = new AbortController();
      controllers.push(controller);
      const response = await fetch(f.url, {
        headers: f.headers,
        signal: controller.signal,
      });
      expect(response.status).toBe(200);
    }
    const denied = await fetch(f.url, { headers: f.headers });
    expect(denied.status).toBe(429);
    expect(denied.headers.get("retry-after")).toBe("2");
    expect(await denied.json()).toEqual({
      error: "plan_output_stream_limit",
    });
    controllers[0]?.abort();
    await delay(30);
    const controller = new AbortController();
    controllers.push(controller);
    const resumed = await fetch(f.url, {
      headers: f.headers,
      signal: controller.signal,
    });
    expect(resumed.status).toBe(200);
  } finally {
    for (const controller of controllers) controller.abort();
    f.app.server.closeAllConnections();
    await f.app.close();
  }
});
