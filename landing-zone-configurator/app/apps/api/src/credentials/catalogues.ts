import type pg from "pg";
import { z } from "zod";
import type { Session } from "../auth/store.js";
import { withTenant } from "../storage/database.js";
import { signedAssertion } from "./check.js";
import { parseServiceAccountKey, type ServiceAccountKey } from "./key.js";
import { CredentialError } from "./profiles.js";
import type { CredentialSecrets } from "./secrets.js";

export const catalogueRequest = z
  .object({
    profileId: z.uuid(),
    projectId: z.uuid(),
    region: z.enum(["eu01", "eu02"]),
  })
  .strict();
export type CatalogueRequest = z.infer<typeof catalogueRequest>;
export type CatalogueOption = { value: string; label: string };
export type CataloguePart = {
  status: "available" | "unavailable";
  options: CatalogueOption[];
};
export type CloudCatalogue = {
  region: string;
  projectId: string;
  fetchedAt: string;
  gitFlavors: CataloguePart;
  vpnPlans: CataloguePart;
  kubernetesVersions: CataloguePart;
  machineTypes: CataloguePart;
  availabilityZones: CataloguePart;
  volumeTypes: CataloguePart;
};
const text = z.string().min(1).max(256);
const names = z.array(z.object({ name: text })).max(2000);
const git = z.object({
  flavors: z
    .array(z.object({ id: text, display_name: text, availability: text }))
    .max(2000),
});
const vpn = z.object({
  plans: z.array(z.object({ planId: text, name: text.optional() })).max(2000),
});
const ske = z.object({
  kubernetesVersions: z
    .array(z.object({ version: text, state: text.optional() }))
    .max(2000),
  machineTypes: names,
  availabilityZones: names,
  volumeTypes: names,
});
const unavailable = (): CataloguePart => ({
  status: "unavailable",
  options: [],
});
const available = (options: CatalogueOption[]): CataloguePart => ({
  status: "available",
  options,
});
const named = (items: { name: string }[]) =>
  items.map(({ name }) => ({ value: name, label: name }));
const tokenEndpoints: Record<ServiceAccountKey["credentials"]["aud"], string> =
  {
    "https://accounts.stackit.cloud":
      "https://accounts.stackit.cloud/oauth/v2/token",
    "https://service-account.api.stackit.cloud":
      "https://service-account.api.stackit.cloud/token",
    "https://stackit-service-account-prod.apps.01.cf.eu01.stackit.cloud":
      "https://stackit-service-account-prod.apps.01.cf.eu01.stackit.cloud/token",
  };
/** Product metadata only. No token, private key or raw provider response leaves this service. */
export class StackitCatalogueClient {
  constructor(private readonly request: typeof fetch = fetch) {}
  private async json(url: string, init: RequestInit = {}) {
    const response = await this.request(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("catalogue_unavailable");
    // Product catalogues are bounded; never buffer unbounded upstream data.
    const reader = response.body?.getReader();
    if (!reader) throw new Error("catalogue_unavailable");
    const parts: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2_000_000) throw new Error("catalogue_too_large");
        parts.push(value);
      }
    } finally {
      await reader.cancel();
    }
    return JSON.parse(Buffer.concat(parts).toString("utf8")) as unknown;
  }
  async load(
    input: CatalogueRequest,
    rawKey: ServiceAccountKey,
  ): Promise<CloudCatalogue> {
    const { projectId, region } = catalogueRequest.parse(input);
    const key = parseServiceAccountKey(rawKey);
    const token = z
      .object({
        access_token: z.string().min(1).max(32768),
        token_type: z.string().refine((v) => v.toLowerCase() === "bearer"),
      })
      .parse(
        await this.json(
          key.credentials.tokenEndpoint ?? tokenEndpoints[key.credentials.aud],
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
              assertion: signedAssertion(key),
            }).toString(),
          },
        ),
      );
    const headers = { Authorization: `Bearer ${token.access_token}` };
    const [gitResult, vpnResult, skeResult] = await Promise.allSettled([
      this.json(
        `https://git.api.stackit.cloud/v1beta/projects/${projectId}/flavors`,
        { headers },
      ).then((v) => git.parse(v)),
      this.json(`https://vpn.api.stackit.cloud/v1/regions/${region}/plans`, {
        headers,
      }).then((v) => vpn.parse(v)),
      this.json(
        `https://ske.api.stackit.cloud/v2/regions/${region}/provider-options?versionState=SUPPORTED`,
        { headers },
      ).then((v) => ske.parse(v)),
    ]);
    const result: CloudCatalogue = {
      region,
      projectId,
      fetchedAt: new Date().toISOString(),
      gitFlavors: unavailable(),
      vpnPlans: unavailable(),
      kubernetesVersions: unavailable(),
      machineTypes: unavailable(),
      availabilityZones: unavailable(),
      volumeTypes: unavailable(),
    };
    if (gitResult.status === "fulfilled")
      result.gitFlavors = available(
        gitResult.value.flavors
          .filter((v) => v.availability === "available")
          .map((v) => ({ value: v.id, label: v.display_name })),
      );
    if (vpnResult.status === "fulfilled")
      result.vpnPlans = available(
        vpnResult.value.plans.map((v) => ({
          value: v.planId,
          label: v.name ?? v.planId,
        })),
      );
    if (skeResult.status === "fulfilled") {
      const data = skeResult.value;
      result.kubernetesVersions = available(
        data.kubernetesVersions
          .filter(
            (v) => !v.state || ["supported", "SUPPORTED"].includes(v.state),
          )
          .map((v) => ({ value: v.version, label: v.version })),
      );
      result.machineTypes = available(named(data.machineTypes));
      result.availabilityZones = available(named(data.availabilityZones));
      result.volumeTypes = available(named(data.volumeTypes));
    }
    return result;
  }
}
export class PostgresCloudCatalogues {
  constructor(
    private readonly pool: pg.Pool,
    private readonly secrets: CredentialSecrets,
    private readonly cloud = new StackitCatalogueClient(),
  ) {}
  async load(session: Session, input: CatalogueRequest) {
    const parsed = catalogueRequest.parse(input);
    // Explicit owner/tenant filters in addition to RLS: never borrow a colleague's access.
    const profile = await withTenant(
      this.pool,
      session,
      async (c) =>
        (
          await c.query<{ key_id: string; service_account: string }>(
            "SELECT key_id, service_account FROM lzc.credential_profiles WHERE id=$1 AND tenant_id=$2 AND owner_user_id=$3 AND state='stored'",
            [parsed.profileId, session.tenantId, session.userId],
          )
        ).rows[0],
    );
    if (!profile) throw new CredentialError(404, "credential_not_found");
    const secret = await this.secrets.get(session, parsed.profileId);
    if (
      secret.key.credentials.kid !== profile.key_id ||
      secret.key.credentials.iss !== profile.service_account
    )
      throw new Error("credential_identity_mismatch");
    return this.cloud.load(parsed, secret.key);
  }
}
