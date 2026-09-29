import { buildApp } from "./app.js";

const app = buildApp();
const port = Number(process.env.PORT ?? "3000");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    void app.close().catch(() => {
      process.exitCode = 1;
    });
  });
}
try {
  await app.listen({ port, host: process.env.HOST ?? "127.0.0.1" });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
