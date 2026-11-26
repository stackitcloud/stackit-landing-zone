import {
  type AssistantCataloguePicker,
  type AssistantLanguage,
  assistantCataloguePickerSchema,
  type CloudCatalogueField,
  catalogueChoiceMatches,
  catalogueField,
} from "@lzc/contracts";
import {
  applicationProjectPermissionNames,
  type JsonValue,
  objectValue,
} from "@lzc/domain";
import { type Dialogue, dialogueSchema } from "./dialogue.js";
import { assistantSourceNetworkQuestion } from "./editor.js";
import type { AssistantCatalogueContext } from "./model-serving.js";

export const assistantGuidancePolicy = `SERVICE CONSULTATION, for every topic: Ask about the user's goal, initial scale, availability and access only when relevant and still unknown. Retain answered decisions across turns. Do not send users away to research technical flavor names. Every generated question MUST include answerType: catalogue for actual offered product selections; requirements for business goals/load/traffic/recovery, even when their path is a flavor field. Only catalogue questions for fields listed in questionCatalogues receive a product picker. For a catalogue-backed decision ask at the exact editable field path, so the application can present its project/region catalogue with descriptions. Offer a small, relevant set of business choices and explain tradeoffs using reviewed facts. A request to recommend a sensible starting point delegates a reviewed recommendation, not permission to invent service facts, networks, credentials, entitlement, prices or in-place upgrades. Documented hard limits override starting recommendations. When no offered option meets confirmed requirements, explain that boundary and discuss supported architecture choices before selecting a flavor; never invent a larger plan, aggregate capacity, transparent federation or an in-place upgrade. If a recommendation lacks evidence, ask a focused business question with useful choices rather than repeating a blank technical field. A missing catalogue is not an empty offering or proof that a product is unavailable. Existing rights, save, Plan and Apply boundaries remain mandatory. Never ask again for an already answered decision unless requirements changed or a conflict needs resolving. A draft request with sufficient confirmed inputs must emit actual typed changes, never only promise that settings will be configured. When the desired values already match, emit the desired patch so the application can verify the no-op. Otherwise ask a focused question about genuinely missing information.`;

export function configuredCatalogueRegions(
  current: Record<string, unknown>,
): ("eu01" | "eu02")[] {
  const regions = new Set<"eu01" | "eu02">([
    current.region === "eu02" ? "eu02" : "eu01",
  ]);
  for (const root of ["connectivity_regions", "platform_kubernetes"]) {
    for (const [key, value] of Object.entries(
      objectValue(current[root] as JsonValue),
    )) {
      const region = objectValue(value).region ?? key;
      if (region === "eu01" || region === "eu02") regions.add(region);
    }
  }
  for (const template of Object.values(
    objectValue(current.projectTemplates as JsonValue),
  )) {
    const region = objectValue(objectValue(template).settings).region;
    if (region === "eu01" || region === "eu02") regions.add(region);
  }
  return [...regions];
}

export function catalogueQuestionRegion(
  path: string,
  current: Record<string, unknown>,
) {
  const templatePath = /^projectTemplates\.([^.]+)\.settings(?:\.|$)/.exec(
    path,
  );
  if (templatePath) {
    const template = objectValue(
      objectValue(current.projectTemplates as JsonValue)[templatePath[1]!],
    );
    if (!Object.keys(template).length) return null;
    const region = objectValue(template.settings).region ?? current.region;
    return region === "eu01" || region === "eu02" ? region : null;
  }
  const regional = path.startsWith("connectivity_regions")
    ? objectValue(current.connectivity_regions as JsonValue)
    : path.startsWith("platform_kubernetes")
      ? objectValue(current.platform_kubernetes as JsonValue)
      : null;
  if (regional) {
    const entries = Object.entries(regional);
    if (
      entries.some(
        ([key, value]) =>
          !["eu01", "eu02"].includes(String(objectValue(value).region ?? key)),
      )
    )
      return null;
    const regions = [
      ...new Set(
        entries.flatMap(([key, value]) => {
          const region = objectValue(value).region ?? key;
          return region === "eu01" || region === "eu02" ? [region] : [];
        }),
      ),
    ];
    if (regions.length > 1) return null; // Wildcard questions do not identify a target region.
    if (regions.length === 1) return regions[0];
  }
  return current.region === "eu02" ? "eu02" : "eu01";
}

// Identifier formats belong to the shared catalogue adapter, not conversational
// routing. Described business choices remain free text; concrete native IDs need
// an observed catalogue, current/default value or actually supplied source.
const uuidChoice = /\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/gi;
const machineChoice = /\b[a-z][a-z0-9]*\d[a-z0-9]*\.[a-z0-9]+\b/gi;
const zoneChoice = /\b(?:eu01|eu02)-[a-z0-9-]+\b/gi;
const questionIdentifierPatterns: Record<CloudCatalogueField, RegExp> = {
  gitFlavors: /\bgit-?\d+\b/gi,
  vpnPlans: /\b(?:vpn[-_][a-z0-9_-]+|p\d+)\b/gi,
  kubernetesVersions:
    /(?<![.\d])\bv?\d+\.\d+(?:\.\d+)?(?:-[a-z0-9.-]+)?\b(?![%\d.])/gi,
  machineTypes: machineChoice,
  bastionMachineTypes: machineChoice,
  machineImages: uuidChoice,
  bastionImages: uuidChoice,
  availabilityZones: zoneChoice,
  bastionAvailabilityZones: zoneChoice,
  volumeTypes: /\bstorage_[a-z0-9_]+\b/gi,
  observabilityPlans: /\bObservability-[a-z0-9-]+\b/gi,
  projectRoles: uuidChoice,
  projectPermissions: /\b[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*){2,}\b/gi,
};
export function ungroundedCatalogueQuestionChoices(
  dialogue: Dialogue,
  current: Record<string, unknown>,
  catalogues: AssistantCatalogueContext | undefined,
  evidence: {
    sourceTexts: string[];
    readCurrent: (path: string) => unknown;
    readDefault: (path: string) => unknown;
  },
) {
  return dialogue.questions.flatMap((question) => {
    const field = catalogueField(question.path);
    if (!field) return [];
    const identifiers = (text: string) =>
      [...text.matchAll(new RegExp(questionIdentifierPatterns[field]))]
        .map((match) => match[0].toLowerCase())
        .filter((value) => !/^(?:tls|https?)\d/i.test(value));
    const region = catalogueQuestionRegion(question.path, current);
    const part = catalogues?.regions.find(
      (snapshot) => snapshot.region === region,
    )?.products[field];
    const available = part?.status === "available" ? part.options : [];
    const known = new Set([
      ...(field === "projectPermissions"
        ? applicationProjectPermissionNames
        : []),
      ...available.flatMap((option) => [
        option.value.toLowerCase(),
        option.label.toLowerCase(),
        ...identifiers(option.value),
      ]),
      ...evidence.sourceTexts.flatMap(identifiers),
      ...identifiers(JSON.stringify(evidence.readCurrent(question.path)) ?? ""),
      ...identifiers(JSON.stringify(evidence.readDefault(question.path)) ?? ""),
    ]);
    const values = [
      ...new Set(
        (question.options ?? []).flatMap((option) => {
          const found = identifiers(option);
          // A bare native ID cannot gain provenance by extending a known ID.
          if (found.length && !/\s/.test(option.trim()))
            found.push(option.trim().toLowerCase());
          return found.filter((value) => !known.has(value));
        }),
      ),
    ];
    if (
      question.answerType !== "requirements" &&
      (!part || part.status !== "available" || !part.options.length)
    )
      return [
        { path: question.path, values, reason: "no_verified_picker_options" },
      ];
    return values.length
      ? [{ path: question.path, values, reason: "unverified_identifier" }]
      : [];
  });
}

function planDescription(value: string, language: AssistantLanguage) {
  if (value === "git-100")
    return language === "en"
      ? "Documented for up to 100 users; a starting point for shared repositories and CI/CD."
      : "Dokumentiert für bis zu 100 Nutzer; ein Einstieg für gemeinsame Repositories und CI/CD.";
  if (value === "git-10")
    return language === "en"
      ? "Documented for up to 10 users; suitable as a small-team or pilot starting point."
      : "Dokumentiert für bis zu 10 Nutzer; ein Einstieg für kleine Teams oder einen Pilot.";
  return "";
}

export type PresentedDialogue = Omit<Dialogue, "questions"> & {
  questions: (Dialogue["questions"][number] & {
    catalogue?: AssistantCataloguePicker;
  })[];
};

export function enrichCatalogueQuestions(
  dialogue: Dialogue,
  current: Record<string, unknown>,
  catalogues: AssistantCatalogueContext,
  language: AssistantLanguage,
): PresentedDialogue {
  let presentationBytes = 200_000;
  return {
    ...dialogue,
    questions: dialogue.questions.map((question) => {
      if (question.answerType !== "catalogue") return question;
      const field = catalogueField(question.path);
      const region = catalogueQuestionRegion(question.path, current);
      const snapshot = catalogues.regions.find(
        (item) => item.region === region,
      );
      const part = field && snapshot?.products[field];
      if (!field || !snapshot) return question;
      const candidates = (part?.status === "available" ? part.options : []).map(
        (option) => {
          const family =
            field === "vpnPlans"
              ? /^vpn$/i
              : field === "machineTypes" || field === "bastionMachineTypes"
                ? /compute|virtual machine|iaas|kubernetes|^ske$/i
                : null;
          const skus =
            snapshot.pim?.status === "available" && family
              ? snapshot.pim.skus.filter(
                  (sku) =>
                    /^(?:no|false)?$/i.test(sku.deprecated ?? "") &&
                    sku.region === snapshot.region &&
                    family.test(sku.productName ?? "") &&
                    (sku.productSpecificAttributes?.flavor === option.value ||
                      sku.productSpecificAttributes?.planId === option.value),
                )
              : [];
          const facts: AssistantCataloguePicker["options"][number]["facts"] =
            [];
          for (const [attribute, key] of [
            ["vCPU", "vCPU"],
            ["maxBandWidth", "bandwidthMbps"],
            ["maxConnections", "maxConnections"],
          ] as const) {
            const values = skus.map(
              (sku) => sku.productSpecificAttributes?.[attribute],
            );
            if (
              values.length &&
              values.every(
                (value) =>
                  typeof value === "number" &&
                  Number.isFinite(value) &&
                  value >= 0 &&
                  value === values[0],
              )
            )
              facts.push({ key, value: values[0] as number });
          }
          const retention = option.capabilities
            ? Object.entries(option.capabilities)
                .filter(([, enabled]) => enabled)
                .map(
                  ([key]) =>
                    ({
                      metricsRetention: "Metrics",
                      logsRetention: "Logs",
                      tracesRetention: "Traces",
                    })[key],
                )
                .filter(Boolean)
                .join(", ")
            : "";
          return {
            value: option.value,
            label: option.label,
            description:
              field === "gitFlavors"
                ? planDescription(option.value, language)
                : retention
                  ? language === "en"
                    ? `Configurable retention: ${retention}.`
                    : `Konfigurierbare Aufbewahrung: ${retention}.`
                  : "",
            facts,
          };
        },
      );
      const options: AssistantCataloguePicker["options"] = [];
      let remaining = Math.min(presentationBytes, 32_000);
      for (const candidate of candidates) {
        const size = Buffer.byteLength(JSON.stringify(candidate), "utf8");
        if (options.length >= 200 || size > remaining) break;
        options.push(candidate);
        remaining -= size;
        presentationBytes -= size;
      }
      const catalogue = assistantCataloguePickerSchema.parse({
        source: "project-catalogue",
        status: part?.status ?? "unavailable",
        suggestedValues: options
          .filter((option) =>
            (question.options ?? []).some((choice) => {
              return catalogueChoiceMatches(choice, option);
            }),
          )
          .slice(0, 6)
          .map((option) => option.value),
        region: snapshot.region,
        fetchedAt: snapshot.fetchedAt,
        totalOptions: part?.totalOptions ?? 0,
        truncated:
          (part?.truncated ?? false) || options.length < candidates.length,
        options,
      });
      return { ...question, catalogue };
    }),
  };
}

// Presentation is not part of the model/configuration contract and cannot grant consent.
export function withoutCataloguePresentation(dialogue: Dialogue): Dialogue {
  return {
    ...dialogue,
    questions: dialogue.questions.map((question) => ({
      path: question.path,
      text: question.text,
      ...(question.answerType !== undefined
        ? { answerType: question.answerType }
        : {}),
      ...(question.options ? { options: question.options } : {}),
      ...(question.multiple !== undefined
        ? { multiple: question.multiple }
        : {}),
    })),
  };
}

// The model chooses which decision is pending; product claims and offered values
// are rendered from the scoped catalogue rather than its unverified prose.
export function groundCatalogueDialogue(
  dialogue: Dialogue,
  current: Record<string, unknown>,
  catalogues: AssistantCatalogueContext,
  language: AssistantLanguage,
): Dialogue {
  if (dialogue.changes.length) return dialogue;
  dialogue = {
    ...dialogue,
    questions: dialogue.questions.map((question) => {
      const sourceNetworks = assistantSourceNetworkQuestion(
        question.path,
        language,
      );
      return !sourceNetworks || question.options?.length
        ? question
        : { ...question, ...sourceNetworks };
    }),
  };
  const presented = enrichCatalogueQuestions(
    dialogue,
    current,
    catalogues,
    language,
  );
  if (
    !presented.questions.some(
      (question) =>
        question.catalogue?.status === "available" &&
        question.catalogue.options.length,
    )
  )
    return dialogue;
  const labels: Record<string, [string, string]> = {
    gitFlavors: [
      "Which Git plan should we use as a starting point?",
      "Mit welchem Git-Tarif möchtest du starten?",
    ],
    vpnPlans: [
      "Which VPN plan should we use as a starting point?",
      "Mit welchem VPN-Tarif möchtest du starten?",
    ],
    machineTypes: [
      "Which machine size should the Kubernetes nodes use?",
      "Welche Maschinengröße sollen die Kubernetes-Knoten nutzen?",
    ],
    bastionMachineTypes: [
      "Which VM size should we use as a starting point?",
      "Mit welcher VM-Größe möchtest du starten?",
    ],
    kubernetesVersions: [
      "Which Kubernetes version should we use?",
      "Welche Kubernetes-Version möchtest du nutzen?",
    ],
    machineImages: [
      "Which operating system should the nodes use?",
      "Welches Betriebssystem sollen die Knoten nutzen?",
    ],
    bastionImages: [
      "Which image should the VM use?",
      "Welches Image soll die VM nutzen?",
    ],
    availabilityZones: [
      "Which availability zones should we use?",
      "Welche Verfügbarkeitszonen möchtest du nutzen?",
    ],
    bastionAvailabilityZones: [
      "Which availability zone should the VM use?",
      "Welche Verfügbarkeitszone soll die VM nutzen?",
    ],
    volumeTypes: [
      "Which storage type should we use?",
      "Welchen Speichertyp möchtest du nutzen?",
    ],
    observabilityPlans: [
      "Which Observability plan should we use as a starting point?",
      "Mit welchem Observability-Tarif möchtest du starten?",
    ],
    projectRoles: [
      "Which project role should the proposal use?",
      "Welche Projektrolle soll der Vorschlag nutzen?",
    ],
    projectPermissions: [
      "Which project permissions should the proposal include?",
      "Welche Projektberechtigungen soll der Vorschlag enthalten?",
    ],
  };
  return {
    ...dialogue,
    explanation:
      language === "en"
        ? "Choose a starting option below, or ask for help and describe your expected usage. The options come from your project catalogue. Additional technical details are shown where provided by the product data. Nothing has been saved."
        : "Wähle unten eine Startoption oder lass dir anhand deiner erwarteten Nutzung bei der Auswahl helfen. Die Optionen stammen aus deinem Projektkatalog. Zusätzliche technische Merkmale werden angezeigt, soweit die Produktdaten sie liefern. Noch nichts gespeichert.",
    questions: presented.questions.map((question) => {
      const picker = question.catalogue;
      const field = catalogueField(question.path);
      if (
        !picker ||
        picker.status !== "available" ||
        !picker.options.length ||
        !field
      )
        return withoutCataloguePresentation({
          ...dialogue,
          questions: [question],
        }).questions[0]!;
      const subset = picker.suggestedValues.length
        ? picker.options.filter((option) =>
            picker.suggestedValues.includes(option.value),
          )
        : picker.options;
      const options = subset
        .slice(0, 4)
        .filter((option) => option.value.length <= 100)
        .map((option) => `${option.label.slice(0, 40)} (${option.value})`);
      options.push(
        language === "en"
          ? "Help me choose based on my expected usage"
          : "Hilf mir anhand meiner erwarteten Nutzung bei der Auswahl",
      );
      return {
        path: question.path,
        answerType: "catalogue" as const,
        text: labels[field]?.[language === "en" ? 0 : 1] ?? question.text,
        options,
        ...(question.multiple !== undefined
          ? { multiple: question.multiple }
          : {}),
      };
    }),
  };
}

export function englishNativeOverview(topic: {
  inputs: readonly string[];
  text: string;
}) {
  const fields = `Configuration fields: ${topic.inputs.join(", ")}.`;
  const reviewed = topic.text
    .replace(/^## Sources[\s\S]*/m, "")
    .replace(/^#{1,3}\s+/gm, "")
    .trim();
  return `${fields}\n\n${reviewed.slice(0, 2600 - fields.length)}\n\nThis is guidance only. Nothing has been saved or deployed. See the editor for the complete field contract.`;
}

export function ensureDraftNotice(
  dialogue: Dialogue,
  language: AssistantLanguage,
): Dialogue {
  if (
    (!dialogue.questions.length && !dialogue.changes.length) ||
    /noch (?:nichts|nicht) gespeichert|no(?:thing| changes?) (?:has|have) been saved|nothing saved|not yet saved/i.test(
      dialogue.explanation,
    )
  )
    return dialogue;
  const notice =
    language === "en" ? "Nothing has been saved." : "Noch nichts gespeichert.";
  return dialogueSchema.parse({
    ...dialogue,
    explanation: `${dialogue.explanation.trim()}\n\n${notice}`,
  });
}

export function resolveAssistantLanguage(
  preference: AssistantLanguage | undefined,
  history: { role: "user" | "assistant"; content: string }[],
  message: string,
): AssistantLanguage {
  if (preference) return preference;
  const sources = [
    message,
    ...history
      .filter((entry) => entry.role === "user")
      .map((entry) => entry.content)
      .reverse(),
  ];
  for (const source of sources) {
    const answer =
      source.split(/(?:My answer|Meine Antwort)\s*:\s*/i).at(-1) ?? source;
    if (
      /(?:answer|reply|respond|antworte|antworten).{0,30}(?:english|englisch)/i.test(
        answer,
      )
    )
      return "en";
    if (
      /(?:answer|reply|respond|antworte|antworten).{0,30}(?:german|deutsch)/i.test(
        answer,
      )
    )
      return "de";
    const german =
      answer.match(
        /\b(?:bitte|welche\w*|wie|ich|wir|möchte\w*|nutze\w*|nimm|hinzufügen|ändern|konfigurieren|sollen|besteller|ordner|gespeichert|entwurf|keine\w*|unsere\w*)\b/gi,
      )?.length ?? 0;
    const english =
      answer.match(
        /\b(?:please|which|what|how|i|we|use|add|change|configure|should|could|would|here|company|our|choose|keep|retain|let|need)\b/gi,
      )?.length ?? 0;
    if (german || english) return german >= english ? "de" : "en";
  }
  return "de";
}

export function emptyDraftResponse(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  if (
    data.folderNames &&
    typeof data.folderNames === "object" &&
    !Array.isArray(data.folderNames) &&
    Object.values(data.folderNames).some(
      (folder) =>
        folder &&
        typeof folder === "object" &&
        ["name", "prefix"].some(
          (key) => typeof (folder as Record<string, unknown>)[key] === "string",
        ),
    )
  )
    return false;
  return (
    Array.isArray(data.questions) &&
    data.questions.length === 0 &&
    Array.isArray(data.changes) &&
    data.changes.length === 0
  );
}
