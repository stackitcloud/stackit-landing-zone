import {
  applicationProjectPermissionNames,
  createEditorConfiguration,
  defaultApplicationAccessProfile,
} from "@lzc/domain";
import { expect, it } from "vitest";
import {
  applyMultiTemplatePermissionAnswers as answer,
  buildMultiTemplatePermissionDialogue as build,
  initialMultiTemplatePermissionState as initial,
  type MultiTemplatePermissionContext,
  resumeMultiTemplatePermissionDialogue as resume,
  multiTemplatePermissionHistoryText as text,
} from "../apps/api/src/assistant/application-permission-dialogue.js";
import { applyAssistantChanges } from "../apps/api/src/assistant/dialogue.js";
import { assistantPublicValues } from "../apps/api/src/assistant/service.js";
import { legacyAccessTemplate } from "./fixtures/application-access-transition.js";

const email = "platform@sa.stackit.cloud";
function fixture(legacy = true) {
  const draft = createEditorConfiguration("hub-and-spoke", crypto.randomUUID());
  for (const t of draft.projectTemplates!)
    if (t.kind === "public" || t.kind === "corporate") {
      if (t.kind === "corporate") t.key = "central";
      t.accessProfile = defaultApplicationAccessProfile("");
      if (legacy && t.kind === "corporate") {
        delete t.accessProfile;
        t.settings.automation_role = "custom-reader";
      }
    }
  const context: MultiTemplatePermissionContext = {
    templates: assistantPublicValues(draft).projectTemplates as Record<
      string,
      unknown
    >,
    originalRequest:
      "Public und Corporate: Kubernetes für Besteller und Service Account ergänzen.",
    services: ["ske"],
    permissionTarget: "both",
    permissionNames: [...applicationProjectPermissionNames],
    platformServiceAccountEmails: [email, email],
    verifiedHumanEmail: "human@example.com",
    english: false,
  };
  return { draft, context };
}
function history(c: MultiTemplatePermissionContext) {
  return [
    { role: "user" as const, content: c.originalRequest },
    { role: "assistant" as const, content: text(build(c)) },
  ];
}
it.each(["Der Platform Service Account", "Der Plattform-Service-Account"])(
  "resolves grounded shared alias %s, requiring separate explicit legacy conversion",
  (alias) => {
    const { draft, context } = fixture();
    const before = structuredClone(draft);
    const first = build(context);
    expect(first.changes).toEqual([]);
    expect(first.questions).toHaveLength(2);
    expect(
      first.questions.filter((q) => q.text.includes("gemeinsamen")),
    ).toHaveLength(1);
    const owner = resume(context, history(context), alias)!;
    expect(owner.changes).toEqual([]);
    expect(owner.questions).toHaveLength(1);
    const h = [
      ...history(context),
      { role: "user" as const, content: alias },
      { role: "assistant" as const, content: text(owner) },
    ];
    const final = resume(
      context,
      h,
      `${owner.questions[0]!.text}\nMeine Antwort: Workload-Umstellung für central bestätigen`,
    )!;
    expect(final.questions).toEqual([]);
    expect(final.changes[0]!.operation).toBe("replace");
    const result = applyAssistantChanges(draft, final.changes);
    const expected = structuredClone(draft);
    for (const t of expected.projectTemplates!)
      if (t.kind === "public" || t.kind === "corporate") {
        t.accessProfile = defaultApplicationAccessProfile(email);
        if (t.accessProfile.mode !== "granular") throw Error("fixture");
        const additions = applicationProjectPermissionNames.filter((p) =>
          p.startsWith("ske."),
        );
        t.accessProfile.permissions = [
          ...new Set([...t.accessProfile.permissions, ...additions]),
        ];
        t.accessProfile.automationPermissions = [
          ...new Set([...t.accessProfile.automationPermissions, ...additions]),
        ];
        if (t.kind === "corporate") delete t.settings.automation_role;
      }
    expect(result).toEqual(expected);
    expect(draft).toEqual(before);
  },
);
it("accepts actual multi-question UI wrapper atomically and rejects duplicates or broad yes", () => {
  const { context } = fixture();
  const first = build(context);
  const reply = first.questions
    .map(
      (q) =>
        `${q.text}\nMeine Antwort: ${q.text.includes("gemeinsamen") ? "Der Plattform-Service-Account" : "Workload-Umstellung für central bestätigen"}`,
    )
    .join("\n\n");
  expect(resume(context, history(context), reply)!.changes).toHaveLength(1);
  expect(() => answer(context, initial(), reply + "\n\n" + reply)).toThrow(
    "duplicate",
  );
  expect(() => answer(context, initial(), "Ja")).toThrow("unconfirmed");
});
it("does not choose the first SA or an unverified human and preserves assigned owners", () => {
  const { draft, context } = fixture(false);
  context.platformServiceAccountEmails = [email, "other@sa.stackit.cloud"];
  const unresolved = resume(
    context,
    history(context),
    "Der Platform Service Account",
  )!;
  expect(unresolved.questions).toHaveLength(1);
  expect(JSON.stringify(unresolved.changes)).not.toContain(email);
  delete context.verifiedHumanEmail;
  expect(() => resume(context, history(context), "ich")).toThrow();
  const corporate = draft.projectTemplates!.find(
    (t) => t.kind === "corporate",
  )!;
  corporate.accessProfile = defaultApplicationAccessProfile(
    "existing@example.com",
  );
  context.templates = assistantPublicValues(draft).projectTemplates as Record<
    string,
    unknown
  >;
  const final = resume(context, history(context), "new@example.com")!;
  const result = applyAssistantChanges(draft, final.changes);
  expect(
    (
      result.projectTemplates!.find((t) => t.kind === "corporate")!
        .accessProfile as { initialOwnerEmail: string }
    ).initialOwnerEmail,
  ).toBe("existing@example.com");
});
it("preserves an explicit legacy owner and cancels all changes when conversion refused", () => {
  const { draft, context } = fixture();
  const corp = draft.projectTemplates!.find((t) => t.kind === "corporate")!;
  corp.settings.initial_owner_email = "legacy@example.com";
  context.templates.central = {
    ...(context.templates.central as Record<string, unknown>),
    settings: corp.settings,
  };
  const state = answer(
    context,
    initial(),
    "Workload-Umstellung für central bestätigen",
  );
  const final = build(context, answer(context, state, "new@example.com"));
  expect(
    (
      final.changes[0]!.value as Record<
        string,
        { accessProfile: { initialOwnerEmail: string } }
      >
    ).central!.accessProfile.initialOwnerEmail,
  ).toBe("legacy@example.com");
  const refused = resume(
    context,
    history(context),
    "Alte Zuweisungen beibehalten",
  )!;
  expect(refused.changes).toEqual([]);
  expect(refused.questions).toEqual([]);
});
it("rejects stale canonical context, changed metadata and original requirements; never resumes discarded/new topics", () => {
  const { context } = fixture();
  const h = history(context);
  for (const change of ["template", "metadata", "original"]) {
    const c = structuredClone(context),
      old = structuredClone(h);
    if (change === "template")
      (Object.values(c.templates)[0] as Record<string, unknown>).name =
        "Changed";
    if (change === "metadata")
      c.platformServiceAccountEmails = ["changed@sa.stackit.cloud"];
    if (change === "original") old[0]!.content += " changed";
    expect(() => resume(c, old, "Der Platform Service Account")).toThrow(
      "context_changed",
    );
  }
  expect(
    resume(
      context,
      [...h, { role: "assistant", content: "Proposal discarded; closed." }],
      "Der Platform Service Account",
    ),
  ).toBeNull();
  expect(resume(context, h, "Bitte stattdessen DNS erklären.")).toBeNull();
  expect(
    resume(
      context,
      [
        ...h,
        { role: "user", content: "new topic" },
        { role: "assistant", content: "DNS information" },
      ],
      "Der Platform Service Account",
    ),
  ).toBeNull();
});

it("discloses and removes only explicit legacy IAM fields, preserving full Owner and unrelated snapshots", () => {
  const { draft, context } = fixture();
  const publicTemplate = draft.projectTemplates!.find(
    (t) => t.kind === "public",
  )!;
  publicTemplate.accessProfile = { schemaVersion: 1, mode: "owner" };
  const corp = draft.projectTemplates!.find((t) => t.kind === "corporate")!;
  const imported = structuredClone(legacyAccessTemplate);
  Object.assign(corp, { ...imported, id: corp.id, key: "central" });
  context.templates = assistantPublicValues(draft).projectTemplates as Record<
    string,
    unknown
  >;
  const first = build(context);
  for (const field of [
    "custom_roles",
    "role_assignments",
    "automation_role",
    "parameterPolicy.fields.role_assignments",
  ])
    expect(first.explanation).toContain(field);
  expect(first.changes).toEqual([]);
  const state = answer(
    context,
    answer(context, initial(), "owner-new@example.test"),
    "Workload-Umstellung für central bestätigen",
  );
  const final = build(context, state);
  const actual = applyAssistantChanges(draft, final.changes);
  const expected = structuredClone(draft);
  const target = expected.projectTemplates!.find(
    (t) => t.kind === "corporate",
  )!;
  for (const key of ["custom_roles", "role_assignments", "automation_role"])
    delete target.settings[key];
  delete target.parameterPolicy!.fields.role_assignments;
  target.accessProfile = defaultApplicationAccessProfile(
    "owner-new@example.test",
  );
  if (target.accessProfile.mode !== "granular") throw Error("fixture");
  for (const list of [
    target.accessProfile.permissions,
    target.accessProfile.automationPermissions,
  ])
    for (const p of applicationProjectPermissionNames.filter((p) =>
      p.startsWith("ske."),
    ))
      if (!list.includes(p)) list.push(p);
  expect(actual).toEqual(expected);
});

it("explicitly states unsaved and non-executing status during ambiguous target selection", () => {
  const { context } = fixture();
  const corporate = structuredClone(context.templates.central) as Record<
    string,
    unknown
  >;
  context.templates["second-corporate"] = {
    ...corporate,
    name: "Second corporate",
  };
  const response = build(context);
  expect(response.changes).toEqual([]);
  expect(response.questions).toHaveLength(1);
  expect(response.questions[0]!.text).toContain("corporate");
  expect(response.explanation).toMatch(/noch (?:nichts|nicht) gespeichert/i);
  expect(response.explanation).toContain("es wird nichts ausgeführt");
});
