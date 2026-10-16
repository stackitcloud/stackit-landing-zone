import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { healthResponseSchema } from "@lzc/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../apps/api/src/app.js";

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("API foundation", () => {
  it("exposes only the public health contract", async () => {
    const app = buildApp();
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/healthz" });
    expect(response.statusCode).toBe(200);
    expect(healthResponseSchema.safeParse(response.json()).success).toBe(true);
  });
  it("cannot be authenticated using forged identity headers", async () => {
    const app = buildApp();
    apps.push(app);
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/session",
      headers: {
        authorization: "Bearer fabricated",
        "x-user-id": "admin",
        "x-tenant-id": "other-tenant",
      },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "authentication_required" });
  });
});

it("serves the compiled UI without bypassing API authentication", async () => {
  const root = mkdtempSync(join(tmpdir(), "lzc-web-"));
  writeFileSync(join(root, "index.html"), "<html>Configurator</html>");
  const app = buildApp({ webRoot: root });
  try {
    expect((await app.inject("/")).body).toContain("Configurator");
    expect((await app.inject("/api/v1/session")).statusCode).toBe(401);
    for (const path of [
      "/templates",
      "/templates/standalone",
      "/repositories",
      "/configurations",
      "/configurations/edit/review",
    ]) {
      const response = await app.inject(path);
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain("Configurator");
    }
    expect((await app.inject("/auth/unknown")).statusCode).toBe(404);
    expect((await app.inject("/api/v1/unknown")).statusCode).toBe(404);
    expect((await app.inject("/assets/missing.js")).statusCode).toBe(404);
    expect((await app.inject("/templates/unknown")).statusCode).toBe(404);
    expect((await app.inject("/api/v1/unknown")).statusCode).not.toBe(200);
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});
