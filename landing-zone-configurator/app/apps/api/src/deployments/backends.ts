import { createHash, randomUUID } from "node:crypto";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  type S3BackendDescriptor,
  type S3RunnerBackend,
  s3BackendConfiguration,
  s3BackendDescriptorSchema,
  s3RunnerBackendSchema,
} from "@lzc/contracts";
import type pg from "pg";
import { z } from "zod";
import type { Session } from "../auth/store.js";
import { parseServiceAccountKey } from "../credentials/key.js";
import { CredentialError } from "../credentials/profiles.js";
import type { ArtifactCrypto } from "../plans/crypto.js";
import { withTenant } from "../storage/database.js";

export const registerBackendSchema = z.strictObject({
  descriptor: s3BackendDescriptorSchema,
  credentials: s3RunnerBackendSchema.shape.credentials.refine((value) =>
    Object.values(value).every((credential) =>
      [...credential].every(
        (character) =>
          character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127,
      ),
    ),
  ),
});
const terraformStateSchema = z.looseObject({
  version: z.literal(4),
  lineage: z.string().min(1),
  serial: z.number().int().nonnegative().refine(Number.isSafeInteger),
  outputs: z
    .record(
      z.string(),
      z.looseObject({ value: z.unknown(), sensitive: z.boolean().optional() }),
    )
    .optional(),
  resources: z.array(
    z.looseObject({
      module: z.string().optional(),
      mode: z.string().optional(),
      type: z.string().optional(),
      name: z.string().optional(),
      instances: z
        .array(
          z.looseObject({
            attributes: z.record(z.string(), z.unknown()).optional(),
            deposed: z.string().optional(),
          }),
        )
        .optional(),
    }),
  ),
});
export type TerraformState = z.infer<typeof terraformStateSchema>;
export function managementRunnerKey(
  state: TerraformState,
  organizationId: string,
) {
  const resources = state.resources;
  const attributes = (type: string, name: string) => {
    const matches = resources.filter(
      (resource) =>
        resource.module === "module.management" &&
        resource.mode === "managed" &&
        resource.type === type &&
        resource.name === name,
    );
    if (
      matches.length !== 1 ||
      matches[0]!.instances?.length !== 1 ||
      matches[0]!.instances![0]!.deposed
    )
      return undefined;
    return matches[0]!.instances![0]!.attributes;
  };
  const key = attributes("stackit_service_account_key", "automation");
  if (!key) return undefined;
  try {
    const account = attributes("stackit_service_account", "automation");
    const role = attributes(
      "stackit_authorization_organization_role_assignment",
      "sa_owner",
    );
    const bucket = attributes("stackit_objectstorage_bucket", "tfstate");
    if (typeof key.json !== "string") throw new Error();
    const parsed = parseServiceAccountKey(JSON.parse(key.json));
    if (
      !account ||
      !role ||
      !bucket ||
      typeof account.project_id !== "string" ||
      account.project_id !== bucket.project_id ||
      key.project_id !== account.project_id ||
      key.service_account_email !== account.email ||
      parsed.credentials.iss !== account.email ||
      role.subject !== account.email ||
      role.role !== "owner" ||
      role.resource_id !== organizationId
    )
      throw new Error();
    return parsed;
  } catch {
    throw new CredentialError(409, "management_runner_key_not_verified");
  }
}
export function stateDocument(bytes: Buffer): TerraformState {
  try {
    if (!bytes.length || bytes.length > 16 * 1024 * 1024) throw new Error();
    return terraformStateSchema.parse(JSON.parse(bytes.toString("utf8")));
  } catch {
    throw new CredentialError(409, "state_invalid");
  }
}
export function contentHash(value: unknown): string {
  const canonical = JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        )
      : item,
  );
  return createHash("sha256").update(canonical).digest("hex");
}
export function migrationStateMatches(
  source: TerraformState,
  target: TerraformState,
): boolean {
  const sourceHash = contentHash(source);
  if (contentHash(target) === sourceHash) return true;
  const migrationPayloadHash = (state: TerraformState) =>
    contentHash({
      ...state,
      ...(Array.isArray(state.check_results)
        ? {
            check_results: [...state.check_results].sort((left, right) =>
              contentHash(left).localeCompare(contentHash(right)),
            ),
          }
        : {}),
    });
  return (
    source.terraform_version === "1.12.6" &&
    target.lineage !== source.lineage &&
    target.serial === 1 &&
    migrationPayloadHash({
      ...target,
      lineage: source.lineage,
      serial: source.serial,
    }) === migrationPayloadHash(source)
  );
}
export type RemoteState = { bytes: Buffer; identity: string } | null;
export type BackendReader = (
  backend: S3RunnerBackend,
  key: string,
) => Promise<RemoteState>;
export const readS3: BackendReader = async (backend, key) => {
  const parsed = s3RunnerBackendSchema.parse(backend);
  const client = new S3Client({
    endpoint: parsed.descriptor.endpoint,
    region: parsed.descriptor.region,
    credentials: parsed.credentials,
    followRegionRedirects: false,
    maxAttempts: 2,
  });
  try {
    const response = await client.send(
      new GetObjectCommand({ Bucket: parsed.descriptor.bucket, Key: key }),
      { abortSignal: AbortSignal.timeout(15000) },
    );
    if (!response.Body || (response.ContentLength ?? 0) > 16 * 1024 * 1024)
      throw new CredentialError(409, "state_invalid");
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      length += chunk.length;
      if (length > 16 * 1024 * 1024)
        throw new CredentialError(409, "state_invalid");
      chunks.push(Buffer.from(chunk));
    }
    const bytes = Buffer.concat(chunks);
    return {
      bytes,
      identity: contentHash([
        response.VersionId ?? null,
        response.ETag ?? null,
        createHash("sha256").update(bytes).digest("hex"),
      ]),
    };
  } catch (error) {
    if ((error as { name?: string }).name === "NoSuchKey") return null;
    if (error instanceof CredentialError) throw error;
    throw new CredentialError(503, "backend_read_failed");
  } finally {
    client.destroy();
  }
};

export async function stateForSource(
  client: pg.PoolClient,
  configurationId: string,
) {
  return (
    await client.query<{ state_key: string; backend_id: string | null }>(
      "SELECT s.state_key,s.backend_id FROM lzc.platform_states s WHERE s.configuration_id=$1 OR EXISTS(SELECT 1 FROM lzc.state_configuration_aliases a WHERE a.configuration_id=$1 AND a.state_key=s.state_key AND a.tenant_id=s.tenant_id)",
      [configurationId],
    )
  ).rows[0];
}

export async function bindStateSource(
  client: pg.PoolClient,
  session: Session,
  configurationId: string,
  stateKey: string,
) {
  await client.query(
    "INSERT INTO lzc.state_configuration_aliases(tenant_id,configuration_id,state_key) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
    [session.tenantId, configurationId, stateKey],
  );
  const bound = await stateForSource(client, configurationId);
  if (bound?.state_key !== stateKey)
    throw new CredentialError(409, "backend_binding_changed");
}

export class Backends {
  constructor(
    readonly pool: pg.Pool,
    readonly crypto: ArtifactCrypto,
    readonly read: BackendReader = readS3,
  ) {}
  async list(session: Session) {
    return withTenant(this.pool, session, async (client) => ({
      backends: (
        await client.query(
          "SELECT id,descriptor FROM lzc.state_backends ORDER BY created_at DESC LIMIT 100",
        )
      ).rows,
    }));
  }
  async register(session: Session, raw: unknown) {
    const input = registerBackendSchema.parse(raw);
    return withTenant(this.pool, session, async (client) =>
      this.insert(client, session, input),
    );
  }
  async insert(
    client: pg.PoolClient,
    session: Session,
    input: z.infer<typeof registerBackendSchema>,
  ) {
    const parsed = registerBackendSchema.parse(input);
    const id = randomUUID();
    const identity = contentHash([
      parsed.descriptor.endpoint,
      parsed.descriptor.bucket,
      parsed.descriptor.key,
    ]);
    const result = await client.query(
      "INSERT INTO lzc.state_backends(id,tenant_id,descriptor,identity_sha256,credentials_ciphertext) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id,descriptor",
      [
        id,
        session.tenantId,
        JSON.stringify(parsed.descriptor),
        identity,
        this.crypto.encrypt(
          Buffer.from(JSON.stringify(parsed.credentials)),
          session.tenantId,
          id,
          `backend:${id}`,
        ),
      ],
    );
    if (!result.rowCount)
      throw new CredentialError(409, "backend_already_registered");
    return result.rows[0] as { id: string; descriptor: S3BackendDescriptor };
  }
  async configuration(session: Session, id: string) {
    return withTenant(this.pool, session, async (client) => {
      const row = (
        await client.query(
          "SELECT descriptor FROM lzc.state_backends WHERE id=$1",
          [z.uuid().parse(id)],
        )
      ).rows[0];
      if (!row) throw new CredentialError(404, "backend_not_found");
      const descriptor = s3BackendDescriptorSchema.parse(row.descriptor);
      return { descriptor, configuration: s3BackendConfiguration(descriptor) };
    });
  }
  async configurationForSource(session: Session, configurationId: string) {
    return withTenant(this.pool, session, async (client) => {
      const state = await stateForSource(
        client,
        z.uuid().parse(configurationId),
      );
      if (!state?.backend_id)
        throw new CredentialError(404, "backend_not_found");
      const row = (
        await client.query(
          "SELECT id,descriptor FROM lzc.state_backends WHERE id=$1",
          [state.backend_id],
        )
      ).rows[0];
      if (!row) throw new CredentialError(404, "backend_not_found");
      const descriptor = s3BackendDescriptorSchema.parse(row.descriptor);
      return {
        id: row.id as string,
        descriptor,
        configuration: s3BackendConfiguration(descriptor),
      };
    });
  }
  async runner(
    client: pg.PoolClient,
    session: Session,
    id: string,
  ): Promise<S3RunnerBackend> {
    const row = (
      await client.query("SELECT * FROM lzc.state_backends WHERE id=$1", [id])
    ).rows[0];
    if (!row) throw new CredentialError(404, "backend_not_found");
    try {
      return s3RunnerBackendSchema.parse({
        kind: "s3",
        descriptor: row.descriptor,
        credentials: JSON.parse(
          this.crypto
            .decrypt(
              row.credentials_ciphertext,
              session.tenantId,
              id,
              `backend:${id}`,
            )
            .toString("utf8"),
        ),
      });
    } catch {
      throw new CredentialError(409, "backend_credentials_invalid");
    }
  }
  async current(backend: S3RunnerBackend) {
    if (await this.read(backend, `${backend.descriptor.key}.tflock`))
      throw new CredentialError(423, "state_locked");
    const remote = await this.read(backend, backend.descriptor.key);
    if (!remote) throw new CredentialError(409, "backend_state_missing");
    const document = stateDocument(remote.bytes);
    return { ...remote, document };
  }
}
