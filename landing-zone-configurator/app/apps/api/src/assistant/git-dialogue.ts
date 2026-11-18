import type { AssistantLanguage } from "@lzc/contracts";
import { type JsonValue, objectValue } from "@lzc/domain";
import { z } from "zod";
import type { AssistantCatalogueContext } from "./model-serving.js";

const cidr = z.union([z.cidrv4(), z.cidrv6()]);
const reviewedPlans = ["git-100", "git-10"];
export function gitDialogueInputs(
  current: Record<string, unknown>,
  history: { role: "user" | "assistant"; content: string }[],
  message: string,
  catalogues: AssistantCatalogueContext,
) {
  const sources = [
    ...history.flatMap((entry, index) =>
      entry.role === "user"
        ? [{ id: `history-${index}`, text: entry.content }]
        : [],
    ),
    { id: "current", text: message },
  ];
  const catalogue = catalogues.regions.find(
    (entry) => entry.region === current.region,
  )?.products.gitFlavors;
  const live = catalogue?.status === "available";
  const plans = live
    ? catalogue.options.map((option) => option.value)
    : reviewedPlans;
  const saved = Object.fromEntries(
    ["observability", "audit_logs"].flatMap((root) => {
      const value = objectValue(current[root] as JsonValue).acl;
      return Array.isArray(value) &&
        value.length &&
        value.every(
          (item) =>
            cidr.safeParse(item).success &&
            item !== "0.0.0.0/0" &&
            item !== "::/0",
        )
        ? [[root, value as string[]]]
        : [];
    }),
  );
  const ids = sources.map((source) => source.id) as [string, ...string[]];
  return {
    sources,
    plans,
    live,
    saved,
    schema: z.strictObject({
      setupSource: z.enum(ids),
      planChoice: z
        .enum(["recommend", "estimate", "larger", ...plans])
        .nullable(),
      planSource: z.enum(ids).nullable(),
      networkChoice: z
        .enum(["company-networks", "public", "explicit", ...Object.keys(saved)])
        .nullable(),
      networkSource: z.enum(ids).nullable(),
      networkEvidence: z.string().max(1500).nullable(),
    }),
  };
}
export type GitDialogueInputs = ReturnType<typeof gitDialogueInputs>;

function answerOnly(text: string) {
  return text.split(/(?:My answer|Meine Antwort)\s*:\s*/i).at(-1) ?? text;
}
function sourceNetworks(text: string) {
  const answer = answerOnly(text);
  return [
    ...new Set(
      answer.split(/[\s,;()[\]]+/).flatMap((word) => {
        const value = word.replace(/[.!?]+$/, "");
        if (cidr.safeParse(value).success) return [value];
        if (z.ipv4().safeParse(value).success) return [`${value}/32`];
        if (z.ipv6().safeParse(value).success) return [`${value}/128`];
        return [];
      }),
    ),
  ];
}

export function gitSetupDialogue(
  inputs: GitDialogueInputs,
  decision: z.infer<GitDialogueInputs["schema"]>,
  language: AssistantLanguage,
) {
  const en = language === "en";
  const start = inputs.sources.findIndex(
    (source) => source.id === decision.setupSource,
  );
  const source = (id: string | null) => {
    const index = inputs.sources.findIndex((entry) => entry.id === id);
    return index >= start ? inputs.sources[index]?.text : undefined;
  };
  if (decision.planChoice === "larger" && source(decision.planSource))
    return {
      explanation: en
        ? "Git100 supports at most 100 users per instance; Git10 supports at most 10. Automatic storage growth does not increase the user limit. Your requirement exceeds one documented instance. Consider separate team/project instances, each within its own user limit, or reduce the initial scope. This does not provide one shared instance, automatic federation or a capacity guarantee. The central devops setting configures one Git instance; additional instances require separate reviewed configuration. Nothing has been saved or deployed."
        : "Git100 unterstützt höchstens 100 Nutzer pro Instanz, Git10 höchstens 10. Automatisches Speicherwachstum erhöht die Nutzergrenze nicht. Dein Bedarf übersteigt eine dokumentierte Einzelinstanz. Möglich sind getrennte Team-/Projektinstanzen innerhalb ihrer jeweiligen Nutzergrenze oder ein kleinerer anfänglicher Umfang. Das ergibt keine gemeinsame Instanz, automatische Föderation oder Kapazitätsgarantie. Die zentrale devops-Einstellung konfiguriert eine Git-Instanz; weitere Instanzen benötigen eine separat geprüfte Konfiguration. Nichts gespeichert oder deployt.",
      questions: [
        {
          path: "devops.git_flavor",
          answerType: "requirements" as const,
          text: en
            ? "How should we scope Git for your users?"
            : "Wie sollen wir Git für eure Nutzer aufteilen?",
          options: en
            ? [
                "Discuss separate team/project instances",
                "Limit the initial shared instance to at most 100 users",
              ]
            : [
                "Getrennte Team-/Projektinstanzen besprechen",
                "Anfängliche gemeinsame Instanz auf höchstens 100 Nutzer begrenzen",
              ],
        },
      ],
      changes: [],
      references: ["devops-git"],
    };
  const recommended = inputs.plans.includes("git-100")
    ? "git-100"
    : inputs.plans.includes("git-10")
      ? "git-10"
      : undefined;
  const selected =
    source(decision.planSource) &&
    decision.planChoice !== "estimate" &&
    decision.planChoice !== "larger"
      ? decision.planChoice === "recommend"
        ? recommended
        : decision.planChoice
      : null;
  const plan = selected && inputs.plans.includes(selected) ? selected : null;
  // A literal choice to reuse one existing allowlist is already a complete
  // selection; it must not depend on a second model interpretation.
  const latest = answerOnly(inputs.sources.at(-1)?.text ?? "");
  const savedSelections = Object.keys(inputs.saved).filter(
    (key) =>
      /\b(?:reuse|use the saved|übernehmen|übernimm|gespeicherte)\b/i.test(
        latest,
      ) &&
      !/\b(?:not|no|never|don['’]?t|nicht|kein\w*|niemals|avoid)\b/i.test(
        latest,
      ) &&
      (key === "observability" ? /\bobservability\b/i : /\baudit\b/i).test(
        latest,
      ),
  );
  const savedSelection =
    savedSelections.length === 1 ? savedSelections[0] : null;
  const networkChoice = savedSelection ?? decision.networkChoice;
  const networkText = source(
    savedSelection ? "current" : decision.networkSource,
  );
  let networks: string[] = [];
  const evidence =
    networkText &&
    decision.networkEvidence &&
    answerOnly(networkText).includes(decision.networkEvidence)
      ? decision.networkEvidence
      : null;
  const publicConsent =
    networkText &&
    !/\b(?:not|no|never|don['’]?t|nicht|kein\w*|niemals|avoid)\b/i.test(
      answerOnly(networkText),
    );
  if (evidence && networkChoice === "explicit")
    networks = sourceNetworks(evidence);
  if (
    evidence &&
    networkChoice === "public" &&
    sourceNetworks(evidence).includes("0.0.0.0/0")
  )
    networks = ["0.0.0.0/0"];
  if (
    networks.some((value) => value === "0.0.0.0/0" || value === "::/0") &&
    !publicConsent
  )
    networks = [];
  if (
    networkText &&
    networkChoice &&
    Object.hasOwn(inputs.saved, networkChoice)
  )
    networks = inputs.saved[networkChoice] ?? [];
  const name = (id: string) =>
    id === "git-100" ? "Git100" : id === "git-10" ? "Git10" : id;
  const recommendation =
    recommended === "git-100"
      ? en
        ? "For company-wide Git, I recommend Git100 as the starting point: the documented plan supports up to 100 users and is aimed at shared repositories and CI/CD. Git10 is the smaller option for teams of up to 10 users or a pilot."
        : "Für unternehmensweites Git empfehle ich Git100 als Ausgangspunkt: Der dokumentierte Tarif ist für bis zu 100 Nutzer sowie gemeinsame Repositories und CI/CD vorgesehen. Git10 ist die kleinere Option für bis zu 10 Nutzer oder einen Pilot."
      : en
        ? "Choose from the Git plans returned by your project catalogue. The documented company-wide starting recommendation is Git100, but it is not in the returned plan list."
        : "Wähle aus den Git-Tarifen des Projektkatalogs. Die dokumentierte Startempfehlung für unternehmensweites Git ist Git100; sie ist jedoch nicht in der gelieferten Tarifliste enthalten.";
  const provenance = inputs.live
    ? en
      ? "The plan list comes from your project catalogue; this is not an entitlement or price guarantee."
      : "Die Tarifliste stammt aus deinem Projektkatalog; sie ist keine Berechtigungs- oder Preiszusage."
    : en
      ? "These are documented plan options; current availability and pricing still need checking for your project."
      : "Dies sind dokumentierte Tarifoptionen; aktuelle Verfügbarkeit und Preis müssen für dein Projekt noch geprüft werden.";
  const lifecycle = en
    ? "Plan for your expected initial usage: changing the Git plan or allowlist through this Accelerator currently replaces the instance. A later change needs separate review and migration planning."
    : "Plane für die erwartete anfängliche Nutzung: Eine Git-Tarif- oder Allowlist-Änderung über diesen Accelerator ersetzt derzeit die Instanz. Eine spätere Änderung braucht eine separate Prüfung und Migrationsplanung.";
  const questions: {
    path: string;
    text: string;
    options: string[];
    answerType?: "catalogue" | "requirements";
  }[] = [];
  if (!plan)
    questions.push({
      path: "devops.git_flavor",
      answerType:
        decision.planChoice === "estimate" ? "requirements" : "catalogue",
      text:
        decision.planChoice === "estimate"
          ? en
            ? "How many people will use the shared Git instance initially?"
            : "Wie viele Personen werden die gemeinsame Git-Instanz zunächst nutzen?"
          : en
            ? "Which starting size would you like to use?"
            : "Mit welcher Größe möchtest du starten?",
      options:
        decision.planChoice === "estimate"
          ? en
            ? [
                "Up to 10 users",
                "11–100 users",
                "More than 100 users",
                "Recommend a company-wide starting point",
              ]
            : [
                "Bis zu 10 Nutzer",
                "11–100 Nutzer",
                "Mehr als 100 Nutzer",
                "Startgröße für unternehmensweites Git empfehlen",
              ]
          : [
              ...inputs.plans.map((id) =>
                id === "git-100"
                  ? en
                    ? "Git100 — company-wide starting point (recommended)"
                    : "Git100 — unternehmensweiter Einstieg (empfohlen)"
                  : id === "git-10"
                    ? en
                      ? "Git10 — small team or pilot"
                      : "Git10 — kleines Team oder Pilot"
                    : name(id),
              ),
              en
                ? "Help me estimate the size"
                : "Hilf mir beim Einschätzen der Größe",
            ].slice(0, 6),
    });
  if (!networks.length)
    questions.push({
      path: "devops.allowed_network_ranges",
      text:
        networkChoice === "company-networks" || networkChoice === "explicit"
          ? en
            ? "What are your company/VPN public egress IP addresses or CIDRs? These are the addresses clients connect from, not the private SNA subnets. I cannot infer them from a company name."
            : "Welche öffentlichen Ausgangs-IP-Adressen oder CIDRs nutzt euer Firmennetz/VPN? Gemeint sind die Quelladressen der Clients, nicht private SNA-Subnetze. Aus dem Firmennamen lassen sie sich nicht ableiten."
          : en
            ? "Who should be able to reach the Git instance?"
            : "Wer soll die Git-Instanz erreichen können?",
      options:
        networkChoice === "company-networks" || networkChoice === "explicit"
          ? []
          : [
              ...Object.entries(inputs.saved).map(
                ([root, ranges]) =>
                  `${en ? "Use the saved" : "Gespeicherte"} ${root === "audit_logs" ? "Audit" : "Observability"}${en ? " allowlist" : "-Allowlist übernehmen"} (${ranges.length} ${en ? (ranges.length === 1 ? "network" : "networks") : ranges.length === 1 ? "Netz" : "Netze"})`,
              ),
              en
                ? "Company/VPN public egress networks only (recommended)"
                : "Nur öffentliche Ausgangsnetze des Unternehmens/VPN (empfohlen)",
              en
                ? "I will provide specific source IPs or CIDRs"
                : "Ich gebe konkrete Quell-IPs oder CIDRs an",
              en
                ? "Public reachability (0.0.0.0/0); Git authentication still required"
                : "Öffentlich erreichbar (0.0.0.0/0); Git-Anmeldung bleibt erforderlich",
            ].slice(0, 6),
    });
  const selectedText = plan
    ? en
      ? `Starting size selected: ${name(plan)}. I will retain that choice while we finish access settings.`
      : `Gewählte Startgröße: ${name(plan)}. Diese Auswahl bleibt erhalten, während wir den Zugriff klären.`
    : "";
  return {
    explanation: [
      selectedText || recommendation,

      provenance,
      lifecycle,
      en
        ? "Proposal only: nothing saved or deployed."
        : "Nur ein Vorschlag: nichts gespeichert oder deployt.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    questions,
    changes:
      plan && networks.length
        ? [
            {
              path: "devops",
              operation: "merge" as const,
              value: { git_flavor: plan, allowed_network_ranges: networks },
            },
          ]
        : [],
    references: ["devops-git"],
  };
}

export function gitNativeOverview(inputs: GitDialogueInputs) {
  const advice = gitSetupDialogue(
    inputs,
    {
      setupSource: "current",
      planChoice: null,
      planSource: null,
      networkChoice: null,
      networkSource: null,
      networkEvidence: null,
    },
    "en",
  );
  return (
    "Native fields: devops, devops.git_flavor, devops.allowed_network_ranges. devops=null skips the module; git_flavor=null creates no Git instance. The native default is not git-10 or git-100. An ACL-only object does not enable Git. The root derives the project, owner and instance name.\n\n" +
    advice.explanation
  );
}
