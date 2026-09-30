// Non-secret diagnostics confined to the deployment's own service endpoints.
import { lookup } from "node:dns/promises";
import { createConnection } from "node:net";

const host = process.env.LZC_DATABASE_HOST;
const port = Number(process.env.LZC_DATABASE_PORT);
if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("Database endpoint missing");
}
try {
  const addresses = await lookup(host, { all: true });
  console.log(JSON.stringify({ check: "postgresql-dns", addresses }));
  const started = Date.now();
  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host, port, timeout: 5000 });
    socket.once("connect", () => {
      socket.destroy();
      resolve();
    });
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error("tcp-timeout"));
    });
    socket.once("error", () => {
      socket.destroy();
      reject(new Error("tcp-error"));
    });
  });
  console.log(
    JSON.stringify({
      check: "postgresql-tcp",
      ok: true,
      elapsedMs: Date.now() - started,
    }),
  );
} catch {
  console.log(JSON.stringify({ check: "postgresql-network", ok: false }));
}
try {
  // CF router access logs record the source of this request to our own app.
  const response = await fetch(
    "https://lzc-dev-configurator-7dbff805.apps.01.cf.eu01.stackit.cloud/healthz?probe=cf-network",
    { redirect: "error", signal: AbortSignal.timeout(10000) },
  );
  await response.arrayBuffer();
  console.log(
    JSON.stringify({ check: "own-route-from-cf", status: response.status }),
  );
} catch {
  console.log(JSON.stringify({ check: "own-route-from-cf", ok: false }));
}
