import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const script = fileURLToPath(
  new URL(
    "../../../src/modules/connectivity/scripts/configure-ha.sh",
    import.meta.url,
  ),
);

async function appliance(
  role: "primary" | "backup",
  options: { unicast?: boolean; rejectLogin?: boolean } = {},
) {
  const requests: { path: string; body: unknown }[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks).toString("utf8");
    const path = request.url ?? "";
    if (path === "/") {
      response.setHeader("Content-Type", "text/html");
      response.end('<input type="hidden" name="csrf" value="fixture-csrf">');
      return;
    }
    if (path === "/index.php") {
      const form = new URLSearchParams(body);
      const authenticated =
        !options.rejectLogin &&
        form.get("csrf") === "fixture-csrf" &&
        form.get("usernamefld") === "fixture-admin" &&
        form.get("passwordfld") === "fixture-only-private-password";
      if (authenticated)
        response.setHeader("Set-Cookie", "fixture-session=authorized; Path=/");
      response.end("");
      return;
    }
    if (!request.headers.cookie?.includes("fixture-session=authorized")) {
      response.statusCode = 403;
      response.end("");
      return;
    }
    if (path === "/system_usermanager.php") {
      response.end('X-CSRFToken", "fixture-api-csrf"');
      return;
    }
    if (request.headers["x-csrftoken"] !== "fixture-api-csrf") {
      response.statusCode = 403;
      response.end("");
      return;
    }
    requests.push({ path, body: body ? JSON.parse(body) : null });
    response.setHeader("Content-Type", "application/json");
    const payloads: Record<string, unknown> = {
      "/api/interfaces/vip_settings/get_item": {
        vip: options.unicast === false ? {} : { peer: "" },
      },
      "/api/interfaces/vip_settings/search_item": { rows: [] },
      "/api/interfaces/vip_settings/add_item": { result: "saved" },
      "/api/interfaces/vip_settings/reconfigure": { status: "ok" },
      "/api/core/hasync/get": {
        hasync: {
          pfsyncinterface: "",
          pfsyncpeerip: "",
          pfsyncenabled: "",
          disablepreempt: "",
          synchronizetoip: "",
          username: "",
          password: "",
          syncitems: "",
        },
      },
      "/api/core/hasync/set": { result: "saved" },
      "/api/core/hasync/reconfigure": { status: "ok" },
      "/api/diagnostics/interface/get_vip_status": {
        rows: [{ vhid: 1, status: role === "primary" ? "MASTER" : "BACKUP" }],
      },
    };
    if (!Object.hasOwn(payloads, path)) {
      response.statusCode = 404;
      response.end("{}");
      return;
    }
    response.end(JSON.stringify(payloads[path]));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing local appliance address");
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}

async function configure(endpoint: string, role: "primary" | "backup") {
  return new Promise<{ code: number | null; text: string }>(
    (resolve, reject) => {
      const child = spawn("bash", [script, endpoint, role], {
        env: {
          ...process.env,
          OPNSENSE_USERNAME: "fixture-admin",
          OPNSENSE_PASSWORD: "fixture-only-private-password",
          LAN_VIP_CIDR: "10.0.0.6/24",
          VHID: "1",
          CARP_PASSWORD: "fixture-only-carp-secret",
          PEER_LAN_IP: role === "primary" ? "10.0.0.5" : "10.0.0.4",
          SYNC_TO_ENDPOINT: "https://10.0.0.5",
        },
        timeout: 25_000,
      });
      let text = "";
      child.stdout.on("data", (data: Buffer) => {
        text += data.toString();
      });
      child.stderr.on("data", (data: Buffer) => {
        text += data.toString();
      });
      child.once("error", reject);
      child.once("exit", (code) => resolve({ code, text }));
    },
  );
}

it.each(["backup", "primary"] as const)(
  "executes the native %s HA administration contract against an authenticated local appliance",
  async (role) => {
    const target = await appliance(role);
    try {
      const result = await configure(target.endpoint, role);
      expect(result.code, result.text).toBe(0);
      expect(result.text).not.toContain("fixture-only-private-password");
      expect(result.text).not.toContain("fixture-only-carp-secret");
      expect(
        target.requests.find(
          (request) => request.path === "/api/interfaces/vip_settings/add_item",
        )?.body,
      ).toMatchObject({
        vip: {
          network: "10.0.0.6/24",
          mode: "carp",
          advskew: role === "primary" ? "0" : "100",
          peer: role === "primary" ? "10.0.0.5" : "10.0.0.4",
          nosync: "1",
        },
      });
      const sync = target.requests.find(
        (request) => request.path === "/api/core/hasync/set",
      )?.body;
      expect(sync).toMatchObject({
        hasync: {
          pfsyncinterface: "lan",
          pfsyncenabled: "1",
          pfsyncpeerip: role === "primary" ? "10.0.0.5" : "10.0.0.4",
        },
      });
      if (role === "primary")
        expect(sync).toMatchObject({
          hasync: {
            synchronizetoip: "https://10.0.0.5",
            username: "fixture-admin",
            password: "fixture-only-private-password",
            syncitems: "aliases,categories,rules,nat,staticroutes",
          },
        });
      else expect(JSON.stringify(sync)).not.toContain("synchronizetoip");
    } finally {
      await target.close();
    }
  },
  30_000,
);

it.each([{ rejectLogin: true }, { unicast: false }])(
  "fails closed for unsupported or unauthorized appliance administration: %j",
  async (options) => {
    const target = await appliance("primary", options);
    try {
      const result = await configure(target.endpoint, "primary");
      expect(result.code).not.toBe(0);
      expect(result.text).not.toContain("fixture-only-private-password");
      expect(
        target.requests.some(
          (request) => request.path === "/api/core/hasync/set",
        ),
      ).toBe(false);
    } finally {
      await target.close();
    }
  },
  30_000,
);
