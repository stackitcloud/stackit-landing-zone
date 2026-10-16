export class VaultConnection {
  constructor(
    readonly config: {
      address: string;
      instance: string;
      username: string;
      password: string;
    },
    private readonly request: typeof fetch = fetch,
  ) {
    if (
      config.address !== "https://prod.sm.eu01.stackit.cloud" ||
      !/^[a-f0-9-]{36}$/.test(config.instance)
    )
      throw new Error("Unexpected Secrets destination");
  }
  async call(path: string, init: RequestInit) {
    return this.request(`${this.config.address}/v1/${path}`, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
  }
  async authorized<T>(
    operation: (headers: Record<string, string>) => Promise<T>,
  ): Promise<T> {
    const login = await this.call(
      `auth/userpass/login/${encodeURIComponent(this.config.username)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: this.config.password }),
      },
    );
    if (!login.ok) throw new Error("Secret authorization failed");
    const value = (await login.json()) as { auth?: { client_token?: unknown } };
    if (typeof value.auth?.client_token !== "string")
      throw new Error("Secret authorization invalid");
    const headers = {
      "X-Vault-Token": value.auth.client_token,
      "Content-Type": "application/json",
    };
    const outcome = await operation(headers).then(
      (result) => ({ ok: true as const, result }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    const cleanup = await this.call("auth/token/revoke-self", {
      method: "POST",
      headers,
    }).then(
      (response) => response.ok,
      () => false,
    );
    if (!outcome.ok) throw outcome.error;
    if (!cleanup) throw new Error("Secret session cleanup failed");
    return outcome.result;
  }
}
