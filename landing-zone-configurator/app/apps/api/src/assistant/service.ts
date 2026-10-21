import { randomUUID } from "node:crypto";
import {
  type AssistantMergeConflict,
  type AssistantProposalChange,
  assistantProposalBaselineAvailable,
  assistantProposalConflicts,
  assistantProposalFields,
  assistantProposalValue,
  mergeAssistantDrafts,
  selectAssistantProposalFields,
} from "@lzc/contracts";
import {
  catalogue,
  commonNetworkAreas,
  compileCommonConfiguration,
  effectiveInput,
  isCommonDraft,
  type ObservabilityPlanCatalogue,
  objectValue,
  observabilityRetentionFindings,
  readEditorDraft,
} from "@lzc/domain";
import type pg from "pg";
import { z } from "zod";
import { StackitIdentities } from "../auth/stackit-identities.js";
import type { Session } from "../auth/store.js";
import type { PostgresCloudCatalogues } from "../credentials/catalogues.js";
import { withTenant } from "../storage/database.js";
import {
  applyAssistantChanges,
  assistantEmailListSchema,
  assistantFolderPatchSchema,
  assistantNetworkAreaSchema,
  assistantNetworkAreasSchema,
  assistantPublicDnsZone,
  assistantPublicNetworkArea,
  assistantScalarFields,
  chatMessageSchema,
  type Dialogue,
  validateDialogue,
} from "./dialogue.js";
import { assistantEditorPublicValues } from "./editor.js";
import { assistantPublicFirewall } from "./firewall.js";
import { buildAssistantKnowledge } from "./knowledge.js";
import {
  type AssistantCatalogueContext,
  AssistantInferenceError,
  type AssistantModelServing,
  type AssistantStream,
} from "./model-serving.js";

export class AssistantError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details?: {
      conflicts: AssistantMergeConflict[];
      configurationRevision: number;
    },
  ) {
    super(code);
  }
}

type Message = { id: string; role: "user" | "assistant"; content: string };
type Conversation = {
  id: string;
  revision: number;
  base_revision: number;
  knowledge_hash: string;
  expires_at: Date;
  messages: Message[];
  proposal: Dialogue | null;
  proposal_baseline: Record<string, unknown> | null;
};
type Configuration = { id: string; revision: number; document: unknown };

export function assistantPublicValues(
  document: unknown,
): Record<string, unknown> {
  const draft = readEditorDraft(document);
  if (!isCommonDraft(draft))
    throw new AssistantError(409, "assistant_common_configuration_required");
  const values = compileCommonConfiguration(draft);
  const template = catalogue.templates.find(
    (entry) => entry.id === draft.origin.templateId,
  );
  return {
    ...assistantEditorPublicValues(draft),
    "assistant.owner_email_is_template_default":
      values.owner_email !== undefined &&
      values.owner_email === template?.values.owner_email,
    "assistant.platform_draft": draft.projectTemplates !== undefined,
    "assistant.network_areas": commonNetworkAreas(draft).map(
      ({ key, region }) => ({
        key,
        region,
      }),
    ),
    rm_folders: Object.fromEntries(
      Object.entries(objectValue(effectiveInput(values, "rm_folders"))).map(
        ([key, folder]) => [
          key,
          {
            name: objectValue(folder).name,
            owner_emails: objectValue(folder).owner_emails ?? [],
            reader_emails: objectValue(folder).reader_emails ?? [],
          },
        ],
      ),
    ),
    organization_owners: effectiveInput(values, "organization_owners"),
    organization_auditors: effectiveInput(values, "organization_auditors"),
    "assistant.firewall_form":
      values.connectivity_regions != null
        ? "regional"
        : objectValue(values.connectivity).network_area != null ||
            objectValue(values.connectivity).firewall != null
          ? "single"
          : objectValue(values.connectivity).network_areas != null
            ? "map"
            : "none",
    "connectivity.firewall":
      values.connectivity_regions != null
        ? null
        : assistantPublicFirewall(objectValue(values.connectivity).firewall),
    "connectivity.firewalls":
      values.connectivity_regions != null ||
      objectValue(values.connectivity).firewalls == null
        ? null
        : Object.fromEntries(
            Object.entries(
              objectValue(objectValue(values.connectivity).firewalls),
            )
              .slice(0, 32)
              .map(([key, firewall]) => [
                key,
                assistantPublicFirewall(firewall),
              ]),
          ),
    ...Object.fromEntries(
      assistantScalarFields().map((field) => [
        field.path,
        values[field.path] ?? null,
      ]),
    ),
    "connectivity.dns_zones":
      values.connectivity_regions != null
        ? null
        : Object.fromEntries(
            Object.entries(
              objectValue(objectValue(values.connectivity).dns_zones),
            )
              .slice(0, 32)
              .map(([key, zone]) => [key, assistantPublicDnsZone(zone)]),
          ),
    "connectivity.network_areas":
      objectValue(values.connectivity).network_areas == null
        ? null
        : Object.fromEntries(
            Object.entries(
              objectValue(objectValue(values.connectivity).network_areas),
            )
              .slice(0, 32)
              .map(([key, area]) => [key, assistantPublicNetworkArea(area)]),
          ),
    "connectivity.network_area":
      objectValue(values.connectivity).network_area == null
        ? null
        : assistantPublicNetworkArea(
            objectValue(values.connectivity).network_area,
          ),
  };
}

function response(row: Conversation, configuration: Configuration) {
  const values = assistantPublicValues(configuration.document);
  const baseline =
    row.proposal_baseline ??
    (row.base_revision === configuration.revision ? values : null);
  return {
    id: row.id,
    revision: row.revision,
    baseRevision: row.base_revision,
    expiresAt: row.expires_at.toISOString(),
    messages: row.messages,
    proposal: row.proposal
      ? {
          ...row.proposal,
          changes: row.proposal.changes.map((change) => ({
            ...change,
            before: assistantProposalValue(baseline, change.path) ?? null,
            ...(assistantProposalBaselineAvailable(baseline, change.path)
              ? {}
              : { baselineAvailable: false }),
          })),
        }
      : null,
    stale:
      row.base_revision !== configuration.revision ||
      row.knowledge_hash !== buildAssistantKnowledge().sha256,
    authorizesExecution: false,
  };
}

function rebaseAccessSelections(
  changes: AssistantProposalChange[],
  original: Record<string, unknown> | null,
  current: Record<string, unknown>,
): AssistantProposalChange[] {
  const append = (
    proposed: unknown,
    before: unknown,
    existing: unknown,
    known: boolean,
  ) => {
    const incoming = assistantEmailListSchema.parse(proposed);
    const previous = known ? assistantEmailListSchema.parse(before ?? []) : [];
    return [
      ...new Set([
        ...assistantEmailListSchema.parse(existing ?? []),
        ...incoming.filter((email) => !previous.includes(email)),
      ]),
    ];
  };
  return changes.map((change) => {
    if (change.operation) return change;
    const known = original !== null && Object.hasOwn(original, change.path);
    if (["organization_owners", "organization_auditors"].includes(change.path))
      return {
        ...change,
        value: append(
          change.value,
          original?.[change.path],
          current[change.path],
          known,
        ),
      };
    if (change.path !== "rm_folders") return change;
    const records = z.record(z.string(), z.unknown());
    const previous = records.parse(original?.rm_folders ?? {});
    const existing = records.parse(current.rm_folders ?? {});
    return {
      ...change,
      value: Object.fromEntries(
        Object.entries(assistantFolderPatchSchema.parse(change.value)).map(
          ([key, folder]) => {
            const patch = { ...folder };
            for (const role of ["owner_emails", "reader_emails"] as const)
              if (Object.hasOwn(patch, role))
                patch[role] = append(
                  patch[role],
                  records.parse(previous[key] ?? {})[role],
                  records.parse(existing[key] ?? {})[role],
                  known,
                );
            return [key, patch];
          },
        ),
      ),
    };
  });
}

function completeNetworkSelection(
  changes: AssistantProposalChange[],
  values: Record<string, unknown>,
): Dialogue["changes"] {
  return changes.flatMap((change) => {
    if (!change.operation && change.path === "connectivity.network_area") {
      const parsed = assistantNetworkAreaSchema.safeParse({
        ...assistantNetworkAreaSchema
          .partial()
          .parse(values[change.path] ?? {}),
        ...assistantNetworkAreaSchema.partial().parse(change.value),
      });
      if (!parsed.success)
        throw new AssistantError(422, "assistant_invalid_selection");
      return [{ path: change.path, value: parsed.data }];
    }
    if (!change.operation && change.path === "connectivity.network_areas") {
      const partialAreas = z.record(
        z.string(),
        assistantNetworkAreaSchema.partial(),
      );
      const previous = partialAreas.parse(values[change.path] ?? {});
      const areas = { ...previous };
      for (const [key, area] of Object.entries(
        partialAreas.parse(change.value),
      ))
        areas[key] = { ...previous[key], ...area };
      const parsed = assistantNetworkAreasSchema.safeParse(areas);
      if (!parsed.success)
        throw new AssistantError(422, "assistant_invalid_selection");
      return [{ path: change.path, value: parsed.data }];
    }
    return validateDialogue(
      {
        explanation: "Ausgewählte Änderung",
        questions: [],
        changes: [change],
        references: ["configuration-contract"],
      },
      ["configuration-contract"],
    ).changes;
  });
}

export class AssistantConversations {
  private active = 0;
  constructor(
    private readonly pool: pg.Pool,
    private readonly model: Pick<AssistantModelServing, "converse"> &
      Partial<Pick<AssistantModelServing, "adviseTemplates">>,
    private readonly catalogues?: Pick<PostgresCloudCatalogues, "automatic"> &
      Partial<Pick<PostgresCloudCatalogues, "pim">>,
  ) {}

  private async loadObservabilityCatalogue(
    session: Session,
    id: string,
    localDocument?: unknown,
    changes?: { path: string }[],
  ): Promise<ObservabilityPlanCatalogue | undefined> {
    const affectsObservability = (items: { path: string }[]) =>
      items.some(
        (change) =>
          change.path === "observability" ||
          change.path.startsWith("observability."),
      );
    if (!this.catalogues || (changes && !affectsObservability(changes)))
      return undefined;
    const region = await this.work(
      session,
      id,
      async (client, configuration) => {
        if (!changes) {
          const row = (
            await client.query(
              "SELECT proposal FROM lzc.assistant_conversations WHERE configuration_id=$1",
              [id],
            )
          ).rows[0];
          const proposal = z
            .object({ changes: z.array(z.object({ path: z.string() })) })
            .safeParse(row?.proposal);
          if (!proposal.success || !affectsObservability(proposal.data.changes))
            return undefined;
        }
        const draft = readEditorDraft(localDocument ?? configuration.document);
        if (!isCommonDraft(draft)) return undefined;
        return compileCommonConfiguration(draft).region === "eu02"
          ? ("eu02" as const)
          : ("eu01" as const);
      },
    );
    if (!region) return undefined;
    // Credential/network reads finish before opening the proposal write transaction.
    return this.catalogues.automatic(session, region).catch(() => undefined);
  }

  private checkObservabilitySelection(
    draft: Parameters<typeof compileCommonConfiguration>[0],
    changes: { path: string }[],
    catalogue?: ObservabilityPlanCatalogue,
  ) {
    if (
      !changes.some(
        (change) =>
          change.path === "observability" ||
          change.path.startsWith("observability."),
      )
    )
      return;
    const values = compileCommonConfiguration(draft);
    if (values.observability == null) return;
    const region = values.region === "eu02" ? "eu02" : "eu01";
    const report = observabilityRetentionFindings(
      objectValue(values.observability),
      catalogue?.region === region ? catalogue : undefined,
    );
    if (report.findings.length)
      throw new AssistantError(
        422,
        "assistant_observability_plan_incompatible",
      );
  }

  private async productCatalogues(
    session: Session,
    regions: ("eu01" | "eu02")[],
  ): Promise<AssistantCatalogueContext> {
    const fields = [
      "gitFlavors",
      "vpnPlans",
      "kubernetesVersions",
      "machineTypes",
      "machineImages",
      "availabilityZones",
      "volumeTypes",
      "observabilityPlans",
      "bastionMachineTypes",
      "bastionImages",
      "bastionAvailabilityZones",
    ] as const;
    return {
      regions: await Promise.all(
        regions.map(async (region) => {
          const [productResult, pimResult] = await Promise.allSettled([
            this.catalogues?.automatic(session, region),
            this.catalogues?.pim?.(session, region),
          ]);
          const snapshot =
            productResult.status === "fulfilled" &&
            productResult.value?.region === region
              ? productResult.value
              : undefined;
          const pim =
            pimResult.status === "fulfilled" &&
            pimResult.value?.region === region
              ? pimResult.value
              : undefined;
          const skus = pim
            ? [...pim.skus].sort(
                (first, second) =>
                  Number(!!second.productSpecificAttributes?.planId) -
                  Number(!!first.productSpecificAttributes?.planId),
              )
            : [];
          return {
            region,
            fetchedAt: snapshot?.fetchedAt ?? null,
            pim: {
              status: pim ? ("available" as const) : ("unavailable" as const),
              source: "https://pim.api.stackit.cloud/v2",
              fetchedAt: pim?.fetchedAt ?? null,
              products: pim?.products ?? [],
              skus: skus.slice(0, 100),
              totalSkus: skus.length,
              truncated: skus.length > 100,
            },
            products: Object.fromEntries(
              fields.map((field) => {
                const part = snapshot?.[field];
                return [
                  field,
                  {
                    status: part?.status ?? "unavailable",
                    options:
                      part?.status === "available"
                        ? part.options
                            .slice(0, 50)
                            .map(({ value, label, capabilities }) => ({
                              value,
                              label,
                              ...(capabilities ? { capabilities } : {}),
                            }))
                        : [],
                    totalOptions: part?.options.length ?? 0,
                    truncated: (part?.options.length ?? 0) > 50,
                  },
                ];
              }),
            ),
          };
        }),
      ),
    };
  }

  async prune() {
    await this.pool.query("SELECT lzc_auth.prune_assistant_conversations()");
  }

  private workspace<T>(
    session: Session,
    task: (client: pg.PoolClient) => Promise<T>,
  ) {
    return withTenant(this.pool, session, async (client) => {
      await client.query(
        "SELECT lzc_auth.authorize_application($1,$2,'publish')",
        [session.id, session.tenantId],
      );
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('lzc.assistant-template-advice'),hashtext($1))",
        [`${session.tenantId}:${session.userId}`],
      );
      await client.query(
        "DELETE FROM lzc.assistant_template_advice WHERE tenant_id=$1 AND expires_at<=now()",
        [session.tenantId],
      );
      return task(client);
    });
  }

  getTemplateAdvice(session: Session) {
    return this.workspace(session, async (client) => {
      const row = (
        await client.query<{
          id: string;
          revision: number;
          expires_at: Date;
          messages: Message[];
          recommendation: Awaited<
            ReturnType<AssistantModelServing["adviseTemplates"]>
          > | null;
        }>("SELECT * FROM lzc.assistant_template_advice WHERE tenant_id=$1", [
          session.tenantId,
        ])
      ).rows[0];
      return row
        ? {
            id: row.id,
            revision: row.revision,
            expiresAt: row.expires_at.toISOString(),
            messages: row.messages,
            recommendation: row.recommendation,
            stale:
              !!row.recommendation &&
              row.recommendation.knowledgeSha256 !==
                buildAssistantKnowledge().sha256,
          }
        : null;
    });
  }

  removeTemplateAdvice(session: Session) {
    return this.workspace(session, async (client) => {
      await client.query(
        "DELETE FROM lzc.assistant_template_advice WHERE tenant_id=$1",
        [session.tenantId],
      );
    });
  }

  async sendTemplateAdvice(
    session: Session,
    text: string,
    stream?: AssistantStream,
  ) {
    const message = chatMessageSchema.parse(text);
    if (!this.model.adviseTemplates)
      throw new AssistantError(503, "assistant_unavailable");
    if (this.active >= 5) throw new AssistantError(429, "assistant_busy");
    this.active++;
    try {
      const base = await this.workspace(session, async (client) => {
        await client.query(
          "INSERT INTO lzc.assistant_template_advice(id,tenant_id,created_by) VALUES($1,$2,$3) ON CONFLICT(tenant_id,created_by) DO NOTHING",
          [randomUUID(), session.tenantId, session.userId],
        );
        const row = (
          await client.query<{
            id: string;
            revision: number;
            messages: Message[];
          }>(
            "SELECT id,revision,messages FROM lzc.assistant_template_advice WHERE tenant_id=$1",
            [session.tenantId],
          )
        ).rows[0];
        if (!row || row.messages.length >= 40)
          throw new AssistantError(409, "assistant_conversation_full");
        return row;
      });
      const recommendation = await this.model.adviseTemplates(
        base.messages,
        message,
        await this.productCatalogues(session, ["eu01", "eu02"]),
        stream,
      );
      stream?.signal?.throwIfAborted();
      if (recommendation.knowledgeSha256 !== buildAssistantKnowledge().sha256)
        throw new AssistantError(409, "assistant_knowledge_changed");
      const messages = [
        ...base.messages,
        { id: randomUUID(), role: "user", content: message },
        {
          id: randomUUID(),
          role: "assistant",
          content:
            recommendation.explanation +
            "\n" +
            recommendation.questions
              .map((question) =>
                typeof question === "string" ? question : question.text,
              )
              .join("\n"),
        },
      ];
      await this.workspace(session, async (client) => {
        stream?.signal?.throwIfAborted();
        const saved = await client.query(
          "UPDATE lzc.assistant_template_advice SET messages=$1,recommendation=$2,revision=revision+1 WHERE id=$3 AND revision=$4 AND expires_at>now() RETURNING id",
          [
            JSON.stringify(messages),
            JSON.stringify(recommendation),
            base.id,
            base.revision,
          ],
        );
        if (!saved.rowCount)
          throw new AssistantError(409, "assistant_conversation_changed");
      });
      return await this.getTemplateAdvice(session);
    } finally {
      this.active--;
    }
  }

  private work<T>(
    session: Session,
    id: string,
    task: (client: pg.PoolClient, configuration: Configuration) => Promise<T>,
  ) {
    return withTenant(this.pool, session, async (client) => {
      await client.query(
        "SELECT lzc_auth.authorize_application($1,$2,'publish')",
        [session.id, session.tenantId],
      );
      const result = await client.query<Configuration>(
        "SELECT id,revision,document FROM lzc.configurations WHERE id=$1 FOR UPDATE",
        [id],
      );
      const configuration = result.rows[0];
      if (!configuration)
        throw new AssistantError(404, "configuration_not_found");
      await client.query(
        "DELETE FROM lzc.assistant_conversations WHERE configuration_id=$1 AND expires_at<=now()",
        [id],
      );
      return task(client, configuration);
    });
  }

  get(session: Session, id: string) {
    return this.work(session, id, async (client, configuration) => {
      const row = (
        await client.query<Conversation>(
          "SELECT * FROM lzc.assistant_conversations WHERE configuration_id=$1",
          [id],
        )
      ).rows[0];
      return row ? response(row, configuration) : null;
    });
  }

  remove(session: Session, id: string) {
    return this.work(session, id, async (client) => {
      await client.query(
        "DELETE FROM lzc.assistant_conversations WHERE configuration_id=$1",
        [id],
      );
    });
  }

  async send(
    session: Session,
    id: string,
    revision: number,
    text: string,
    stream?: AssistantStream,
    localDraft?: unknown,
  ) {
    const message = chatMessageSchema.parse(text);
    if (this.active >= 5) throw new AssistantError(429, "assistant_busy");
    this.active++;
    try {
      const knowledge = buildAssistantKnowledge();
      const base = await this.work(
        session,
        id,
        async (client, configuration) => {
          if (configuration.revision !== revision)
            throw new AssistantError(409, "configuration_changed");
          const saved = readEditorDraft(configuration.document);
          const document = readEditorDraft(
            localDraft === undefined ? configuration.document : localDraft,
          );
          if (!isCommonDraft(saved) || !isCommonDraft(document))
            throw new AssistantError(
              409,
              "assistant_common_configuration_required",
            );
          if (document.id !== saved.id)
            throw new AssistantError(400, "assistant_invalid_request");
          const values = assistantPublicValues(document);
          await client.query(
            "INSERT INTO lzc.assistant_conversations(id,configuration_id,tenant_id,created_by,base_revision,knowledge_hash) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(configuration_id,created_by) DO NOTHING",
            [
              randomUUID(),
              id,
              session.tenantId,
              session.userId,
              revision,
              knowledge.sha256,
            ],
          );
          const row = (
            await client.query<Conversation>(
              "SELECT * FROM lzc.assistant_conversations WHERE configuration_id=$1",
              [id],
            )
          ).rows[0];
          if (!row)
            throw new AssistantError(409, "assistant_conversation_changed");
          if (row.messages.length >= 40)
            throw new AssistantError(409, "assistant_conversation_full");
          const context = (
            await client.query<{ messages: Message[]; expires_at: Date }>(
              "SELECT messages,expires_at FROM lzc.assistant_configuration_context WHERE configuration_id=$1 AND expires_at>now()",
              [id],
            )
          ).rows[0];
          return { row, values, context, document };
        },
      );
      const identity = await new StackitIdentities(this.pool).status(session);
      const modelValues = {
        ...base.values,
        "assistant.user_email": identity.verified
          ? (identity.identity?.email ?? null)
          : null,
      };
      const proposal = validateDialogue(
        await this.model.converse(
          {
            engineRevision: knowledge.engineRevision,
            knowledgeSha256: knowledge.sha256,
            groups: knowledge.groups,
          },
          modelValues,
          base.row.messages,
          message,
          await this.productCatalogues(session, [
            base.values.region === "eu02" ? "eu02" : "eu01",
          ]),
          base.context?.messages ?? [],
          stream,
        ),
        knowledge.rules.map((rule) => rule.id),
      );
      stream?.signal?.throwIfAborted();
      const catalogue = await this.loadObservabilityCatalogue(
        session,
        id,
        undefined,
        proposal.changes,
      );
      stream?.signal?.throwIfAborted();
      await this.work(session, id, async (_client, configuration) => {
        if (configuration.revision !== revision)
          throw new AssistantError(409, "configuration_changed");
        const draft = readEditorDraft(base.document);
        if (!isCommonDraft(draft))
          throw new AssistantError(
            409,
            "assistant_common_configuration_required",
          );
        try {
          const candidate = applyAssistantChanges(draft, proposal.changes);
          if (isCommonDraft(candidate))
            this.checkObservabilitySelection(
              candidate,
              proposal.changes,
              catalogue,
            );
        } catch (error) {
          if (error instanceof z.ZodError)
            throw new AssistantInferenceError("invalid_scope");
          throw error;
        }
      });
      return await this.work(session, id, async (client, configuration) => {
        stream?.signal?.throwIfAborted();
        if (configuration.revision !== revision)
          throw new AssistantError(409, "configuration_changed");
        const messages = [
          ...base.row.messages,
          { id: randomUUID(), role: "user", content: message },
          {
            id: randomUUID(),
            role: "assistant",
            content:
              proposal.explanation +
              "\n" +
              proposal.questions.map((question) => question.text).join("\n"),
          },
        ];
        const row = (
          await client.query<Conversation>(
            "UPDATE lzc.assistant_conversations SET messages=$1,proposal=$2,base_revision=$3,knowledge_hash=$6,proposal_baseline=$7,revision=revision+1 WHERE id=$4 AND revision=$5 AND expires_at>now() RETURNING *",
            [
              JSON.stringify(messages),
              JSON.stringify(proposal),
              revision,
              base.row.id,
              base.row.revision,
              knowledge.sha256,
              JSON.stringify(
                Object.fromEntries(
                  proposal.changes.map((change) => [
                    change.path,
                    assistantProposalValue(base.values, change.path) ?? null,
                  ]),
                ),
              ),
            ],
          )
        ).rows[0];
        if (!row)
          throw new AssistantError(409, "assistant_conversation_changed");
        return response(row, configuration);
      });
    } finally {
      this.active--;
    }
  }

  async preview(
    session: Session,
    id: string,
    conversationRevision: number,
    baseRevision: number,
    selectedFields: string[] | undefined,
    localDocument: unknown,
    baselineDocument: unknown,
    confirmedRevision?: number,
  ) {
    const catalogue = await this.loadObservabilityCatalogue(
      session,
      id,
      localDocument,
    );
    return this.work(session, id, async (client, configuration) => {
      const row = (
        await client.query<Conversation>(
          "SELECT * FROM lzc.assistant_conversations WHERE configuration_id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (
        !row?.proposal ||
        row.revision !== conversationRevision ||
        row.base_revision !== baseRevision
      )
        throw new AssistantError(409, "assistant_proposal_changed");
      const local = readEditorDraft(localDocument);
      const baseline = readEditorDraft(baselineDocument);
      const saved = readEditorDraft(configuration.document);
      if (
        !isCommonDraft(local) ||
        !isCommonDraft(baseline) ||
        !isCommonDraft(saved)
      )
        throw new AssistantError(
          409,
          "assistant_common_configuration_required",
        );
      if (local.id !== saved.id || baseline.id !== local.id)
        throw new AssistantError(400, "assistant_invalid_request");
      const merged = mergeAssistantDrafts(
        baseline,
        local,
        configuration.document,
      );
      const draft = readEditorDraft(merged.value);
      if (!isCommonDraft(draft))
        throw new AssistantError(
          409,
          "assistant_common_configuration_required",
        );
      let proposal: Dialogue;
      try {
        proposal = validateDialogue(
          row.proposal,
          buildAssistantKnowledge().rules.map((rule) => rule.id),
        );
      } catch (error) {
        if (
          error instanceof z.ZodError ||
          (error instanceof Error &&
            error.message === "assistant_invalid_proposal")
        )
          throw new AssistantError(409, "assistant_proposal_unsupported");
        throw error;
      }
      const original =
        row.proposal_baseline ??
        (row.base_revision === configuration.revision
          ? assistantPublicValues(configuration.document)
          : null);
      const changes = proposal.changes.map((change) => ({
        ...change,
        before: assistantProposalValue(original, change.path) ?? null,
      }));
      const fields = assistantProposalFields(changes);
      const selected = selectedFields ?? fields.map((field) => field.id);
      let selection: Dialogue["changes"];
      try {
        selection = completeNetworkSelection(
          rebaseAccessSelections(
            selectAssistantProposalFields(
              changes,
              selected,
              assistantPublicValues(draft),
            ),
            original,
            assistantPublicValues(draft),
          ),
          assistantPublicValues(draft),
        );
      } catch (error) {
        if (
          error instanceof z.ZodError ||
          (error instanceof Error &&
            error.message === "assistant_invalid_selection")
        )
          throw new AssistantError(422, "assistant_invalid_selection");
        throw error;
      }
      const conflicts = [
        ...merged.conflicts,
        ...assistantProposalConflicts(
          fields.filter((field) => selected.includes(field.id)),
          assistantPublicValues(draft),
          (path) => assistantProposalBaselineAvailable(original, path),
        ),
      ];
      if (
        (conflicts.length > 0 && confirmedRevision === undefined) ||
        (confirmedRevision !== undefined &&
          confirmedRevision !== configuration.revision)
      )
        throw new AssistantError(409, "assistant_merge_confirmation_required", {
          conflicts,
          configurationRevision: configuration.revision,
        });
      let candidate: ReturnType<typeof applyAssistantChanges>;
      try {
        candidate = applyAssistantChanges(draft, selection);
        if (isCommonDraft(candidate))
          this.checkObservabilitySelection(candidate, selection, catalogue);
      } catch (error) {
        if (
          error instanceof z.ZodError ||
          (error instanceof Error &&
            (error.message === "assistant_configuration_invalid" ||
              error.message === "assistant_invalid_proposal" ||
              error.message === "assistant_access_removal_not_supported" ||
              error.message === "assistant_folder_creation_not_supported" ||
              error.message.startsWith("assistant_firewall_") ||
              error.message.startsWith("assistant_dns_") ||
              error.message.startsWith("assistant_network_") ||
              error.message.startsWith("assistant_editor_") ||
              error.message.startsWith("assistant_audit_") ||
              error.message === "assistant_ambiguous_sandbox_identity" ||
              error.message === "assistant_platform_draft_required" ||
              error.message ===
                "assistant_project_instances_not_in_platform_draft" ||
              error.message === "Invalid Accelerator input contract"))
        )
          throw new AssistantError(422, "assistant_invalid_selection");
        throw error;
      }
      const remaining = fields
        .filter((field) => !selected.includes(field.id))
        .map((field) => field.id);
      const candidateValues = assistantPublicValues(candidate);
      const entryReplacements = new Set(
        fields
          .filter(
            (field) => field.operation === "replace" && field.keys.length > 0,
          )
          .map((field) => field.changePath),
      );
      return {
        configuration: {
          id,
          revision: configuration.revision,
          draft: candidate,
          persisted: false,
        },
        savedConfiguration: readEditorDraft(configuration.document),
        conversation: {
          ...response(row, { ...configuration, document: candidate }),
          proposal: remaining.length
            ? {
                ...proposal,
                changes: selectAssistantProposalFields(
                  changes,
                  remaining,
                  candidateValues,
                ).map((change) => ({
                  ...change,
                  before:
                    assistantProposalValue(
                      entryReplacements.has(change.path)
                        ? candidateValues
                        : original,
                      change.path,
                    ) ?? null,
                  ...(assistantProposalBaselineAvailable(original, change.path)
                    ? {}
                    : { baselineAvailable: false }),
                })),
              }
            : null,
        },
      };
    });
  }

  async accept(
    session: Session,
    id: string,
    conversationRevision: number,
    baseRevision: number,
    selectedFields?: string[],
  ) {
    const catalogue = await this.loadObservabilityCatalogue(session, id);
    return this.work(session, id, async (client, configuration) => {
      const row = (
        await client.query<Conversation>(
          "SELECT * FROM lzc.assistant_conversations WHERE configuration_id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (
        !row?.proposal ||
        row.revision !== conversationRevision ||
        row.base_revision !== baseRevision ||
        configuration.revision !== baseRevision ||
        row.knowledge_hash !== buildAssistantKnowledge().sha256
      )
        throw new AssistantError(409, "assistant_proposal_changed");
      const draft = readEditorDraft(configuration.document);
      if (!isCommonDraft(draft))
        throw new AssistantError(
          409,
          "assistant_common_configuration_required",
        );
      const proposal = validateDialogue(
        row.proposal,
        buildAssistantKnowledge().rules.map((rule) => rule.id),
      );
      if (!proposal.changes.length)
        throw new AssistantError(409, "assistant_no_changes");
      const values = assistantPublicValues(configuration.document);
      const changesWithBaseline = proposal.changes.map((change) => ({
        ...change,
        before: assistantProposalValue(values, change.path) ?? null,
      }));
      const fields = assistantProposalFields(changesWithBaseline);
      const selected = selectedFields ?? fields.map((field) => field.id);
      if (
        selected.length === 0 ||
        new Set(selected).size !== selected.length ||
        selected.some((id) => !fields.some((field) => field.id === id))
      )
        throw new AssistantError(422, "assistant_invalid_selection");
      const changes =
        selectedFields === undefined
          ? proposal.changes
          : completeNetworkSelection(
              selectAssistantProposalFields(
                changesWithBaseline,
                selected,
                values,
              ),
              values,
            );
      let candidate: ReturnType<typeof applyAssistantChanges>;
      try {
        candidate = applyAssistantChanges(draft, changes);
        if (isCommonDraft(candidate))
          this.checkObservabilitySelection(candidate, changes, catalogue);
      } catch (error) {
        if (
          selectedFields !== undefined &&
          error instanceof Error &&
          (error.message === "assistant_configuration_invalid" ||
            (changes.some((change) =>
              ["connectivity.firewall", "connectivity.firewalls"].includes(
                change.path,
              ),
            ) &&
              (error instanceof z.ZodError ||
                error.message.startsWith("assistant_firewall_"))))
        )
          throw new AssistantError(422, "assistant_invalid_selection");
        throw error;
      }
      const remainingIds = fields
        .filter((field) => !selected.includes(field.id))
        .map((field) => field.id);
      const remaining = remainingIds.length
        ? {
            ...proposal,
            changes: completeNetworkSelection(
              selectAssistantProposalFields(
                changesWithBaseline,
                remainingIds,
                assistantPublicValues(candidate),
              ),
              assistantPublicValues(candidate),
            ),
          }
        : null;
      const saved = (
        await client.query<{
          id: string;
          name: string;
          revision: number;
          updated_at: Date;
        }>(
          "UPDATE lzc.configurations SET document=$2,revision=revision+1,updated_at=now() WHERE id=$1 AND revision=$3 RETURNING id,name,revision,updated_at",
          [id, JSON.stringify(candidate), baseRevision],
        )
      ).rows[0];
      if (!saved) throw new AssistantError(409, "configuration_changed");
      await client.query(
        "UPDATE lzc.assistant_conversations SET proposal=$3,base_revision=$2,proposal_baseline=$4,revision=revision+1 WHERE id=$1",
        [
          row.id,
          saved.revision,
          remaining ? JSON.stringify(remaining) : null,
          remaining ? JSON.stringify(assistantPublicValues(candidate)) : null,
        ],
      );
      return {
        id: saved.id,
        name: saved.name,
        revision: saved.revision,
        updatedAt: saved.updated_at.toISOString(),
        draft: candidate,
      };
    });
  }
}
