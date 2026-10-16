import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createGitHubLogin,
  newSessionToken,
  sessionCookie,
  validGitHubCallback,
} from "../apps/api/src/auth/github-flow.js";

const callback = "https://example.invalid/auth/github/callback";

describe("GitHub login foundation (not yet wired to HTTP)", () => {
  it("binds S256 PKCE, state and a separate browser cookie", () => {
    const flow = createGitHubLogin("test-client", callback, 1000);
    const url = new URL(flow.authorizationUrl);
    const state = url.searchParams.get("state") ?? "";
    expect(url.origin).toBe("https://github.com");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(
      createHash("sha256").update(flow.pending.verifier).digest("base64url"),
    );
    expect(url.searchParams.get("scope")).toBeNull();
    expect(flow.authorizationUrl).not.toContain(flow.pending.verifier);
    expect(
      validGitHubCallback(flow.pending, state, flow.cookieBinding, 2000),
    ).toBe(true);
    expect(validGitHubCallback(flow.pending, state, "x".repeat(43), 2000)).toBe(
      false,
    );
    expect(
      validGitHubCallback(
        flow.pending,
        "x".repeat(43),
        flow.cookieBinding,
        2000,
      ),
    ).toBe(false);
    expect(
      validGitHubCallback(
        flow.pending,
        state,
        flow.cookieBinding,
        flow.pending.expiresAt,
      ),
    ).toBe(false);
  });
  it("rejects insecure and ambiguous callback configuration", () => {
    for (const value of [
      "http://example.invalid/auth/github/callback",
      `${callback}?next=evil`,
      `${callback}#fragment`,
      "https://user:pass@example.invalid/auth/github/callback",
      "https://example.invalid/other",
    ]) {
      expect(() => createGitHubLogin("test-client", value)).toThrow();
    }
  });
  it("stores only a session hash and creates a host-bound secure cookie", () => {
    const first = newSessionToken();
    const second = newSessionToken();
    expect(first.token).not.toBe(second.token);
    expect(first.hash).not.toBe(first.token);
    expect(sessionCookie(first.token, 3600)).toContain(
      "Path=/; HttpOnly; Secure; SameSite=Lax",
    );
    expect(() =>
      sessionCookie(`${first.token}; Domain=example.invalid`, 3600),
    ).toThrow();
    expect(() => sessionCookie(first.token, 9999999)).toThrow();
  });
});
