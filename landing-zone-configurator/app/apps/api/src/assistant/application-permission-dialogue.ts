import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  applicationAccessProfileSchema,
  applicationPermissionServiceMentioned,
  defaultApplicationAccessProfile,
  previewApplicationAccessTransition,
  projectTemplateDraftSchema,
  unknownApplicationPermissions,
  validateApplicationAccessProfile,
} from "@lzc/domain";
import { z } from "zod";
import { type Dialogue, validateDialogue } from "./dialogue.js";

export type MultiTemplatePermissionContext = {
  templates: Record<string, unknown>;
  originalRequest: string;
  services: string[];
  permissionTarget: "both" | "requester" | "automation";
  permissionNames: string[];
  platformServiceAccountEmails: string[];
  verifiedHumanEmail?: string;
  english: boolean;
};
export type MultiTemplatePermissionState = {
  chosen: Record<string, string>;
  ownerEmail?: string;
  confirmedLegacyKeys: string[];
  cancelled?: boolean;
};
export const initialMultiTemplatePermissionState =
  (): MultiTemplatePermissionState => ({ chosen: {}, confirmedLegacyKeys: [] });
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value !== null && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, canonical(item)]),
        )
      : value;
const saEmails = (context: MultiTemplatePermissionContext) =>
  [
    ...new Set(
      context.platformServiceAccountEmails.filter(
        (email) => z.email().safeParse(email).success,
      ),
    ),
  ].sort();
const humanEmail = (context: MultiTemplatePermissionContext) =>
  z.email().safeParse(context.verifiedHumanEmail).success &&
  !/@sa\.stackit\.cloud$/i.test(context.verifiedHumanEmail ?? "")
    ? context.verifiedHumanEmail
    : undefined;
export const multiTemplatePermissionHistoryText = (dialogue: Dialogue) =>
  [
    dialogue.explanation,
    ...dialogue.questions.map((question) => question.text),
  ].join("\n");
const title = (english: boolean) =>
  english
    ? "Reviewable service-permission additions for Public and Corporate templates."
    : "Überprüfbare Ergänzung der Dienstrechte für Public- und Corporate-Vorlagen.";
export const isMultiTemplatePermissionReply = (text: string) =>
  text.startsWith(title(false) + "\n") || text.startsWith(title(true) + "\n");
type Question = Dialogue["questions"][number] & {
  kind: "target" | "owner" | "legacy";
  key?: string;
};
function view(
  context: MultiTemplatePermissionContext,
  state: MultiTemplatePermissionState,
) {
  const english = context.english;
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify(
        canonical({
          ...context,
          platformServiceAccountEmails: saEmails(context),
          verifiedHumanEmail: humanEmail(context),
        }),
      ),
    )
    .digest("hex");
  const explanation = [
    title(english),
    (english ? "Requested services: " : "Angefragte Dienste: ") +
      context.services.join(", ") +
      "; " +
      (english ? "recipient: " : "Empfänger: ") +
      (context.permissionTarget === "both"
        ? english
          ? "requester and Application service account"
          : "Besteller und Application-Service-Account"
        : context.permissionTarget === "requester"
          ? english
            ? "requester"
            : "Besteller"
          : english
            ? "Application service account"
            : "Application-Service-Account"),
    (english ? "Draft version: " : "Entwurfsstand: ") + fingerprint,
  ];
  const questions: Question[] = [];
  const selected: [string, Record<string, unknown>][] = [];
  for (const kind of ["public", "corporate"]) {
    const candidates = Object.entries(context.templates).filter(
      ([key, value]) =>
        object(value).kind === kind &&
        (!state.chosen[kind] || state.chosen[kind] === key),
    );
    if (candidates.length !== 1) {
      const all = Object.entries(context.templates).filter(
        ([, value]) => object(value).kind === kind,
      );
      questions.push({
        kind: "target",
        key: kind,
        path: "projectTemplates",
        text:
          (english
            ? `Which ${kind} template should be changed?`
            : `Welche ${kind}-Vorlage soll geändert werden?`) +
          ` (${all.length}: ${all
            .slice(0, 6)
            .map(([key]) => key)
            .join(", ")})`,
        options: all
          .slice(0, 6)
          .map(
            ([key, value]) =>
              `${String(object(value).name ?? key).slice(0, 100)} (${key})`,
          ),
      });
    } else selected.push([candidates[0]![0], object(candidates[0]![1])]);
  }
  const finish = (changes: Dialogue["changes"] = []) => ({
    dialogue: validateDialogue(
      {
        explanation: explanation.join("\n"),
        questions: questions.map(
          ({ kind: _kind, key: _key, ...question }) => question,
        ),
        changes,
        references: ["project-templates"],
      },
      ["project-templates"],
    ),
    questions,
  });
  if (state.cancelled) {
    questions.length = 0;
    explanation.push(
      english
        ? "The legacy assignments are retained. No conversion or other change is proposed. Nothing is saved or executed."
        : "Die alten Zuweisungen bleiben erhalten. Keine Umstellung und keine andere Änderung vorgeschlagen. Noch nichts gespeichert oder ausgeführt.",
    );
    return finish();
  }
  if (questions.length) {
    explanation.push(
      english
        ? "Choose the exact targets first. Nothing has been changed or saved."
        : "Zuerst die genauen Vorlagen auswählen. Noch nichts gespeichert; es wird nichts ausgeführt.",
    );
    return finish();
  }
  const patches: Record<string, unknown> = {};
  const unassigned: string[] = [];
  let legacy = false;
  let blocked = false;
  for (const [key, template] of selected) {
    let settings = object(template.settings);
    let policy = template.parameterPolicy;
    let previous = applicationAccessProfileSchema.safeParse(
      template.accessProfile,
    );
    if (template.accessProfile === undefined) {
      legacy = true;
      const draft = projectTemplateDraftSchema.parse({
        ...template,
        id: "00000000-0000-4000-8000-000000000001",
        key,
      });
      const transition = previewApplicationAccessTransition(draft);
      const priorOwner =
        typeof settings.initial_owner_email === "string" &&
        z.email().safeParse(settings.initial_owner_email).success
          ? settings.initial_owner_email
          : "";
      previous = applicationAccessProfileSchema.safeParse(
        defaultApplicationAccessProfile(priorOwner),
      );
      const removals = JSON.stringify(transition.removed);
      if (removals.length > 750) {
        blocked = true;
        explanation.push(
          english
            ? `${key}: review the extensive legacy assignments in the editor before conversion.`
            : `${key}: umfangreiche alte Zuweisungen vor der Umstellung im Editor prüfen.`,
        );
        continue;
      }
      explanation.push(
        (english
          ? `${key}: recommended workload profile plus requested service rights. Removed legacy settings: `
          : `${key}: empfohlenes Workload-Profil plus angefragte Dienstrechte. Entfernte alte Einstellungen: `) +
          removals +
          (english
            ? ". Legacy role settings, including any implicit automation Owner default, are replaced by explicit workload rights; this is not an additive legacy-role merge."
            : ". Alte Rolleneinstellungen, einschließlich möglicher impliziter Automation-Owner-Standards, werden durch explizite Workload-Rechte ersetzt; dies ist keine bloße Ergänzung alter Rollen."),
      );
      if (!state.confirmedLegacyKeys.includes(key))
        questions.push({
          kind: "legacy",
          key,
          path: "projectTemplates",
          text: english
            ? `May ${key} replace the listed legacy IAM settings and any implicit automation Owner default with the recommended workload profile? Other settings and an existing explicit initial owner stay unchanged.`
            : `Darf ${key} die aufgeführten alten IAM-Einstellungen und gegebenenfalls implizite Automation-Owner-Standards durch das empfohlene Workload-Profil ersetzen? Andere Einstellungen und ein vorhandener expliziter initialer Owner bleiben erhalten.`,
          options: [
            english
              ? `Confirm workload conversion for ${key}`
              : `Workload-Umstellung für ${key} bestätigen`,
            english
              ? "Retain legacy assignments"
              : "Alte Zuweisungen beibehalten",
          ],
        });
      settings = transition.patch.settings ?? {};
      policy = transition.patch.parameterPolicy;
    }
    if (!previous.success) {
      blocked = true;
      explanation.push(
        english
          ? `${key}: correct the invalid existing access profile in the editor first.`
          : `${key}: das ungültige vorhandene Rechteprofil zuerst im Editor korrigieren.`,
      );
      continue;
    }
    if (previous.data.mode === "owner") continue;
    const old = previous.data;
    if (
      old.initialOwnerEmail.trim() &&
      !z.email().safeParse(old.initialOwnerEmail).success
    ) {
      blocked = true;
      explanation.push(
        english
          ? `${key}: correct the existing invalid owner address in the editor.`
          : `${key}: die bestehende ungültige Owner-Adresse im Editor korrigieren.`,
      );
      continue;
    }
    if (!old.initialOwnerEmail.trim()) unassigned.push(key);
    const additions = context.permissionNames.filter((permission) =>
      context.services.includes(permission.split(".")[0] ?? permission),
    );
    const profile = applicationAccessProfileSchema.parse({
      ...old,
      initialOwnerEmail: old.initialOwnerEmail.trim()
        ? old.initialOwnerEmail
        : (state.ownerEmail ?? ""),
      permissions:
        context.permissionTarget === "automation"
          ? old.permissions
          : [...new Set([...old.permissions, ...additions])],
      automationPermissions:
        context.permissionTarget === "requester"
          ? old.automationPermissions
          : [...new Set([...old.automationPermissions, ...additions])],
    });
    validateApplicationAccessProfile(
      profile,
      settings as Record<string, z.infer<ReturnType<typeof z.json>>>,
      object(policy).fields
        ? object(object(policy).fields).role_assignments
        : undefined,
      false,
    );
    if (unknownApplicationPermissions(profile, context.permissionNames).length)
      throw Error("permission_dialogue_unknown_permissions");
    if (template.accessProfile === undefined)
      patches[key] = {
        ...template,
        settings,
        ...(policy ? { parameterPolicy: policy } : {}),
        accessProfile: profile,
      };
    else if (!isDeepStrictEqual(old, profile))
      patches[key] = { accessProfile: profile };
  }
  if (unassigned.length && !state.ownerEmail) {
    const emails = saEmails(context),
      human = humanEmail(context);
    questions.unshift({
      kind: "owner",
      path: "projectTemplates",
      text: english
        ? `Which central initial owner should the unassigned templates ${unassigned.join(", ")} share? Existing owners stay unchanged. Use the platform service account, verified signed-in user or a valid email address.`
        : `Welchen gemeinsamen zentralen initialen Owner sollen die noch unbesetzten Vorlagen ${unassigned.join(", ")} erhalten? Vorhandene Owner bleiben unverändert. Plattform-Service-Account, verifiziert angemeldeter Benutzer oder gültige E-Mail-Adresse möglich.`,
      options: [
        ...emails.map((email) =>
          english
            ? `Platform service account (${email})`
            : `Plattform-Service-Account (${email})`,
        ),
        ...(human
          ? [
              english
                ? `Verified signed-in user (${human})`
                : `Verifiziert angemeldeter Benutzer (${human})`,
            ]
          : []),
      ].slice(0, 6),
    });
    if (emails.length > 1)
      explanation.push(
        english
          ? "Several platform service accounts are available; choose one explicit email."
          : "Mehrere Plattform-Service-Accounts verfügbar; bitte eine konkrete E-Mail auswählen.",
      );
  }
  explanation.push(
    english
      ? "Existing modern profiles, assigned owners and unrelated fields are preserved. Review and accept the proposed draft separately; nothing is saved, published or executed. A valid owner is required before publication."
      : "Bestehende moderne Profile, zugewiesene Owner und andere Felder bleiben erhalten. Den Vorschlag separat prüfen und übernehmen; noch nichts gespeichert, veröffentlicht oder ausgeführt. Vor Veröffentlichung ist ein gültiger Owner erforderlich.",
  );
  if (blocked) {
    questions.length = 0;
    return finish();
  }
  if (questions.some((question) => question.kind === "legacy")) return finish();
  if (!Object.keys(patches).length) return finish();
  const value = legacy
    ? Object.fromEntries(
        Object.entries(context.templates).map(([key, template]) => [
          key,
          patches[key]
            ? { ...object(template), ...object(patches[key]) }
            : template,
        ]),
      )
    : patches;
  return finish([
    {
      path: "projectTemplates",
      operation: legacy ? "replace" : "merge",
      value: z.record(z.string(), z.json()).parse(value),
    },
  ]);
}
export function buildMultiTemplatePermissionDialogue(
  context: MultiTemplatePermissionContext,
  state = initialMultiTemplatePermissionState(),
): Dialogue {
  return view(context, state).dialogue;
}
export function applyMultiTemplatePermissionAnswers(
  context: MultiTemplatePermissionContext,
  state: MultiTemplatePermissionState,
  reply: string,
): MultiTemplatePermissionState {
  const { questions } = view(context, state);
  if (!questions.length) throw Error("permission_dialogue_not_pending");
  const blocks = reply.trim().split("\n\n");
  const next = structuredClone(state);
  const answered = new Set<Question>();
  for (const block of blocks) {
    const wrapped = questions.find((question) =>
      block.startsWith(`${question.text}\nMeine Antwort: `),
    );
    const selected = wrapped
      ? block.slice(`${wrapped.text}\nMeine Antwort: `.length).trim()
      : block.trim();
    const possible = wrapped ? [wrapped] : questions;
    const matches = possible.flatMap((question) => {
      if (question.kind === "target")
        return Object.entries(context.templates)
          .filter(
            ([key, value]) =>
              object(value).kind === question.key &&
              question.options?.includes(
                `${String(object(value).name ?? key).slice(0, 100)} (${key})`,
              ) &&
              [
                key,
                String(object(value).name ?? key),
                `${String(object(value).name ?? key).slice(0, 100)} (${key})`,
              ].includes(selected),
          )
          .map(([key]) => ({ question, value: key }));
      if (question.kind === "legacy")
        return question.options?.includes(selected)
          ? [{ question, value: selected }]
          : [];
      const emails = saEmails(context),
        human = humanEmail(context);
      let email: string | undefined;
      if (z.email().safeParse(selected).success) email = selected;
      else if (
        /^(?:(?:der|den|the)\s+)?(?:plattform|platform)[- ]service[- ]account$/i.test(
          selected,
        )
      ) {
        if (emails.length === 1) email = emails[0];
        else return [{ question, value: "" }];
      } else if (
        /^(?:ich|(?:(?:der|mein)\s+)?(?:verifiziert\s+)?angemeldeter (?:Benutzer|Nutzer)|verified signed-in user)$/i.test(
          selected,
        )
      )
        email = human;
      else
        email = [...emails, ...(human ? [human] : [])].find(
          (candidate) =>
            question.options?.includes(selected) &&
            selected.endsWith(`(${candidate})`),
        );
      return email ? [{ question, value: email }] : [];
    });
    if (matches.length !== 1)
      throw Error("permission_dialogue_answer_unconfirmed");
    const { question, value } = matches[0]!;
    if (answered.has(question))
      throw Error("permission_dialogue_duplicate_answer");
    answered.add(question);
    if (question.kind === "target") next.chosen[question.key!] = value;
    else if (question.kind === "owner") {
      if (value) next.ownerEmail = value;
    } else if (
      value ===
      (context.english
        ? "Retain legacy assignments"
        : "Alte Zuweisungen beibehalten")
    )
      next.cancelled = true;
    else
      next.confirmedLegacyKeys = [
        ...new Set([...next.confirmedLegacyKeys, question.key!]),
      ];
  }
  return next;
}

export type MultiTemplatePermissionBase = Pick<
  MultiTemplatePermissionContext,
  | "templates"
  | "permissionNames"
  | "platformServiceAccountEmails"
  | "verifiedHumanEmail"
>;
/** Only a still-open canonical server dialogue can interpret a short owner/confirmation reply. */
export function resumeMultiTemplatePermissionDialogue(
  base: MultiTemplatePermissionBase,
  history: { role: "user" | "assistant"; content: string }[],
  message: string,
): Dialogue | null {
  if (
    history.at(-1)?.role !== "assistant" ||
    !isMultiTemplatePermissionReply(history.at(-1)!.content)
  )
    return null;
  const plausible =
    z.email().safeParse(message.trim()).success ||
    /^(?:(?:der|den|the)\s+)?(?:plattform|platform)[- ]service[- ]account$/i.test(
      message.trim(),
    ) ||
    /^(?:ich|(?:(?:der|mein)\s+)?(?:verifiziert\s+)?angemeldeter (?:Benutzer|Nutzer)|verified signed-in user)$/i.test(
      message.trim(),
    ) ||
    message.includes("\nMeine Antwort: ") ||
    Object.keys(base.templates).includes(message.trim()) ||
    Object.entries(base.templates).some(([key, value]) =>
      [
        String(object(value).name ?? key),
        `${String(object(value).name ?? key).slice(0, 100)} (${key})`,
      ].includes(message.trim()),
    ) ||
    /^Workload-Umstellung für [a-z0-9-]+ bestätigen$|^Confirm workload conversion for [a-z0-9-]+$|^(?:Alte Zuweisungen beibehalten|Retain legacy assignments)$/.test(
      message.trim(),
    );
  if (!plausible) return null;
  for (
    let index = Math.max(0, history.length - 12);
    index < history.length - 1;
    index++
  ) {
    const original = history[index],
      reply = history[index + 1];
    if (
      original?.role !== "user" ||
      reply?.role !== "assistant" ||
      !isMultiTemplatePermissionReply(reply.content)
    )
      continue;
    const english = reply.content.startsWith(title(true) + "\n");
    const line = reply.content.split("\n")[1] ?? "";
    const match =
      /^(?:Angefragte Dienste|Requested services): ([a-z0-9.-]+(?:, [a-z0-9.-]+)*); (?:Empfänger|recipient): (.+)$/.exec(
        line,
      );
    if (!match) continue;
    const services = match[1]!.split(", ");
    const target = (
      {
        Besteller: "requester",
        requester: "requester",
        "Application-Service-Account": "automation",
        "Application service account": "automation",
        "Besteller und Application-Service-Account": "both",
        "requester and Application service account": "both",
      } as const
    )[match[2]! as "Besteller"];
    if (
      !target ||
      !services.length ||
      services.length > 60 ||
      new Set(services).size !== services.length ||
      !services.every(
        (service) =>
          base.permissionNames.some((permission) =>
            permission.startsWith(service + "."),
          ) && applicationPermissionServiceMentioned(service, original.content),
      )
    )
      continue;
    const context: MultiTemplatePermissionContext = {
      ...base,
      originalRequest: original.content,
      services,
      permissionTarget: target,
      english,
    };
    let state = initialMultiTemplatePermissionState();
    let valid = true;
    for (let cursor = index + 1; cursor < history.length; cursor += 2) {
      const expected = buildMultiTemplatePermissionDialogue(context, state);
      const actual = history[cursor];
      if (
        !expected.questions.length ||
        actual?.role !== "assistant" ||
        actual.content !== multiTemplatePermissionHistoryText(expected)
      ) {
        valid = false;
        break;
      }
      const answer =
        cursor + 1 < history.length
          ? history[cursor + 1]
          : { role: "user", content: message };
      if (answer?.role !== "user") {
        valid = false;
        break;
      }
      try {
        state = applyMultiTemplatePermissionAnswers(
          context,
          state,
          answer.content,
        );
      } catch {
        valid = false;
        break;
      }
    }
    if (valid) return buildMultiTemplatePermissionDialogue(context, state);
  }
  throw Error("permission_dialogue_context_changed");
}
