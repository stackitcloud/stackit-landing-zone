import { randomUUID, sign } from "node:crypto";
import { z } from "zod";
import { parseServiceAccountKey, type ServiceAccountKey } from "./key.js";

export type CredentialCheck = {
  status: "passed" | "failed";
  organizationId: string;
  organizationName: string | null;
  checkedAt: string;
  code:
    | "organization_readable"
    | "authentication_failed"
    | "organization_access_denied"
    | "organization_not_active"
    | "cloud_unavailable"
    | "invalid_stored_key"
    | "secret_unavailable";
};
class CheckError extends Error {
  constructor(readonly code: CredentialCheck["code"]) {
    super(code);
  }
}
const endpoints: Record<ServiceAccountKey["credentials"]["aud"], string> = {
  "https://accounts.stackit.cloud":
    "https://accounts.stackit.cloud/oauth/v2/token",
  "https://service-account.api.stackit.cloud":
    "https://service-account.api.stackit.cloud/token",
  "https://stackit-service-account-prod.apps.01.cf.eu01.stackit.cloud":
    "https://stackit-service-account-prod.apps.01.cf.eu01.stackit.cloud/token",
};
export function signedAssertion(
  key: ServiceAccountKey,
  now = Math.floor(Date.now() / 1000),
) {
  const { kid, iss, sub, aud, privateKey } = key.credentials;
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const data = `${encode({ alg: "RS512", typ: "JWT", kid })}.${encode({ iss, sub, aud, iat: now, exp: now + 600, jti: randomUUID() })}`;
  return `${data}.${sign("RSA-SHA512", Buffer.from(data), privateKey).toString("base64url")}`;
}
export class StackitAccessCheck {
  constructor(private readonly request: typeof fetch = fetch) {}
  async check(
    input: ServiceAccountKey,
    organizationId: string,
  ): Promise<CredentialCheck> {
    const result = {
      organizationId: z.uuid().parse(organizationId),
      organizationName: null,
      checkedAt: new Date().toISOString(),
    };
    let key: ServiceAccountKey;
    try {
      key = parseServiceAccountKey(input);
    } catch {
      return { ...result, status: "failed", code: "invalid_stored_key" };
    }
    try {
      // Only fixed, validated public STACKIT destinations; redirects are forbidden.
      const endpoint =
        key.credentials.tokenEndpoint ?? endpoints[key.credentials.aud];
      const response = await this.request(endpoint, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion: signedAssertion(key),
        }).toString(),
      });
      if (!response.ok)
        throw new CheckError(
          [400, 401, 403].includes(response.status)
            ? "authentication_failed"
            : "cloud_unavailable",
        );
      const token = z
        .object({
          access_token: z.string().min(1).max(32768),
          expires_in: z.number().positive(),
          token_type: z
            .string()
            .refine((value) => value.toLowerCase() === "bearer"),
        })
        .parse(await response.json());
      const organization = await this.request(
        `https://resource-manager.api.stackit.cloud/v2/organizations/${result.organizationId}`,
        {
          redirect: "error",
          signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Bearer ${token.access_token}` },
        },
      );
      if (!organization.ok)
        throw new CheckError(
          [401, 403, 404].includes(organization.status)
            ? "organization_access_denied"
            : "cloud_unavailable",
        );
      const data = z
        .object({
          organizationId: z.uuid(),
          name: z.string().min(1).max(256),
          lifecycleState: z.string(),
        })
        .parse(await organization.json());
      if (data.organizationId !== result.organizationId)
        throw new CheckError("cloud_unavailable");
      if (data.lifecycleState !== "ACTIVE")
        throw new CheckError("organization_not_active");
      return {
        ...result,
        status: "passed",
        code: "organization_readable",
        organizationName: data.name,
      };
    } catch (error) {
      return {
        ...result,
        status: "failed",
        code: error instanceof CheckError ? error.code : "cloud_unavailable",
      };
    }
  }
}
