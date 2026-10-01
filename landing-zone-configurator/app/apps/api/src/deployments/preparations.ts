import { createHash, randomUUID } from "node:crypto";
import {
  type ConfigurationRecord,
  initialPlanIssues,
  recordName,
  recordOrganization,
  supportedAcceleratorRevision,
} from "@lzc/domain";
import type pg from "pg";
import type { Session } from "../auth/store.js";
import type { CredentialCheck } from "../credentials/check.js";
import {
  CredentialError,
  type PostgresCredentialProfiles,
} from "../credentials/profiles.js";
import {
  type Repositories,
  type RepositoryTarget,
  workBranch,
} from "../github/repositories.js";
import { withTenant } from "../storage/database.js";

// Explicit reviewed code reference. Never take Accelerator code/version from a customer fork.
export const acceleratorCommit = supportedAcceleratorRevision;
export type PreparationInput = {
  target: RepositoryTarget;
  configurationId: string;
  head: string;
  credentialId: string;
};
export type PreparationManifest = {
  schemaVersion: 1;
  kind: "landing-zone-configurator-preparation";
  source: {
    repository: RepositoryTarget;
    branch: string;
    commit: string;
    configurationId: string;
  };
  accelerator: {
    repository: "stackitcloud/stackit-landing-zone";
    commit: string;
  };
  configuration: ConfigurationRecord;
  tfvarsSha256: string;
  exportVersion: 1;
  credential: { id: string; secretVersion: number; keyId: string };
  organization: { id: string; name: string };
  check: CredentialCheck;
  limitations: readonly string[];
};
export function preparationManifest(
  input: PreparationInput,
  snapshot: { document: ConfigurationRecord; head: string; tfvars: string },
  checked: { check: CredentialCheck; version: number; keyId: string },
): PreparationManifest {
  if (initialPlanIssues(snapshot.document).length)
    throw new CredentialError(409, "configuration_execution_not_supported");
  if (
    snapshot.head !== input.head ||
    snapshot.document.id !== input.configurationId ||
    checked.check.status !== "passed" ||
    checked.check.organizationId !== recordOrganization(snapshot.document) ||
    !checked.check.organizationName ||
    checked.version < 1
  )
    throw new CredentialError(409, "preparation_not_verified");
  return {
    schemaVersion: 1,
    kind: "landing-zone-configurator-preparation",
    source: {
      repository: input.target,
      branch: workBranch,
      commit: snapshot.head,
      configurationId: input.configurationId,
    },
    accelerator: {
      repository: "stackitcloud/stackit-landing-zone",
      commit: acceleratorCommit,
    },
    configuration: snapshot.document,
    tfvarsSha256: createHash("sha256").update(snapshot.tfvars).digest("hex"),
    exportVersion: 1,
    credential: {
      id: input.credentialId,
      secretVersion: checked.version,
      keyId: checked.keyId,
    },
    organization: {
      id: checked.check.organizationId,
      name: checked.check.organizationName,
    },
    check: checked.check,
    limitations: [
      "organization-read-only",
      "backend-not-configured",
      "runner-not-configured",
      "plan-not-created",
      "apply-not-approved",
    ],
  };
}
export class Preparations {
  constructor(
    private readonly pool: pg.Pool,
    private readonly repositories: Pick<Repositories, "prepareSnapshot">,
    private readonly profiles: Pick<
      PostgresCredentialProfiles,
      "verifyForPreparation"
    >,
  ) {}
  async list(session: Session) {
    return withTenant(
      this.pool,
      session,
      async (c) =>
        (
          await c.query(
            'SELECT id, name, credential_id AS "credentialId", manifest, created_at AS "createdAt" FROM lzc.deployment_preparations ORDER BY created_at DESC LIMIT 100',
          )
        ).rows,
    );
  }
  async create(session: Session, token: string, input: PreparationInput) {
    // Check role/ownership before GitHub or Secret access.
    await withTenant(this.pool, session, async (c) => {
      const result = await c.query(
        "SELECT p.id FROM lzc.credential_profiles p JOIN lzc.memberships m ON m.tenant_id=p.tenant_id AND m.user_id=p.owner_user_id WHERE p.id=$1 AND p.state='stored' AND m.role IN ('admin','deployer')",
        [input.credentialId],
      );
      if (!result.rows.length)
        throw new CredentialError(404, "credential_not_found");
    });
    const snapshot = await this.repositories.prepareSnapshot(
      token,
      input.target,
      input.configurationId,
      input.head,
    );
    const checked = await this.profiles.verifyForPreparation(
      session,
      input.credentialId,
      recordOrganization(snapshot.document),
    );
    if (checked.check.status !== "passed")
      throw new CredentialError(422, checked.check.code);
    const manifest = preparationManifest(input, snapshot, checked);
    const id = randomUUID();
    return withTenant(this.pool, session, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `preparations:${session.userId}`,
      ]);
      const count = await c.query(
        "SELECT count(*)::int AS count FROM lzc.deployment_preparations",
      );
      if (count.rows[0].count >= 100)
        throw new CredentialError(409, "preparation_limit_reached");
      // Recheck after external requests; deletion/revocation must not create a live binding.
      const profile = await c.query(
        "SELECT key_id AS \"keyId\" FROM lzc.credential_profiles WHERE id=$1 AND state='stored' FOR UPDATE",
        [input.credentialId],
      );
      if (profile.rows[0]?.keyId !== checked.keyId)
        throw new CredentialError(409, "credential_changed");
      await c.query(
        "INSERT INTO lzc.deployment_preparations(id,tenant_id,owner_user_id,credential_id,name,manifest) VALUES($1,$2,$3,$4,$5,$6::jsonb)",
        [
          id,
          session.tenantId,
          session.userId,
          input.credentialId,
          recordName(snapshot.document),
          JSON.stringify(manifest),
        ],
      );
      return { id };
    });
  }
  async remove(session: Session, id: string) {
    return withTenant(this.pool, session, async (c) => {
      const plans = await c.query(
        "SELECT id FROM lzc.plan_runs WHERE preparation_id=$1 LIMIT 1",
        [id],
      );
      if (plans.rowCount)
        throw new CredentialError(409, "preparation_has_plans");
      const result = await c.query(
        "DELETE FROM lzc.deployment_preparations WHERE id=$1",
        [id],
      );
      if (!result.rowCount)
        throw new CredentialError(404, "preparation_not_found");
    });
  }
}
