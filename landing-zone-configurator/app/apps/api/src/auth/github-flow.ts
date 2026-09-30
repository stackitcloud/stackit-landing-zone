import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type PendingGitHubLogin = {
  stateHash: string;
  bindingHash: string;
  verifier: string;
  expiresAt: number;
};
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("base64url");
const nonce = () => randomBytes(32).toString("base64url");

function constantTimeHashMatch(value: string, expectedHash: string): boolean {
  const actual = Buffer.from(sha256(value));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createGitHubLogin(
  clientId: string,
  callback: string,
  now = Date.now(),
) {
  const redirect = new URL(callback);
  if (
    !clientId ||
    redirect.protocol !== "https:" ||
    redirect.username ||
    redirect.password ||
    redirect.search ||
    redirect.hash ||
    redirect.pathname !== "/auth/github/callback"
  ) {
    throw new Error("Invalid GitHub login configuration");
  }
  const state = nonce();
  const cookieBinding = nonce();
  const verifier = nonce();
  const authorizationUrl = new URL("https://github.com/login/oauth/authorize");
  authorizationUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect.href,
    state,
    code_challenge: sha256(verifier),
    code_challenge_method: "S256",
    allow_signup: "false",
  }).toString();
  return {
    authorizationUrl: authorizationUrl.href,
    cookieBinding,
    pending: {
      stateHash: sha256(state),
      bindingHash: sha256(cookieBinding),
      verifier,
      expiresAt: now + 5 * 60 * 1000,
    } satisfies PendingGitHubLogin,
  };
}

// The caller must atomically DELETE the pending record before exchanging the code.
// This pure check is not replay protection or a substitute for persistent storage.
export function validGitHubCallback(
  pending: PendingGitHubLogin,
  state: string,
  cookieBinding: string,
  now = Date.now(),
): boolean {
  return (
    now < pending.expiresAt &&
    state.length === 43 &&
    cookieBinding.length === 43 &&
    constantTimeHashMatch(state, pending.stateHash) &&
    constantTimeHashMatch(cookieBinding, pending.bindingHash)
  );
}

export function sessionCookie(value: string, maxAgeSeconds: number): string {
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(value) ||
    !Number.isSafeInteger(maxAgeSeconds) ||
    maxAgeSeconds < 0 ||
    maxAgeSeconds > 8 * 60 * 60
  ) {
    throw new Error("Invalid session cookie");
  }
  return `__Host-lzc-session=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function newSessionToken() {
  const token = nonce();
  return { token, hash: sha256(token) };
}
