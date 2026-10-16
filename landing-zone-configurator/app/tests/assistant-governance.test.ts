import { randomUUID } from "node:crypto";
import {
  assistantProposalFields,
  selectAssistantProposalFields,
} from "@lzc/contracts";
import {
  compileCommonConfiguration,
  createCommonConfiguration,
  effectiveInput,
  exportCommonTfvars,
  objectValue,
  setCommonInput,
} from "@lzc/domain";
import { expect, it, vi } from "vitest";
import {
  applyAssistantChanges,
  type assistantAccessPaths,
  validateDialogue,
} from "../apps/api/src/assistant/dialogue.js";
import { buildAssistantKnowledge } from "../apps/api/src/assistant/knowledge.js";
import { AssistantModelServing } from "../apps/api/src/assistant/model-serving.js";
import { assistantPublicValues } from "../apps/api/src/assistant/service.js";

const configuration = {
  baseUrl: "https://api.openai-compat.model-serving.eu01.onstackit.cloud/v1",
  model: "Qwen/Qwen3-VL-235B-A22B-Instruct-FP8",
  token: "test-only-private-token",
  timeoutMs: 1000,
};
function fixture() {
  let draft = createCommonConfiguration("standalone", randomUUID());
  draft = setCommonInput(draft, "owner_email", "saved-user@example.test");
  draft = setCommonInput(draft, "organization_owners", [
    "existing-owner@example.test",
  ]);
  draft = setCommonInput(draft, "organization_auditors", [
    "existing-auditor@example.test",
  ]);
  const folders = objectValue(
    effectiveInput(compileCommonConfiguration(draft), "rm_folders"),
  );
  draft = setCommonInput(draft, "rm_folders", {
    ...folders,
    platform: {
      ...objectValue(folders.platform),
      owner_emails: ["folder-owner@example.test"],
      reader_emails: ["folder-reader@example.test"],
    },
  });
  const knowledge = buildAssistantKnowledge();
  return {
    draft,
    values: assistantPublicValues(draft),
    selection: {
      engineRevision: knowledge.engineRevision,
      knowledgeSha256: knowledge.sha256,
      groups: knowledge.groups,
    },
  };
}
function model(
  paths: (typeof assistantAccessPaths)[number][],
  options: {
    emailSource?: "saved-owner" | "verified-user" | "explicit";
    folderKeys?: string[];
    allFolders?: boolean;
    source?: string;
    topic?: string;
  } = {},
) {
  const request = vi.fn<typeof fetch>(async () =>
    Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: JSON.stringify({
              topic: options.topic ?? "governance-folders",
              mode: "draft",
              requirements: [],
              accessAssignment: {
                paths,
                source: options.source ?? "current",
                emailSource: options.emailSource ?? "saved-owner",
                folderKeys: options.folderKeys ?? [],
                allFolders: options.allFolders ?? false,
              },
            }),
          },
        },
      ],
    }),
  );
  return { engine: new AssistantModelServing(configuration, request), request };
}

it("proposes the saved email as organization owner for the reported request, preserving all existing roles", async () => {
  const f = fixture();
  const { engine, request } = model(["organization_owners"]);
  const response = await engine.converse(
    f.selection,
    f.values,
    [],
    "Bitte die hinterlegte Email auch gleich nutzen um mich als Organisationsverantwortlichen zu hinterlegen.",
  );
  expect(response.changes).toEqual([
    {
      path: "organization_owners",
      value: ["existing-owner@example.test", "saved-user@example.test"],
    },
  ]);
  expect(response.questions).toEqual([]);
  expect(response.explanation).toContain("gespeicherten Grundlagen");
  expect(response.explanation).toContain("auch die Ordner");
  expect(response.explanation).toContain("separate Apply-Freigabe");
  expect(response.explanation).not.toContain(
    "keinen neuen Grundlagenvorschlag",
  );
  expect(request).toHaveBeenCalledTimes(1);
  const candidate = applyAssistantChanges(f.draft, response.changes);
  const previous = compileCommonConfiguration(f.draft);
  expect(compileCommonConfiguration(candidate)).toEqual({
    ...previous,
    organization_owners: response.changes[0]?.value,
  });
  expect(candidate.identities).toEqual(f.draft.identities);
  expect(exportCommonTfvars(candidate)).toContain("saved-user@example.test");
});

it("supports additive owner proposals for every explicitly requested existing folder without promoting to organization owner", async () => {
  const f = fixture();
  const response = await model(["rm_folders[*].owner_emails"], {
    allFolders: true,
  }).engine.converse(
    f.selection,
    f.values,
    [],
    "Nutze die hinterlegte Email als Owner für alle vorhandenen Ordner.",
  );
  expect(response.changes.map(({ path }) => path)).toEqual(["rm_folders"]);
  const patch = objectValue(
    response.changes[0]?.value as Parameters<typeof objectValue>[0],
  );
  expect(Object.keys(patch)).toEqual(
    Object.keys(
      objectValue(f.values.rm_folders as Parameters<typeof objectValue>[0]),
    ),
  );
  expect(objectValue(patch.platform).owner_emails).toEqual([
    "folder-owner@example.test",
    "saved-user@example.test",
  ]);
  const candidate = applyAssistantChanges(f.draft, response.changes);
  expect(compileCommonConfiguration(candidate).organization_owners).toEqual(
    compileCommonConfiguration(f.draft).organization_owners,
  );
  expect(
    objectValue(
      objectValue(compileCommonConfiguration(candidate).rm_folders).platform,
    ).reader_emails,
  ).toEqual(["folder-reader@example.test"]);
});

it("exposes individual folder-role fields and accepts only selected fields without renaming or touching other folders", async () => {
  const f = fixture();
  const response = await model(
    ["rm_folders[*].owner_emails", "rm_folders[*].reader_emails"],
    { folderKeys: ["platform"] },
  ).engine.converse(
    f.selection,
    f.values,
    [],
    "Nutze die hinterlegte Email als Owner und Reader nur für den Platform-Ordner.",
  );
  const fields = assistantProposalFields(
    response.changes.map((change) => ({
      ...change,
      before: f.values[change.path],
    })),
  );
  expect(fields.map(({ id }) => id)).toEqual([
    "rm_folders/platform/owner_emails",
    "rm_folders/platform/reader_emails",
  ]);
  const selected = selectAssistantProposalFields(
    response.changes.map((change) => ({
      ...change,
      before: f.values[change.path],
    })),
    ["rm_folders/platform/reader_emails"],
  );
  const previous = compileCommonConfiguration(f.draft);
  const checked = validateDialogue(
    { ...response, changes: selected },
    buildAssistantKnowledge().rules.map((rule) => rule.id),
  );
  const candidate = compileCommonConfiguration(
    applyAssistantChanges(f.draft, checked.changes),
  );
  expect(objectValue(objectValue(candidate.rm_folders).platform)).toEqual({
    ...objectValue(objectValue(previous.rm_folders).platform),
    reader_emails: ["folder-reader@example.test", "saved-user@example.test"],
  });
  expect(objectValue(candidate.rm_folders).sandbox).toEqual(
    objectValue(previous.rm_folders).sandbox,
  );
});

it("asks for the target folder instead of guessing all folders", async () => {
  const f = fixture();
  const response = await model(["rm_folders[*].reader_emails"]).engine.converse(
    f.selection,
    f.values,
    [],
    "Nutze die hinterlegte Email als Folder-Leser.",
  );
  expect(response.changes).toEqual([]);
  expect(response.questions).toMatchObject([
    { path: "rm_folders[*].reader_emails", multiple: true },
  ]);
});

it("uses explicit addresses only from actual user evidence, never saved technical credentials or a developer login", async () => {
  const f = fixture();
  const response = await model(["organization_auditors"], {
    emailSource: "explicit",
  }).engine.converse(
    f.selection,
    f.values,
    [],
    "Trage reader@example.test als Organisations-Auditor ein.",
  );
  expect(response.changes).toEqual([
    {
      path: "organization_auditors",
      value: ["existing-auditor@example.test", "reader@example.test"],
    },
  ]);
  f.values["assistant.user_email"] = undefined;
  const missing = await model(["organization_owners"], {
    emailSource: "verified-user",
  }).engine.converse(
    f.selection,
    f.values,
    [],
    "Nutze die E-Mail meines angemeldeten Benutzers als Organisations-Owner.",
  );
  expect(missing.changes).toEqual([]);
  expect(missing.questions).toMatchObject([{ path: "owner_email" }]);
});

it.each(["template-default", "missing", "service-account"])(
  "does not invent human access subjects from %s saved email",
  async (kind) => {
    const f = fixture();
    if (kind === "template-default")
      f.values["assistant.owner_email_is_template_default"] = true;
    if (kind === "missing") f.values.owner_email = null;
    if (kind === "service-account")
      f.values.owner_email = "automation@sa.stackit.cloud";
    const response = await model(["organization_owners"]).engine.converse(
      f.selection,
      f.values,
      [],
      "Nutze die hinterlegte Email als Organisations-Owner.",
    );
    expect(response.changes).toEqual([]);
    expect(response.questions).toMatchObject([{ path: "owner_email" }]);
  },
);

it("does not repeat saved assignments or add redundant folder roles for an organization owner", async () => {
  const f = fixture();
  f.values.organization_owners = [
    "existing-owner@example.test",
    "saved-user@example.test",
  ];
  const response = await model(
    ["organization_owners", "rm_folders[*].owner_emails"],
    { allFolders: true },
  ).engine.converse(
    f.selection,
    f.values,
    [],
    "Nutze die hinterlegte Email als Organisations-Owner und für alle Ordner.",
  );
  expect(response.changes).toEqual([]);
  expect(response.explanation).toContain("bereits");
  expect(response.explanation).toContain("keine Cloud-Berechtigung geändert");
});

it("rejects absent/assistant-only evidence, wrong topic and unknown folders", async () => {
  const f = fixture();
  for (const options of [
    { source: "assistant-only" },
    { topic: "identity-foundations" },
  ])
    await expect(
      model(["organization_owners"], options).engine.converse(
        f.selection,
        f.values,
        [],
        "Nutze die hinterlegte Email als Organisations-Owner.",
      ),
    ).rejects.toThrow("assistant_inference_failed");
  await expect(
    model(["rm_folders[*].owner_emails"], {
      folderKeys: ["invented"],
    }).engine.converse(
      f.selection,
      f.values,
      [],
      "Nutze die Email für einen neuen Ordner.",
    ),
  ).rejects.toThrow("assistant_inference_failed");
});

it("rejects removal of existing subjects and new folders during acceptance", () => {
  const f = fixture();
  for (const changes of [
    [{ path: "organization_owners", value: ["saved-user@example.test"] }],
    [
      {
        path: "rm_folders",
        value: { platform: { owner_emails: ["saved-user@example.test"] } },
      },
    ],
    [
      {
        path: "rm_folders",
        value: { invented: { owner_emails: ["saved-user@example.test"] } },
      },
    ],
  ])
    expect(() => applyAssistantChanges(f.draft, changes)).toThrow();
});
