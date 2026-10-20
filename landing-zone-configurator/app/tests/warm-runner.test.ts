import { once } from "node:events";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { runWarmRunner } from "../apps/worker/src/warm-runner.js";

const trusted = vi.hoisted(() => ({ origin: "" }));
vi.mock("../apps/worker/src/runner.js", () => ({
  get brokerOrigin() {
    return trusted.origin;
  },
  runWorker: vi.fn(() => {
    throw new Error("Unexpected real worker invocation");
  }),
}));

const poolId = "11111111-1111-4111-8111-111111111111";
const jobId = "22222222-2222-4222-8222-222222222222";
const bootstrapTicket = "b".repeat(43);
const jobTicket = "j".repeat(43);
const claimed = { id: jobId, ticket: jobTicket, broker: "application" };
let respond: (response: ServerResponse) => void;
let requests: {
  method: string | undefined;
  path: string | undefined;
  auth: string | undefined;
  body: string;
}[];
const server = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  requests.push({
    method: request.method,
    path: request.url,
    auth: request.headers.authorization,
    body,
  });
  respond(response);
});
let controller: AbortController;
const execute =
  vi.fn<typeof import("../apps/worker/src/runner.js").runWorker>();
const run = (
  env: NodeJS.ProcessEnv = {},
  dependencies: Parameters<typeof runWarmRunner>[1] = {},
) =>
  runWarmRunner(
    {
      root: "/immutable/runner-package",
      signal: controller.signal,
      env: {
        LZC_POOL_RUNNER_ID: poolId,
        LZC_POOL_TICKET: bootstrapTicket,
        LZC_BROKER_ORIGIN: trusted.origin,
        ...env,
      },
    },
    { execute, ...dependencies },
  );

beforeEach(async () => {
  controller = new AbortController();
  requests = [];
  execute.mockReset().mockResolvedValue("succeeded");
  respond = (response) => response.end(JSON.stringify(claimed));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  trusted.origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  controller.abort();
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  vi.restoreAllMocks();
});

it("waits idle on 204, then executes exactly one job in the same process", async () => {
  respond = (response) => {
    expect(execute).not.toHaveBeenCalled();
    if (requests.length === 1) response.writeHead(204).end();
    else response.end(JSON.stringify(claimed));
  };
  expect(await run()).toBe("succeeded");
  expect(requests).toEqual(
    Array.from({ length: 2 }, () => ({
      method: "POST",
      path: `/api/internal/runner-pool/${poolId}/claim`,
      auth: `Bearer ${bootstrapTicket}`,
      body: "",
    })),
  );
  expect(execute).toHaveBeenCalledExactlyOnceWith({
    root: "/immutable/runner-package",
    brokerOrigin: trusted.origin,
    ...claimed,
  });
});

it.each(["failed", "succeeded"] as const)(
  "does not claim again after job outcome %s",
  async (outcome) => {
    execute.mockResolvedValue(outcome);
    expect(await run()).toBe(outcome);
    expect(requests).toHaveLength(1);
    expect(execute).toHaveBeenCalledTimes(1);
  },
);

it("does not claim again when execution or its callback throws", async () => {
  execute.mockRejectedValue(new Error("callback failed"));
  await expect(run()).rejects.toThrow("callback failed");
  expect(requests).toHaveLength(1);
  expect(execute).toHaveBeenCalledTimes(1);
});

it("takes the platform profile only from the assignment and retains the package root", async () => {
  respond = (response) =>
    response.end(JSON.stringify({ ...claimed, broker: "platform" }));
  await run({
    LZC_RUNNER_BROKER: "application",
    LZC_RUNNER_PACKAGE_ROOT: "/untrusted-package",
  });
  expect(execute).toHaveBeenCalledExactlyOnceWith({
    root: "/immutable/runner-package",
    id: jobId,
    ticket: jobTicket,
    broker: "platform",
    brokerOrigin: trusted.origin,
  });
});

it.each([
  "{not JSON",
  "null",
  "[]",
  JSON.stringify({ ...claimed, id: "bad-id" }),
  JSON.stringify({ ...claimed, ticket: "short" }),
  JSON.stringify({ ...claimed, ticket: `${jobTicket.slice(1)}+` }),
  JSON.stringify({ ...claimed, broker: "foreign" }),
  JSON.stringify({ id: jobId, ticket: jobTicket }),
  JSON.stringify({ ...claimed, brokerOrigin: "https://foreign.invalid" }),
  JSON.stringify({ ...claimed, url: "https://foreign.invalid/claim" }),
  JSON.stringify({ ...claimed, root: "/foreign" }),
  JSON.stringify({ ...claimed, code: "untrusted" }),
  JSON.stringify({ ...claimed, source: "untrusted" }),
  "x".repeat(4097),
])(
  "rejects malformed or overriding assignments without retry (%#)",
  async (body) => {
    respond = (response) => response.end(body);
    await expect(run()).rejects.toThrow("Warm runner claim failed");
    expect(requests).toHaveLength(1);
    expect(execute).not.toHaveBeenCalled();
  },
);

it.each([201, 202, 400, 401, 403, 404, 409, 429, 500, 503])(
  "fails on HTTP %s without exposing response data or retrying",
  async (status) => {
    respond = (response) =>
      response.writeHead(status).end(`${bootstrapTicket} ${jobTicket}`);
    let error: unknown;
    try {
      await run();
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain(bootstrapTicket);
    expect(String(error)).not.toContain(jobTicket);
    expect(requests).toHaveLength(1);
    expect(execute).not.toHaveBeenCalled();
  },
);

it.each([301, 302, 303, 307, 308])(
  "never follows HTTP %s redirects or forwards the bootstrap ticket",
  async (status) => {
    respond = (response) =>
      response
        .writeHead(status, { Location: `${trusted.origin}/foreign` })
        .end();
    await expect(run()).rejects.toThrow("Warm runner claim failed");
    expect(requests).toHaveLength(1);
    expect(execute).not.toHaveBeenCalled();
  },
);

it("does not contact a foreign redirect target", async () => {
  const foreignRequests = vi.fn();
  const foreign = createServer((_, response) => {
    foreignRequests();
    response.end(JSON.stringify(claimed));
  });
  foreign.listen(0, "127.0.0.1");
  await once(foreign, "listening");
  try {
    respond = (response) =>
      response
        .writeHead(307, {
          Location: `http://127.0.0.1:${(foreign.address() as AddressInfo).port}/claim`,
        })
        .end();
    await expect(run()).rejects.toThrow("Warm runner claim failed");
    expect(requests).toHaveLength(1);
    expect(foreignRequests).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  } finally {
    foreign.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      foreign.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

it.each([
  { LZC_POOL_RUNNER_ID: undefined },
  { LZC_POOL_TICKET: undefined },
  { LZC_POOL_RUNNER_ID: "" },
  { LZC_POOL_RUNNER_ID: "not-a-uuid" },
  { LZC_POOL_TICKET: "" },
  { LZC_POOL_TICKET: "b".repeat(42) },
  { LZC_POOL_TICKET: "b".repeat(44) },
  { LZC_POOL_TICKET: `${"b".repeat(42)}\n` },
  { LZC_POOL_TICKET: `${"b".repeat(42)}/` },
  { LZC_RUN_ID: jobId },
  { LZC_RUN_TICKET: jobTicket },
  { LZC_RUN_ID: "" },
  { LZC_LOCAL_RUNNER: "true" },
  { LZC_BROKER_ORIGIN: undefined },
  { LZC_BROKER_ORIGIN: "https://foreign.invalid" },
  { LZC_BROKER_ORIGIN: "http://user:password@127.0.0.1" },
])(
  "validates bootstrap configuration before any HTTP or job (%#)",
  async (env) => {
    await expect(run(env)).rejects.toThrow("Warm runner configuration invalid");
    expect(requests).toHaveLength(0);
    expect(execute).not.toHaveBeenCalled();
  },
);

it("accepts base64url bootstrap tokens without decoding or substituting job credentials", async () => {
  const token = `${"-_".repeat(21)}a`;
  await run({ LZC_POOL_TICKET: token });
  expect(requests[0]?.auth).toBe(`Bearer ${token}`);
  expect(execute.mock.calls[0]?.[0].ticket).toBe(jobTicket);
});

it("expires after fifteen minutes and repeats only 204", async () => {
  let clock = 0;
  const wait = vi.fn(async (milliseconds: number) => {
    clock += milliseconds;
  });
  respond = (response) => response.writeHead(204).end();
  await expect(run({}, { now: () => clock, wait })).rejects.toThrow(
    "Warm runner idle expired",
  );
  expect(clock).toBe(15 * 60 * 1000);
  expect(requests).toHaveLength(900);
  expect(wait).toHaveBeenCalledWith(1000, controller.signal);
  expect(execute).not.toHaveBeenCalled();
});

it("does not launch a job when its assignment arrives after idle expiry", async () => {
  let clock = 0;
  respond = (response) => {
    clock = 15 * 60 * 1000;
    response.end(JSON.stringify(claimed));
  };
  await expect(run({}, { now: () => clock })).rejects.toThrow(
    "Warm runner idle expired",
  );
  expect(requests).toHaveLength(1);
  expect(execute).not.toHaveBeenCalled();
});

it("does no HTTP or job work if shutdown has already started", async () => {
  controller.abort(new Error(bootstrapTicket));
  await expect(run()).rejects.toThrow("Warm runner idle cancelled");
  expect(requests).toHaveLength(0);
  expect(execute).not.toHaveBeenCalled();
});

it("cancels an in-flight idle poll without launching its returned job", async () => {
  respond = (response) => {
    controller.abort(new Error(bootstrapTicket));
    response.end(JSON.stringify(claimed));
  };
  await expect(run()).rejects.toThrow("Warm runner idle cancelled");
  expect(requests).toHaveLength(1);
  expect(execute).not.toHaveBeenCalled();
});

it("cancels a partially received assignment without executing or retrying", async () => {
  respond = (response) => {
    response.writeHead(200, { "Content-Length": "1000" });
    response.write(JSON.stringify(claimed));
    setImmediate(() => controller.abort());
  };
  await expect(run()).rejects.toThrow("Warm runner idle cancelled");
  expect(requests).toHaveLength(1);
  expect(execute).not.toHaveBeenCalled();
});

it("cancels the default idle sleep promptly without another poll", async () => {
  respond = (response) => response.writeHead(204).end();
  const waiting = run();
  while (!requests.length)
    await new Promise((resolve) => setTimeout(resolve, 1));
  await new Promise((resolve) => setTimeout(resolve, 30));
  controller.abort();
  await expect(waiting).rejects.toThrow("Warm runner idle cancelled");
  expect(requests).toHaveLength(1);
  expect(execute).not.toHaveBeenCalled();
});

it("never retries a lost assignment response", async () => {
  respond = (response) => {
    response.writeHead(200, { "Content-Length": "1000" });
    response.write(JSON.stringify(claimed).slice(0, 10));
    response.socket?.destroy();
  };
  await expect(run()).rejects.toThrow("Warm runner claim failed");
  expect(requests).toHaveLength(1);
  expect(execute).not.toHaveBeenCalled();
});

it("does not execute complete JSON when its HTTP response was truncated", async () => {
  respond = (response) => {
    response.writeHead(200, { "Content-Length": "1000" });
    response.write(JSON.stringify(claimed));
    setImmediate(() => response.socket?.destroy());
  };
  await expect(run()).rejects.toThrow("Warm runner claim failed");
  expect(requests).toHaveLength(1);
  expect(execute).not.toHaveBeenCalled();
});

it("bounds an unresponsive claim including an unfinished response body", async () => {
  respond = (response) => {
    response.writeHead(200);
    response.write('{"id":');
  };
  await expect(run()).rejects.toThrow("Warm runner claim failed");
  expect(requests).toHaveLength(1);
  expect(execute).not.toHaveBeenCalled();
}, 15000);
