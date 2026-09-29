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
