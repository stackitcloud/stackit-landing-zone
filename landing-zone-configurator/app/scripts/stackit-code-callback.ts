import { createServer } from "node:http";

export async function openStackitCodeCallback(origin: string) {
  const target = new URL(origin);
  if (
    target.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(target.hostname) ||
    target.username ||
    target.password ||
    target.pathname !== "/" ||
    target.search ||
    target.hash
  )
    throw new Error("invalid_local_callback_origin");
  for (let port = 8000; port <= 8020; port++) {
    const redirectUri = `http://localhost:${port}`;
    const server = createServer((request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Referrer-Policy", "no-referrer");
      let incoming: URL;
      try {
        incoming = new URL(request.url ?? "/", redirectUri);
      } catch {
        response.writeHead(400).end("Invalid login callback");
        return;
      }
      const state = incoming.searchParams.get("state") ?? "";
      if (
        request.method !== "GET" ||
        request.headers.host !== `localhost:${port}` ||
        incoming.pathname !== "/" ||
        (request.url?.length ?? 0) > 8192 ||
        !/^(login|proof)\.[A-Za-z0-9_-]{43}$/.test(state) ||
        ["state", "code", "error", "iss"].some(
          (key) => incoming.searchParams.getAll(key).length > 1,
        )
      ) {
        response.writeHead(400).end("Invalid login callback");
        return;
      }
      const callback = new URL(
        state.startsWith("proof.")
          ? "/auth/stackit/proof-callback"
          : "/auth/stackit/callback",
        target,
      );
      for (const key of ["state", "code", "error", "iss"]) {
        const value = incoming.searchParams.get(key);
        if (value !== null) callback.searchParams.set(key, value);
      }
      response.writeHead(303, { Location: callback.toString() }).end();
    });
    server.requestTimeout = 10000;
    server.headersTimeout = 10000;
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", resolve);
      });
      return {
        redirectUri,
        close: () =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
    }
  }
  throw new Error("cli_callback_ports_unavailable");
}
