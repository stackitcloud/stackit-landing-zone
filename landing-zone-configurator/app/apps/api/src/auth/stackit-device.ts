import { createRemoteJWKSet, customFetch, errors, jwtVerify } from "jose";
import { z } from "zod";

const issuer = "https://accounts.stackit.cloud";
const clientId = "stackit-cli-0000-0000-000000000001";
const verificationUrl = z.url().refine((value) => {
  const url = new URL(value);
  return url.origin === issuer && !url.username && !url.password;
});
const identitySchema = z.object({
  sub: z.string().min(1).max(255),
  email: z
    .email()
    .max(254)
    .refine((value) => !/@sa\.stackit\.cloud$/i.test(value)),
  email_verified: z.literal(true),
});

export class DeviceFlowError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export type DeviceIdentity = {
  issuer: string;
  subject: string;
  email: string;
  emailVerified: true;
  verificationMethod: "signed-id-token-and-userinfo" | "device-grant-userinfo";
  tokenExpiresAt: string;
  organization: {
    id: string;
    name: string;
    permissions?: string[];
    ownerPermissions?: string[];
  } | null;
};

export type DeviceState =
  | { status: "idle" | "expired" | "cancelled" }
  | { status: "waiting"; retryAfterMs: number }
  | { status: "failed"; code: string }
  | { status: "verified"; identity: DeviceIdentity };

export class StackitDeviceFlow {
  private deviceCode: string | null = null;
  private expiresAt = 0;
  private nextPollAt = 0;
  private intervalMs = 5000;
  private polling = false;
  private current: DeviceState = { status: "idle" };
  private readonly keys;
  private readonly organizationId: string | undefined;

  constructor(
    private readonly request: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
    organizationId?: string,
  ) {
    this.organizationId =
      organizationId === undefined ? undefined : z.uuid().parse(organizationId);
    this.keys = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), {
      [customFetch]: (input, init) =>
        this.request(input, { ...init, redirect: "error" }),
    });
  }

  private async call(path: string, init: RequestInit = {}) {
    const response = await this.request(`${issuer}${path}`, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (Number(response.headers.get("content-length")) > 65536)
      throw new DeviceFlowError("provider_response_invalid");
    const text = await response.text();
    if (text.length > 65536)
      throw new DeviceFlowError("provider_response_invalid");
    return { response, data: JSON.parse(text) as unknown };
  }

  async begin() {
    if (this.current.status !== "idle")
      throw new DeviceFlowError("flow_already_started");
    const { response, data } = await this.call(
      "/oauth/v2/device_authorization",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          scope: "openid email",
        }),
      },
    );
    if (!response.ok) throw new DeviceFlowError("device_authorization_failed");
    const authorization = z
      .object({
        device_code: z.string().min(1).max(4096),
        user_code: z.string().min(1).max(128),
        verification_uri: verificationUrl,
        verification_uri_complete: verificationUrl.optional(),
        expires_in: z.number().int().positive().max(900),
        interval: z.number().int().positive().max(60).default(5),
      })
      .parse(data);
    this.deviceCode = authorization.device_code;
    this.expiresAt = this.now() + authorization.expires_in * 1000;
    this.intervalMs = authorization.interval * 1000;
    this.nextPollAt = this.now() + this.intervalMs;
    this.current = { status: "waiting", retryAfterMs: this.intervalMs };
    return {
      verificationUri:
        authorization.verification_uri_complete ??
        authorization.verification_uri,
      userCode: authorization.user_code,
      expiresAt: new Date(this.expiresAt).toISOString(),
      retryAfterMs: this.intervalMs,
    };
  }

  cancel(): DeviceState {
    this.deviceCode = null;
    this.current = { status: "cancelled" };
    return this.current;
  }

  state(): DeviceState {
    if (this.current.status === "waiting" && this.now() >= this.expiresAt) {
      this.deviceCode = null;
      this.current = { status: "expired" };
    }
    return structuredClone(this.current);
  }

  async poll(): Promise<DeviceState> {
    if (this.state().status !== "waiting" || this.polling) return this.state();
    if (this.now() < this.nextPollAt)
      return { status: "waiting", retryAfterMs: this.nextPollAt - this.now() };
    this.polling = true;
    this.nextPollAt = this.now() + this.intervalMs;
    let stage = "token_response";
    try {
      const { response, data } = await this.call("/oauth/v2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: this.deviceCode ?? "",
        }),
      });
      if (this.state().status !== "waiting") return this.state();
      if (!response.ok) {
        const failure = z.object({ error: z.string() }).parse(data);
        if (
          failure.error === "authorization_pending" ||
          failure.error === "slow_down"
        ) {
          if (failure.error === "slow_down") this.intervalMs += 5000;
          this.nextPollAt = this.now() + this.intervalMs;
          return { status: "waiting", retryAfterMs: this.intervalMs };
        }
        if (failure.error === "expired_token") {
          this.deviceCode = null;
          this.current = { status: "expired" };
          return this.state();
        }
        throw new DeviceFlowError(
          failure.error === "access_denied"
            ? "access_denied"
            : "token_exchange_failed",
        );
      }
      const tokens = z
        .object({
          access_token: z.string().min(1).max(32768),
          id_token: z.string().min(1).max(32768).optional(),
          expires_in: z.number().int().positive().max(86400),
          token_type: z
            .string()
            .refine((value) => value.toLowerCase() === "bearer"),
        })
        .parse(data);
      let identity: { sub: string; email?: string | undefined } | undefined;
      let tokenExpiresAt = this.now() + tokens.expires_in * 1000;
      if (tokens.id_token !== undefined) {
        stage = "id_token_verification";
        const { payload } = await jwtVerify(tokens.id_token, this.keys, {
          issuer,
          audience: clientId,
          algorithms: ["RS256"],
          requiredClaims: ["sub", "iat", "exp"],
          maxTokenAge: "10m",
          currentDate: new Date(this.now()),
        });
        stage = "id_token_claims";
        identity = identitySchema
          .partial({ email: true, email_verified: true })
          .parse(payload);
        tokenExpiresAt = Math.min(tokenExpiresAt, (payload.exp ?? 0) * 1000);
      }
      stage = "userinfo_request";
      const info = await this.call("/oidc/v1/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (!info.response.ok) throw new DeviceFlowError("userinfo_failed");
      stage = "userinfo_claims";
      const user = identitySchema.parse(info.data);
      if (
        identity !== undefined &&
        (identity.sub !== user.sub ||
          (identity.email !== undefined && identity.email !== user.email))
      )
        throw new DeviceFlowError("identity_binding_mismatch");
      let organization: DeviceIdentity["organization"] = null;
      if (this.organizationId) {
        stage = "organization_request";
        const result = await this.request(
          `https://resource-manager.api.stackit.cloud/v2/organizations/${this.organizationId}`,
          {
            redirect: "error",
            signal: AbortSignal.timeout(15000),
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          },
        );
        if (!result.ok) throw new DeviceFlowError("organization_access_denied");
        stage = "organization_response";
        const record = z
          .object({
            organizationId: z.uuid(),
            name: z.string().min(1).max(256),
            lifecycleState: z.literal("ACTIVE"),
          })
          .parse(await result.json());
        if (record.organizationId !== this.organizationId)
          throw new DeviceFlowError("organization_binding_mismatch");
        stage = "organization_permissions_request";
        const permissionsUrl = new URL(
          `https://authorization.api.stackit.cloud/v2/users/${encodeURIComponent(user.email)}/permissions`,
        );
        permissionsUrl.searchParams.set("resourceType", "organization");
        permissionsUrl.searchParams.set("resource", this.organizationId);
        const permissionsResponse = await this.request(permissionsUrl, {
          redirect: "error",
          signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (!permissionsResponse.ok)
          throw new DeviceFlowError("organization_permissions_denied");
        stage = "organization_permissions_response";
        if (Number(permissionsResponse.headers.get("content-length")) > 65536)
          throw new DeviceFlowError("provider_response_invalid");
        const permissionsText = await permissionsResponse.text();
        if (permissionsText.length > 65536)
          throw new DeviceFlowError("provider_response_invalid");
        const permissions = z
          .object({
            items: z
              .array(
                z.object({
                  resourceId: z.uuid(),
                  resourceType: z.literal("organization"),
                  permissions: z
                    .array(
                      z.object({
                        name: z.string().regex(/^[a-z](?:[-.]?[a-z]){1,63}$/),
                      }),
                    )
                    .max(512),
                }),
              )
              .max(1),
          })
          .parse(JSON.parse(permissionsText));
        if (
          permissions.items.some(
            (item) => item.resourceId !== this.organizationId,
          )
        )
          throw new DeviceFlowError(
            "organization_permissions_binding_mismatch",
          );
        organization = {
          id: record.organizationId,
          name: record.name,
          permissions: [
            ...new Set(
              permissions.items.flatMap((item) =>
                item.permissions.map((permission) => permission.name),
              ),
            ),
          ].sort(),
        };
        if (organization.permissions?.length) {
          stage = "organization_roles_request";
          const rolesResponse = await this.request(
            `https://authorization.api.stackit.cloud/v2/organization/${this.organizationId}/roles`,
            {
              redirect: "error",
              signal: AbortSignal.timeout(15000),
              headers: { Authorization: `Bearer ${tokens.access_token}` },
            },
          );
          if (rolesResponse.ok) {
            stage = "organization_roles_response";
            if (Number(rolesResponse.headers.get("content-length")) > 65536)
              throw new DeviceFlowError("provider_response_invalid");
            const rolesText = await rolesResponse.text();
            if (rolesText.length > 65536)
              throw new DeviceFlowError("provider_response_invalid");
            const roles = z
              .object({
                resourceId: z.literal(this.organizationId),
                resourceType: z.literal("organization"),
                roles: z
                  .array(
                    z.object({
                      name: z.string(),
                      permissions: z
                        .array(
                          z.object({
                            name: z
                              .string()
                              .regex(/^[a-z](?:[-.]?[a-z]){1,63}$/),
                          }),
                        )
                        .max(512),
                    }),
                  )
                  .max(128),
              })
              .parse(JSON.parse(rolesText));
            const owners = roles.roles.filter((role) => role.name === "owner");
            if (owners.length === 1 && owners[0]?.permissions.length) {
              organization.ownerPermissions = [
                ...new Set(
                  owners[0].permissions.map((permission) => permission.name),
                ),
              ].sort();
            }
          }
        }
      }
      if (this.state().status !== "waiting") return this.state();
      this.deviceCode = null;
      this.current = {
        status: "verified",
        identity: {
          issuer,
          subject: user.sub,
          email: user.email,
          emailVerified: true,
          verificationMethod: identity
            ? "signed-id-token-and-userinfo"
            : "device-grant-userinfo",
          tokenExpiresAt: new Date(tokenExpiresAt).toISOString(),
          organization,
        },
      };
    } catch (error) {
      if (this.current.status === "waiting") {
        this.deviceCode = null;
        let code = `${stage}_failed`;
        if (error instanceof DeviceFlowError) code = error.code;
        else if (error instanceof errors.JOSEError)
          code = `${stage}_${error.code.toLowerCase()}`;
        else if (error instanceof z.ZodError) {
          const fields = new Set([
            "access_token",
            "id_token",
            "expires_in",
            "token_type",
            "sub",
            "email",
            "email_verified",
            "organizationId",
            "name",
            "lifecycleState",
          ]);
          const invalid = [
            ...new Set(
              error.issues.flatMap((issue) => {
                const field = issue.path[0];
                return typeof field === "string" && fields.has(field)
                  ? [field]
                  : [];
              }),
            ),
          ];
          code = `${stage}_invalid_${invalid.join("_") || "response"}`;
        }
        this.current = {
          status: "failed",
          code,
        };
      }
    } finally {
      this.polling = false;
    }
    return this.state();
  }
}
