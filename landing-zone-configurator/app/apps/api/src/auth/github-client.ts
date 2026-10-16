export type GitHubAuthorization = {
  accessToken: string;
  expiresIn: number;
  githubId: number;
  login: string;
};
export interface GitHubLoginClient {
  authorize(code: string, verifier: string): Promise<GitHubAuthorization>;
}
export class GitHubClient implements GitHubLoginClient {
  constructor(
    private readonly config: {
      clientId: string;
      clientSecret: string;
      callback: string;
    },
    private readonly request: typeof fetch = fetch,
  ) {}
  async authorize(
    code: string,
    verifier: string,
  ): Promise<GitHubAuthorization> {
    const response = await this.request(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          redirect_uri: this.config.callback,
          code,
          code_verifier: verifier,
        }),
      },
    );
    if (!response.ok) throw new Error("GitHub authorization failed");
    const token = (await response.json()) as Record<string, unknown>;
    if (
      typeof token.access_token !== "string" ||
      !token.access_token.startsWith("ghu_") ||
      token.token_type !== "bearer" ||
      typeof token.expires_in !== "number" ||
      !Number.isInteger(token.expires_in) ||
      token.expires_in < 60 ||
      token.expires_in > 28800
    )
      throw new Error("Expiring GitHub user token required");
    // Refresh tokens are deliberately not retained: this MVP requires re-login after at most 8h.
    const identity = await this.request("https://api.github.com/user", {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
      },
    });
    if (!identity.ok) throw new Error("GitHub identity verification failed");
    const user = (await identity.json()) as Record<string, unknown>;
    if (
      typeof user.id !== "number" ||
      !Number.isSafeInteger(user.id) ||
      user.id <= 0 ||
      typeof user.login !== "string" ||
      !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(user.login)
    )
      throw new Error("Invalid GitHub identity");
    return {
      accessToken: token.access_token,
      expiresIn: token.expires_in,
      githubId: user.id,
      login: user.login,
    };
  }
}
