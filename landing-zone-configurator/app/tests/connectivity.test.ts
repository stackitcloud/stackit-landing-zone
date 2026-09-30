import { afterEach, describe, expect, it, vi } from "vitest";
import { checkSecrets, safeFailure } from "../apps/api/src/connectivity.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("connection diagnostics", () => {
  it("never includes raw credentials from driver errors", () => {
    expect(safeFailure(new Error("password=very-secret"))).toBe(
      "connection-or-response-failed",
    );
    expect(safeFailure({ code: "28P01", message: "very-secret" })).toBe(
      "28P01",
    );
  });
  it("checks the instance policy and revokes the temporary session", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    vi.stubEnv("LZC_SECRETS_ADDRESS", "https://prod.sm.eu01.stackit.cloud");
    vi.stubEnv("LZC_SECRETS_INSTANCE_ID", id);
    vi.stubEnv("LZC_SECRETS_USERNAME", "runtime");
    vi.stubEnv("LZC_SECRETS_PASSWORD", "fake-test-password");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ auth: { client_token: "fake-token" } }),
      )
      .mockResolvedValueOnce(
        Response.json({
          [`${id}/data/configurator/connectivity-probe`]: ["read"],
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    await expect(checkSecrets()).resolves.toBeUndefined();
    expect(fetch).toHaveBeenLastCalledWith(
      "https://prod.sm.eu01.stackit.cloud/v1/auth/token/revoke-self",
      expect.objectContaining({ method: "POST", redirect: "error" }),
    );
  });
});
