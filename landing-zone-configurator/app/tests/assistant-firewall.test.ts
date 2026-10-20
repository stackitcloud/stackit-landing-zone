import { randomUUID } from "node:crypto";
import {
  assistantProposalFields,
  selectAssistantProposalFields,
} from "@lzc/contracts";
import {
  catalogue,
  commonConfigurationFromValues,
  compileCommonConfiguration,
  createCommonConfiguration,
  objectValue,
  setCommonInput,
} from "@lzc/domain";
import { expect, it, vi } from "vitest";
import {
  applyAssistantChanges,
  type Dialogue,
  validateDialogue,
} from "../apps/api/src/assistant/dialogue.js";
import {
  assistantNetworkCapacity,
  assistantPublicFirewall,
  mergeAssistantFirewall,
  validateAssistantFirewall,
} from "../apps/api/src/assistant/firewall.js";
import { buildAssistantKnowledge } from "../apps/api/src/assistant/knowledge.js";
import { AssistantModelServing } from "../apps/api/src/assistant/model-serving.js";
import { assistantPublicValues } from "../apps/api/src/assistant/service.js";

const area = {
  ranges: ["10.0.0.0/16"],
  transfer_network: "10.255.0.0/24",
  min_prefix_length: 24,
  max_prefix_length: 28,
  default_prefix_length: 25,
};
const firewall = {
  name: "corporate-firewall",
  zone: "eu01-1",
  flavor: "g1.4",
  lan_network_range: "10.0.252.0/24",
  wan_network_range: "10.0.253.0/24",
};
const configuration = {
  baseUrl: "https://api.openai-compat.model-serving.eu01.onstackit.cloud/v1",
  model: "Qwen/Qwen3-VL-235B-A22B-Instruct-FP8",
  token: "test-only-private-token",
  timeoutMs: 1000,
};
function fixture(map = false, deployed = true) {
  let draft = createCommonConfiguration("standalone", randomUUID());
  draft = setCommonInput(draft, "region", "eu01");
  const template = catalogue.templates.find(
    (entry) => entry.id === "standalone",
  );
  if (!template) throw new Error("missing_fixture_template");
  draft = commonConfigurationFromValues(template, draft.id, draft.name, {
    ...compileCommonConfiguration(draft),
    connectivity: {
      ...(map
        ? {
            network_areas: { corporate: area },
            ...(deployed ? { firewalls: { corporate: firewall } } : {}),
          }
        : { network_area: area, ...(deployed ? { firewall } : {}) }),
      dns_zones: {},
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
  dialogue: Dialogue,
  scope = "other",
  mode = "draft",
  topic = "firewall-infrastructure",
  availability = "unspecified",
  targets: {
    keys?: string[];
    all?: boolean;
    fields?: string[];
    requirements?: {
      decision: "traffic" | "capacity" | "operations";
      quote: string;
    }[];
    setupQuotes?: Record<"traffic" | "capacity" | "operations", string | null>;
    setupScope?: "setup" | "field-update" | "advice";
    setupRequest?: string;
    haRequest?: string;
    capacityDeferred?: boolean;
    operator?: string;
    policy?: string;
    adviceTask?: "other" | "capability-boundary" | "policy-request";
  } = {},
) {
  const request = vi.fn<typeof fetch>(async (_input, options) => {
    const body = JSON.parse(String(options?.body));
    const schemaName = body.response_format.json_schema.name;
    const evidence =
      schemaName === "firewall_setup_decisions"
        ? JSON.parse(body.messages.at(-1).content)
        : null;
    const source = (quote: string | null) =>
      quote === null
        ? null
        : (evidence.userEvidence.find(
            (entry: { id: string; text: string }) => entry.text === quote,
          )?.id ??
          evidence.userEvidence.find((entry: { id: string; text: string }) =>
            entry.text.includes(quote),
          )?.id ??
          quote);
    const setupScope =
      targets.setupScope ??
      (mode === "advice"
        ? "advice"
        : targets.fields?.length
          ? "field-update"
          : "setup");
    return Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: JSON.stringify(
              schemaName === "firewall_setup_decisions"
                ? {
                    scope: setupScope,
                    setupRequest: source(
                      targets.setupRequest ??
                        (setupScope === "setup"
                          ? JSON.parse(body.messages.at(-1).content)
                              .latestUserMessage
                          : null),
                    ),
                    capacityDeferred: source(
                      targets.capacityDeferred
                        ? (targets.setupQuotes?.capacity ?? null)
                        : null,
                    ),
                    haRequest: source(targets.haRequest ?? null),
                    operator: source(targets.operator ?? null),
                    policy: source(targets.policy ?? null),
                    ...Object.fromEntries(
                      (["traffic", "capacity", "operations"] as const).map(
                        (decision) => [
                          decision,
                          source(
                            decision === "capacity" && targets.capacityDeferred
                              ? null
                              : (targets.setupQuotes?.[decision] ??
                                  targets.requirements?.find(
                                    (requirement) =>
                                      requirement.decision === decision,
                                  )?.quote ??
                                  null),
                          ),
                        ],
                      ),
                    ),
                  }
                : schemaName === "conversation_intent"
                  ? {
                      topic,
                      mode,
                      adviceTask: targets.adviceTask ?? "other",
                      adviceTaskSource:
                        targets.adviceTask === "capability-boundary" ||
                        targets.adviceTask === "policy-request"
                          ? "current"
                          : "none",
                      networkScope: scope,
                      firewallAvailability: availability,
                      firewallAreaKeys: targets.keys ?? [],
                      allFirewalls: targets.all ?? false,
                      firewallFields: targets.fields ?? [],
                      requirements: targets.requirements ?? [],
                    }
                  : dialogue,
            ),
          },
        },
      ],
    });
  });
  return { request, engine: new AssistantModelServing(configuration, request) };
}
const proposal: Dialogue = {
  explanation: "Pruefbarer HA-Vorschlag",
  questions: [],
  changes: [
    {
      path: "connectivity.firewall",
      value: { ha: { backup_zone: "eu01-2", vhid: 23 } },
    },
  ],
  references: ["firewall-infrastructure"],
};

it("answers native policy capability questions without another model answer or infrastructure questionnaire", async () => {
  const f = fixture();
  const { engine, request } = model(
    proposal,
    "other",
    "advice",
    "firewall-policy",
    "unspecified",
    { adviceTask: "capability-boundary" },
  );
  const result = await engine.converse(
    f.selection,
    f.values,
    [{ role: "user", content: "Bitte eine zentrale HA-Firewall einrichten." }],
    "Das ist kein Thema, welches wir behandeln können. Es gibt ein fertiges Firewall-Setup, aber noch keine Firewall-Regeln. Können diese gesetzt werden?",
  );
  expect(request).toHaveBeenCalledTimes(1);
  expect(result.changes).toEqual([]);
  expect(result.questions).toEqual([]);
  expect(result.explanation).toContain("nativ über firewall_config");
  expect(result.explanation).toContain("nicht das komplexe Regel-/NAT-Objekt");
  expect(result.explanation).toContain("noch keine Regeln konfiguriert");
  expect(result.references).toContain("firewall-policy");
});

it.each([
  [
    "Definiere die Firewall-Regeln für Internet-Egress.",
    "draft",
    "firewall-policy",
    "other",
  ],
  [
    "Erstelle eine ausgehende NAT-Regel.",
    "draft",
    "firewall-policy",
    "policy-request",
  ],
  [
    "Lege einen Alias für die Plattformdienste an.",
    "draft",
    "firewall-policy",
    "policy-request",
  ],
  [
    "Füge eine Route über das LAN-Gateway hinzu.",
    "draft",
    "firewall-policy",
    "policy-request",
  ],
  [
    "Schlage eine WAN-Portweiterleitung vor.",
    "draft",
    "firewall-policy",
    "policy-request",
  ],
  [
    "Setze jetzt die besprochenen Regeln und NAT.",
    "draft",
    "firewall-infrastructure",
    "policy-request",
  ],
  [
    "Wie pflegen wir die Firewall-Regeln?",
    "advice",
    "firewall-policy",
    "capability-boundary",
  ],
] as const)(
  "discloses the post-MVP policy boundary for %s without proposals or a questionnaire",
  async (message, mode, topic, adviceTask) => {
    const f = fixture();
    const before = structuredClone(f.values);
    const text: string[] = [];
    const { engine, request } = model(proposal, "other", mode, topic, "ha", {
      adviceTask,
    });
    const result = await engine.converse(
      f.selection,
      f.values,
      [
        {
          role: "user",
          content: "Eine zentrale HA-Firewall für 100 Projekte einrichten.",
        },
      ],
      message,
      { regions: [] },
      [],
      { onText: (value) => text.push(value) },
    );
    expect(result.explanation).toContain("kann aktuell keine Firewall-Regeln");
    expect(result.explanation).toContain("nicht Teil des MVP");
    expect(result.explanation).toContain("GitHub-Issue #101");
    expect(result.explanation).toContain("Firewall-Admin");
    expect(result.changes).toEqual([]);
    expect(result.questions).toEqual([]);
    expect(result.references).toContain("firewall-policy");
    expect(text).toEqual([result.explanation]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(f.values).toEqual(before);
  },
);
it.each([false, true])(
  "merges reviewed single/map HA without changing saved network, DNS or identity (%s)",
  (map) => {
    const f = fixture(map);
    const changes: Dialogue["changes"] = map
      ? [
          {
            path: "connectivity.firewalls",
            value: { corporate: { ha: { backup_zone: "eu01-2", vhid: 23 } } },
          },
        ]
      : proposal.changes;
    const next = applyAssistantChanges(f.draft, changes);
    const values = compileCommonConfiguration(next);
    const connectivity = objectValue(values.connectivity);
    expect(
      map
        ? objectValue(objectValue(connectivity.firewalls).corporate)
        : connectivity.firewall,
    ).toEqual({ ...firewall, ha: { backup_zone: "eu01-2", vhid: 23 } });
    expect(
      map ? connectivity.network_areas : connectivity.network_area,
    ).toEqual(map ? { corporate: area } : area);
    expect(connectivity.dns_zones).toEqual({});
    expect(next.identities).toEqual(f.draft.identities);
    expect({ ...values, connectivity: undefined }).toEqual({
      ...compileCommonConfiguration(f.draft),
      connectivity: undefined,
    });
  },
);

it.each([false, true])(
  "flattens and reconstructs independent HA fields at the correct single/map depth (%s)",
  (map) => {
    const path = map ? "connectivity.firewalls" : "connectivity.firewall";
    const patch = {
      flavor: "g1.8",
      ha: { backup_zone: "eu01-2", vhid: 23, lan_vip: "10.0.252.7" },
    };
    const changes = [
      {
        path,
        before: map ? { corporate: firewall } : firewall,
        value: map ? { corporate: patch } : patch,
      },
    ];
    const prefix = map ? `${path}/corporate` : path;
    expect(assistantProposalFields(changes).map((field) => field.id)).toEqual([
      `${prefix}/flavor`,
      `${prefix}/ha/backup_zone`,
      `${prefix}/ha/vhid`,
      `${prefix}/ha/lan_vip`,
    ]);
    const selected = selectAssistantProposalFields(changes, [
      `${prefix}/ha/backup_zone`,
      `${prefix}/ha/vhid`,
    ]);
    const value = { ha: { backup_zone: "eu01-2", vhid: 23 } };
    expect(selected).toEqual([
      { path, value: map ? { corporate: value } : value },
    ]);
    expect(() =>
      applyAssistantChanges(
        fixture(map).draft,
        validateDialogue(
          { ...proposal, changes: selected },
          proposal.references,
        ).changes,
      ),
    ).not.toThrow();
    expect(() =>
      applyAssistantChanges(
        fixture(map).draft,
        validateDialogue(
          {
            ...proposal,
            changes: selectAssistantProposalFields(changes, [
              `${prefix}/ha/vhid`,
            ]),
          },
          proposal.references,
        ).changes,
      ),
    ).toThrow();
  },
);

it("requires all native fields together for a new appliance and retains omitted imported metadata", () => {
  const f = fixture(false, false);
  expect(() =>
    applyAssistantChanges(f.draft, [
      { path: "connectivity.firewall", value: { flavor: "g1.4" } },
    ]),
  ).toThrow();
  expect(() =>
    applyAssistantChanges(f.draft, [
      {
        path: "connectivity.firewall",
        value: { ...firewall, ha: { backup_zone: "eu01-2" } },
      },
    ]),
  ).not.toThrow();
  expect(
    mergeAssistantFirewall(
      {
        ...firewall,
        imported_metadata: "retain",
        ha: { backup_zone: "eu01-2", imported_ha: "retain" },
      },
      { volume_size: 32 },
    ),
  ).toMatchObject({
    imported_metadata: "retain",
    volume_size: 32,
    ha: { imported_ha: "retain" },
  });
});

it.each([
  { lan_network_range: "192.168.1.0/24" },
  { wan_network_range: firewall.lan_network_range },
  { lan_ip: "10.0.253.5" },
  { lan_ip: "10.0.252.0" },
  { lan_ip: "10.0.252.255" },
  { ha: { backup_zone: "eu01-1" } },
  { ha: { backup_zone: "eu01-2", backup_lan_ip: "10.0.252.4" } },
  { ha: { backup_zone: "eu01-2", lan_vip: "10.0.252.5" } },
  { lan_network_range: "10.0.252.0/30", ha: { backup_zone: "eu01-2" } },
])("rejects invalid native subnet/HA dependencies: %j", (patch) => {
  expect(() =>
    validateAssistantFirewall(mergeAssistantFirewall(firewall, patch), area),
  ).toThrow();
});

it("rejects transfer overlap, unknown/incomplete map areas, unsupported regional forms and topology conversion", () => {
  expect(() =>
    validateAssistantFirewall(firewall, {
      ...area,
      transfer_network: firewall.lan_network_range,
    }),
  ).toThrow("assistant_firewall_transfer_overlap");
  const f = fixture(true);
  expect(() =>
    applyAssistantChanges(f.draft, [
      { path: "connectivity.firewalls", value: { unknown: firewall } },
    ]),
  ).toThrow("assistant_firewall_area_unknown");
  expect(() => applyAssistantChanges(f.draft, proposal.changes)).toThrow(
    "assistant_firewall_form_unsupported",
  );
  const template = catalogue.templates.find(
    (entry) => entry.id === "standalone",
  );
  if (!template) throw new Error("missing_fixture_template");
  const incomplete = commonConfigurationFromValues(
    template,
    f.draft.id,
    f.draft.name,
    {
      ...compileCommonConfiguration(f.draft),
      connectivity: { network_areas: { corporate: area, production: area } },
    },
  );
  expect(() =>
    applyAssistantChanges(incomplete, [
      { path: "connectivity.firewalls", value: { corporate: firewall } },
    ]),
  ).toThrow("assistant_firewall_areas_incomplete");
  const regional = commonConfigurationFromValues(
    template,
    f.draft.id,
    f.draft.name,
    {
      ...compileCommonConfiguration(f.draft),
      connectivity: null,
      connectivity_regions: {
        eu01: {
          network_areas: { default: area },
          firewalls: { default: firewall },
        },
      },
    },
  );
  expect(() => applyAssistantChanges(regional, proposal.changes)).toThrow(
    "assistant_firewall_form_unsupported",
  );
});

it("does not expose protected/unknown appliance or HA metadata to Model Serving", () => {
  const publicValue = assistantPublicFirewall({
    ...firewall,
    protected_access: "must-not-expose",
    ha: { backup_zone: "eu01-2", protected_access: "must-not-expose" },
  });
  expect(JSON.stringify(publicValue)).not.toContain("must-not-expose");
  expect(publicValue).toEqual({ ...firewall, ha: { backup_zone: "eu01-2" } });
  for (const value of [
    { ha: true },
    { admin_password: "must-not-expose" },
    { ha: { backup_zone: "eu01-2", api_token: "must-not-expose" } },
    null,
  ])
    expect(() =>
      validateDialogue(
        { ...proposal, changes: [{ path: "connectivity.firewall", value }] },
        ["firewall-infrastructure"],
      ),
    ).toThrow();
});

it("reports project subnet count independently from addresses and infrastructure reservations", () => {
  expect(assistantNetworkCapacity(area).join(" ")).toContain(
    "512 /25-Subnetze mit je 128 Adressen",
  );
  expect(assistantNetworkCapacity(area).join(" ")).toContain(
    "vor Infrastrukturreservierungen",
  );
  expect(
    assistantNetworkCapacity({ ...area, default_prefix_length: 24 }).join(" "),
  ).toContain("256 /24-Subnetze mit je 256 Adressen");
});

it("continues the combined configured-SNA request with reviewed firewall HA instead of imposing SNA-first", async () => {
  const f = fixture();
  const { engine, request } = model(
    proposal,
    "sna-and-firewall",
    "draft",
    "stackit-network-components",
  );
  const response = await engine.converse(
    f.selection,
    f.values,
    [],
    "Konfiguriere das zentrale Netzwerk fuer 100 Projekte und die zentrale hochverfuegbare Firewall. Backup-Zone eu01-2, vhid 23.",
  );
  expect(response.changes).toEqual(proposal.changes);
  expect(response.explanation).toContain("512 /25-Subnetze");
  expect(response.explanation).toContain("Noch nichts gespeichert");
  expect(response.explanation).toContain("Plan und Apply");
  expect(response.questions.map((question) => question.path)).toEqual([
    "connectivity.firewall.lan_network_range",
  ]);
  expect(
    JSON.parse(String(request.mock.calls[0]?.[1]?.body)).messages.some(
      (entry: { content: string }) => entry.content.includes("currentNetwork"),
    ),
  ).toBe(true);
});

it("asks targeted missing native prerequisites without an incomplete proposal or repeated HA consent", async () => {
  const f = fixture(false, false);
  const dialogue: Dialogue = {
    ...proposal,
    changes: [],
    questions: [
      {
        path: "connectivity.firewall.lan_network_range",
        text: "Welche freien LAN- und WAN-Netze sind bestaetigt?",
      },
      {
        path: "connectivity.firewall.zone",
        text: "Welche primaere und Backup-Zone soll verwendet werden?",
      },
      {
        path: "connectivity.firewall.flavor",
        text: "Welchen Durchsatz und welche Verbindungszahl sollen wir auslegen?",
      },
    ],
  };
  const response = await model(dialogue).engine.converse(
    f.selection,
    f.values,
    [],
    "Bitte die zentrale Firewall hochverfuegbar vorschlagen.",
  );
  expect(response.changes).toEqual([]);
  expect(response.questions).toHaveLength(3);
  expect(response.explanation).toContain("512 /25-Subnetze");
});

it("keeps native primary and HA IP defaults out of a metro-zone HA response schema", async () => {
  const f = fixture();
  f.values["connectivity.firewall"] = {
    ...firewall,
    zone: "eu01-m",
    flavor: "c1.2",
    name: "opnsense-26.1",
    lan_network_range: "10.0.2.0/28",
    wan_network_range: "10.0.2.16/28",
  };
  const { engine, request } = model(
    proposal,
    "sna-and-firewall",
    "draft",
    "firewall-infrastructure",
    "ha",
  );
  const response = await engine.converse(
    f.selection,
    f.values,
    [{ role: "user", content: "SNA-Pool 10.0.0.0/16." }],
    "Zentrales Netzwerk fuer 100 Projekte und eine hochverfuegbare Firewall konfigurieren.",
    {
      regions: [
        {
          region: "eu01",
          fetchedAt: null,
          products: {
            availabilityZones: {
              status: "available",
              totalOptions: 3,
              truncated: false,
              options: ["eu01-m", "eu01-1", "eu01-2"].map((value) => ({
                value,
                label: value,
              })),
            },
          },
        },
      ],
    },
  );
  expect(response.changes).toEqual(proposal.changes);
  const schema = JSON.parse(String(request.mock.calls[2]?.[1]?.body))
    .response_format.json_schema.schema;
  const properties =
    schema.properties.changes.items.properties.value.properties;
  expect(properties).not.toHaveProperty("lan_ip");
  expect(properties).not.toHaveProperty("wan_ip");
  for (const field of ["backup_lan_ip", "backup_wan_ip", "lan_vip"])
    expect(properties.ha.properties).not.toHaveProperty(field);
  expect(response.questions).toHaveLength(1);
  expect(response.explanation).toContain("VM c1.2");
  expect(response.explanation).toContain("LAN 10.0.2.0/28");
});

it.each([
  {
    requirements: [],
    path: "connectivity.firewall.lan_network_range",
  },
  {
    requirements: [
      { decision: "traffic", quote: "Internet- und Inter-Projekt-Verkehr." },
    ],
    path: "connectivity.firewall.flavor",
  },
  {
    requirements: [
      { decision: "traffic", quote: "Internet- und Inter-Projekt-Verkehr." },
      {
        decision: "capacity",
        quote: "500 Mbit/s und 10000 parallele Verbindungen.",
      },
    ],
    path: "connectivity.firewall.ha",
  },
  {
    requirements: [
      { decision: "traffic", quote: "Internet- und Inter-Projekt-Verkehr." },
      {
        decision: "capacity",
        quote: "500 Mbit/s und 10000 parallele Verbindungen.",
      },
      {
        decision: "operations",
        quote:
          "Maximal zwei Minuten Unterbrechung, Betrieb durch das Plattformteam.",
      },
    ],
    path: null,
  },
] as const)(
  "continues broad firewall setup with only the next unresolved business decision ($path)",
  async ({ requirements, path }) => {
    const f = fixture();
    const { engine } = model(
      proposal,
      "other",
      "draft",
      "firewall-infrastructure",
      "ha",
      { requirements: [...requirements] },
    );
    const result = await engine.converse(
      f.selection,
      f.values,
      requirements.map((entry) => ({
        role: "user" as const,
        content: entry.quote,
      })),
      "Bitte die restliche zentrale Firewall-Einrichtung fortsetzen. Backup-Zone eu01-2, vhid 23.",
    );
    expect(result.changes).toEqual(proposal.changes);
    expect(result.questions.map((question) => question.path)).toEqual(
      path ? [path] : [],
    );
    expect(result.explanation).toContain("Vorhandener Firewall-Entwurf");
    expect(JSON.stringify(result.questions)).not.toMatch(
      /HA.*gewünscht|HA.*aktivieren/,
    );
  },
);

it("does not attach broad setup questions to an explicit HA-only field update", async () => {
  const f = fixture();
  const result = await model(
    proposal,
    "other",
    "draft",
    "firewall-infrastructure",
    "ha",
    { fields: ["ha"] },
  ).engine.converse(
    f.selection,
    f.values,
    [],
    "Nur HA mit Backup-Zone eu01-2 und vhid 23 ergänzen; andere Werte unverändert.",
  );
  expect(result.changes).toEqual(proposal.changes);
  expect(result.questions).toEqual([]);
});

it("continues the real multi-turn setup through policy and deferred sizing without internal text or repeated questions", async () => {
  const f = fixture();
  f.values["connectivity.firewall"] = {
    ...firewall,
    ha: { backup_zone: "eu01-2", vhid: 1 },
  };
  const setup =
    "Bitte das zentrale Netzwerk für 100 Projekte mit einer hochverfügbaren Firewall konfigurieren.";
  const traffic = "Internet-Verkehr; Zwischen Projekten; Zu externen Netzen";
  const policy =
    "Internet-Egress erlauben und NAT nutzen. Eingehend alles sperren. Zwischen Projekten nur explizite Allow-Regeln. Zentrale Plattformdienste erlauben. Weitere Regeln pflegt der Firewall-Admin.";
  const capacity =
    "Das kann ich heute noch nicht sagen. Den Traffic kann ich noch nicht beziffern; wir brauchen Puffer für Downloads und Updates.";
  const operations = "Maximal zwei Minuten Unterbrechung sind tolerierbar.";
  const history: { role: "user" | "assistant"; content: string }[] = [];
  const rounds = [
    {
      message: setup,
      traffic: null,
      policy: null,
      capacity: null,
      operations: null,
      path: "connectivity.firewall.lan_network_range",
    },
    {
      message: `Welche Verkehrswege?\nMeine Antwort: ${traffic}`,
      traffic,
      policy: null,
      capacity: null,
      operations: null,
      path: "connectivity.firewall.flavor",
    },
    {
      message: `Welche Regeln?\nMeine Antwort: ${policy}`,
      traffic,
      policy,
      capacity: null,
      operations: null,
      path: "connectivity.firewall.flavor",
    },
    {
      message: `Welchen Spitzen-Durchsatz?\nMeine Antwort: ${capacity}`,
      traffic,
      policy,
      capacity,
      operations: null,
      path: "connectivity.firewall.ha",
    },
    {
      message: `Welche maximale Unterbrechung?\nMeine Antwort: ${operations}`,
      traffic,
      policy,
      capacity,
      operations,
      path: null,
    },
  ];
  for (const round of rounds) {
    const result = await model(
      {
        explanation:
          "Business decision: traffic paths and allowed exceptions, not a request to invent CIDRs. Reuse prior confirmed traffic scope.",
        references: ["firewall-infrastructure"],
        questions: [],
        changes: [],
      },
      "other",
      history.length ? "advice" : "draft",
      round.policy ? "firewall-policy" : "firewall-infrastructure",
      "unspecified",
      {
        setupScope: "setup",
        setupRequest: setup,
        haRequest: setup,
        setupQuotes: {
          traffic: round.traffic,
          capacity: round.capacity,
          operations: round.operations,
        },
        capacityDeferred: round.capacity !== null,
        ...(round.policy
          ? { policy: round.policy, operator: "Firewall-Admin" }
          : {}),
      },
    ).engine.converse(f.selection, f.values, history, round.message);
    expect(result.changes).toEqual([]);
    expect(result.questions.map((question) => question.path)).toEqual(
      round.path ? [round.path] : [],
    );
    expect(result.explanation).not.toMatch(
      /Business decision:|Reuse prior|speichert den Entwurf/,
    );
    expect(result.explanation).toContain(
      "Konfiguration speichern bleibt separat",
    );
    if (round.policy) {
      expect(result.explanation).toContain(policy);
      expect(result.questions[0]?.text ?? "").not.toContain("wer übernimmt");
    }
    if (round.capacity)
      expect(result.explanation).toContain(
        "Kapazität vorerst offen; Sizing/Benchmark ausstehend",
      );
    history.push(
      { role: "user", content: round.message },
      {
        role: "assistant",
        content: `${result.explanation}\n${result.questions.map((question) => question.text).join("\n")}`,
      },
    );
  }
});

it("keeps a narrow native patch free of setup questions even when the general classifier omits field keys", async () => {
  const f = fixture();
  const result = await model(
    proposal,
    "other",
    "draft",
    "firewall-infrastructure",
    "ha",
    { setupScope: "field-update" },
  ).engine.converse(
    f.selection,
    f.values,
    [],
    "Nur HA mit Backup-Zone eu01-2 und vhid 23 ergänzen; alles andere beibehalten.",
  );
  expect(result.changes).toEqual(proposal.changes);
  expect(result.questions).toEqual([]);
});

it.each([
  {
    traffic: false,
    capacity: false,
    operations: false,
    path: "connectivity.firewall.lan_network_range",
  },
  {
    traffic: true,
    capacity: false,
    operations: false,
    path: "connectivity.firewall.flavor",
  },
  {
    traffic: true,
    capacity: true,
    operations: false,
    path: "connectivity.firewall.ha",
  },
  { traffic: true, capacity: true, operations: true, path: null },
])(
  "classifies broad HA setup independently of general field hints: $path",
  async (answered) => {
    const f = fixture();
    f.values["connectivity.firewall"] = {
      ...firewall,
      zone: "eu01-m",
      flavor: "c1.2",
      lan_network_range: "10.0.2.0/28",
      wan_network_range: "10.0.2.16/28",
    };
    const message =
      "Bitte die restliche zentrale Firewall-Einrichtung mit HA fortsetzen. Vorhandene Netz- und VM-Werte behalten, keine Ausführung.";
    const quotes = {
      traffic: answered.traffic
        ? "Über die zentrale Firewall sollen Internet-Verkehr und Verkehr zwischen Projekten laufen."
        : null,
      capacity: answered.capacity
        ? "Wir erwarten 500 Mbit/s Spitzendurchsatz und 10000 parallele Verbindungen."
        : null,
      operations: answered.operations
        ? "Maximal zwei Minuten Unterbrechung sind tolerierbar."
        : null,
    };
    const history = Object.values(quotes).flatMap((content) =>
      content ? [{ role: "user" as const, content }] : [],
    );
    const { engine, request } = model(
      proposal,
      "other",
      "draft",
      "firewall-infrastructure",
      "ha",
      {
        fields: ["ha"],
        setupScope: "setup",
        setupRequest: message,
        haRequest: message,
        setupQuotes: quotes,
      },
    );
    const result = await engine.converse(
      f.selection,
      f.values,
      history,
      message,
      {
        regions: [
          {
            region: "eu01",
            fetchedAt: null,
            products: {
              availabilityZones: {
                status: "available",
                totalOptions: 3,
                truncated: false,
                options: ["eu01-m", "eu01-1", "eu01-2"].map((value) => ({
                  value,
                  label: value,
                })),
              },
            },
          },
        ],
      },
    );
    expect(result.changes).toEqual(proposal.changes);
    expect(result.questions.map((question) => question.path)).toEqual(
      answered.path ? [answered.path] : [],
    );
    expect(
      request.mock.calls.filter(
        ([, options]) =>
          JSON.parse(String(options?.body)).response_format.json_schema.name ===
          "firewall_setup_decisions",
      ),
    ).toHaveLength(1);
  },
);

it("retains an explicit narrow HA update after broad setup despite general field hints", async () => {
  const f = fixture();
  const { engine, request } = model(
    proposal,
    "other",
    "draft",
    "firewall-infrastructure",
    "ha",
    { fields: ["ha"], setupScope: "field-update" },
  );
  const result = await engine.converse(
    f.selection,
    f.values,
    [
      {
        role: "user",
        content: "Bitte die zentrale Firewall vollständig einrichten.",
      },
    ],
    "Nur HA mit Backup-Zone eu01-2 und vhid 23 ergänzen, keine weiteren Einrichtungsfragen.",
  );
  expect(result.changes).toEqual(proposal.changes);
  expect(result.questions).toEqual([]);
  expect(
    request.mock.calls.filter(
      ([, options]) =>
        JSON.parse(String(options?.body)).response_format.json_schema.name ===
        "firewall_setup_decisions",
    ),
  ).toHaveLength(1);
});

it("uses null-only evidence for a long narrow request without bounded quote fragments", async () => {
  const f = fixture();
  const { engine, request } = model(
    proposal,
    "other",
    "draft",
    "firewall-infrastructure",
    "ha",
    { fields: ["ha"], setupScope: "field-update" },
  );
  const result = await engine.converse(
    f.selection,
    f.values,
    [],
    `Nur HA mit Backup-Zone eu01-2 und vhid 23 ergänzen; alle anderen Werte erhalten ${"Zusatz ".repeat(100)}`,
  );
  expect(result.changes).toEqual(proposal.changes);
  expect(result.questions).toEqual([]);
  const classification = request.mock.calls
    .map(([, options]) => JSON.parse(String(options?.body)))
    .find(
      (body) =>
        body.response_format.json_schema.name === "firewall_setup_decisions",
    );
  expect(
    JSON.parse(classification.messages.at(-1).content).userEvidence,
  ).toEqual([]);
  expect(
    classification.response_format.json_schema.schema.properties.traffic,
  ).toMatchObject({ type: "null" });
  expect(
    JSON.stringify(classification.response_format.json_schema.schema),
  ).not.toContain('"enum":[]');
});

it("rejects invented confirmations from the bounded setup decision classifier", async () => {
  const f = fixture();
  const { request } = model(
    proposal,
    "sna-and-firewall",
    "draft",
    "firewall-infrastructure",
    "ha",
    {
      setupQuotes: {
        traffic: "Nicht vom Benutzer bestätigter Internet-Verkehr.",
        capacity: null,
        operations: null,
      },
    },
  );
  const engine = new AssistantModelServing(
    { ...configuration, intentModel: "test-intent-model" },
    request,
  );
  await expect(
    engine.converse(
      f.selection,
      f.values,
      [],
      "Zentrales Netzwerk und HA mit Backup-Zone eu01-2 und vhid 23 konfigurieren.",
    ),
  ).rejects.toMatchObject({ reason: "intent_schema" });
  expect(request).toHaveBeenCalledTimes(2);
  expect(
    request.mock.calls.map((call) => JSON.parse(String(call[1]?.body)).model),
  ).toEqual(["test-intent-model", "test-intent-model"]);
});

it("restricts explicitly requested IP response values to saved or user-supplied addresses", async () => {
  const f = fixture();
  f.values["connectivity.firewall"] = { ...firewall, lan_ip: "10.0.252.4" };
  const patch: Dialogue = {
    ...proposal,
    changes: [
      {
        path: "connectivity.firewall",
        value: {
          lan_ip: "10.0.252.8",
          ha: { backup_zone: "eu01-2", lan_vip: "10.0.252.9", vhid: 23 },
        },
      },
    ],
  };
  const { engine, request } = model(
    patch,
    "other",
    "draft",
    "firewall-infrastructure",
    "ha",
    { fields: ["lan_ip", "ha"] },
  );
  await engine.converse(
    f.selection,
    f.values,
    [],
    "LAN-IP 10.0.252.8 und HA-VIP 10.0.252.9, Backup-Zone eu01-2, vhid 23 vorschlagen.",
  );
  const schema = JSON.parse(String(request.mock.calls.at(-1)?.[1]?.body))
    .response_format.json_schema.schema;
  const value = schema.properties.changes.items.properties.value;
  expect(value.required).toContain("lan_ip");
  expect(value.properties.lan_ip.enum).toEqual([
    "10.0.252.8",
    "10.0.252.9",
    "10.0.252.4",
  ]);
  expect(value.properties.ha.properties.lan_vip.enum).toEqual([
    "10.0.252.8",
    "10.0.252.9",
  ]);
});

it("asks for an explicitly requested missing node IP instead of proposing a computed default", async () => {
  const f = fixture();
  const { engine, request } = model(
    { ...proposal, changes: [] },
    "other",
    "draft",
    "firewall-infrastructure",
    "unspecified",
    { fields: ["lan_ip"] },
  );
  const response = await engine.converse(
    f.selection,
    f.values,
    [],
    "Bitte die LAN-IP der vorhandenen Firewall vorschlagen.",
  );
  expect(response.changes).toEqual([]);
  expect(response.questions.map((entry) => entry.path)).toEqual([
    "connectivity.firewall.lan_ip",
  ]);
  expect(
    request.mock.calls.map(
      ([, options]) =>
        JSON.parse(String(options?.body)).response_format.json_schema.name,
    ),
  ).toEqual(["conversation_intent", "firewall_setup_decisions"]);
});

it("still rejects invented computed primary and HA IP defaults after schema narrowing", async () => {
  const f = fixture();
  for (const value of [
    { lan_ip: "10.0.252.4" },
    { wan_ip: "10.0.253.4" },
    { ha: { backup_zone: "eu01-2", vhid: 23, lan_vip: "10.0.252.6" } },
  ]) {
    await expect(
      model({
        ...proposal,
        changes: [{ path: "connectivity.firewall", value }],
      }).engine.converse(
        f.selection,
        f.values,
        [],
        "HA mit Backup-Zone eu01-2 vorschlagen.",
      ),
    ).rejects.toMatchObject({ reason: "invalid_scope" });
  }
});

it("suppresses saved HA no-ops but permits explicitly supplied zones without pretending catalogue availability", async () => {
  const f = fixture();
  f.values["connectivity.firewall"] = {
    ...firewall,
    ha: { backup_zone: "eu01-2", vhid: 23 },
  };
  const response = await model(proposal).engine.converse(
    f.selection,
    f.values,
    [],
    "Bitte die HA-Konfiguration erneut pruefen.",
  );
  expect(response.changes).toEqual([]);
  expect(response.explanation).toContain(
    "bereits im aktuellen Entwurf vorhanden",
  );
});

it("rejects invented zones, flavours and subnets when authorized facts and user evidence are missing", async () => {
  const f = fixture();
  for (const value of [
    { zone: "eu01-3" },
    { flavor: "g1.8" },
    { lan_network_range: "10.0.251.0/24" },
    { ha: { backup_zone: "eu01-2" } },
  ]) {
    await expect(
      model({
        ...proposal,
        changes: [{ path: "connectivity.firewall", value }],
      }).engine.converse(
        f.selection,
        f.values,
        [],
        "Konfiguriere die zentrale Firewall.",
      ),
    ).rejects.toMatchObject({ reason: "invalid_scope" });
  }
});

it("keeps genuine SNA-only and firewall-advice requests free of infrastructure mutations", async () => {
  const f = fixture();
  await expect(
    model(
      proposal,
      "sna-only",
      "draft",
      "stackit-network-components",
    ).engine.converse(
      f.selection,
      f.values,
      [],
      "Nur SNA zuerst; Firewall spaeter.",
    ),
  ).rejects.toThrow();
  await expect(
    model(proposal, "other", "advice").engine.converse(
      f.selection,
      f.values,
      [],
      "Nur die Firewall erklaeren.",
    ),
  ).rejects.toThrow();
});

it("marks central and regional native HA fields as validated proposals", () => {
  const knowledge = buildAssistantKnowledge();
  for (const path of [
    "connectivity.firewall.ha.backup_zone",
    "connectivity.firewalls[*].ha.vhid",
  ]) {
    const field = knowledge.fields.find((entry) => entry.path === path);
    expect(field?.mode).toBe("propose-validated-draft");
  }
  expect(
    knowledge.fields.find(
      (entry) =>
        entry.path === "connectivity_regions[*].firewalls[*].ha.backup_zone",
    )?.proposalPath,
  ).toBe("connectivity_regions");
});

it("preserves the native legacy single-firewall form with a saved network_areas map", async () => {
  const f = fixture(true);
  const template = catalogue.templates.find(
    (entry) => entry.id === "standalone",
  );
  if (!template) throw new Error("missing_fixture_template");
  const draft = commonConfigurationFromValues(
    template,
    f.draft.id,
    f.draft.name,
    {
      ...compileCommonConfiguration(f.draft),
      connectivity: {
        network_areas: { corporate: area },
        firewall,
        dns_zones: {},
      },
    },
  );
  const values = assistantPublicValues(draft);
  expect(values["assistant.firewall_form"]).toBe("single");
  const response = await model(proposal).engine.converse(
    f.selection,
    values,
    [],
    "HA-Backup-Zone eu01-2 und vhid 23 vorschlagen.",
  );
  const saved = objectValue(
    compileCommonConfiguration(applyAssistantChanges(draft, response.changes))
      .connectivity,
  );
  expect(saved.firewalls).toBeUndefined();
  expect(saved.firewall).toEqual({
    ...firewall,
    ha: { backup_zone: "eu01-2", vhid: 23 },
  });
});

it("allows a verified regional catalogue choice but rejects unavailable and wrong-region catalogues", async () => {
  const f = fixture();
  for (const status of ["available", "unavailable"] as const) {
    const result = model(proposal).engine.converse(
      f.selection,
      f.values,
      [],
      "HA vorschlagen, vhid 23.",
      {
        regions: [
          {
            region: "eu01",
            fetchedAt: null,
            products: {
              availabilityZones: {
                status,
                options: [{ value: "eu01-2", label: "eu01-2" }],
                totalOptions: 1,
                truncated: false,
              },
            },
          },
        ],
      },
    );
    if (status === "available")
      expect((await result).changes).toEqual(proposal.changes);
    else
      await expect(result).rejects.toMatchObject({ reason: "invalid_scope" });
  }
  await expect(
    model(proposal).engine.converse(
      f.selection,
      f.values,
      [],
      "HA vorschlagen.",
      {
        regions: [
          {
            region: "eu02",
            fetchedAt: null,
            products: {
              availabilityZones: {
                status: "available",
                options: [{ value: "eu01-2", label: "eu01-2" }],
                totalOptions: 1,
                truncated: false,
              },
            },
          },
        ],
      },
    ),
  ).rejects.toMatchObject({ reason: "invalid_scope" });
});

it("does not drop explicit HA while preparing a new appliance", async () => {
  const f = fixture(false, false);
  const incomplete = {
    ...proposal,
    changes: [{ path: "connectivity.firewall", value: firewall }],
  };
  await expect(
    model(
      incomplete,
      "other",
      "draft",
      "firewall-infrastructure",
      "ha",
    ).engine.converse(
      f.selection,
      f.values,
      [],
      `Bitte HA mit Name ${firewall.name}, Zone ${firewall.zone}, Backup-Zone eu01-2, Flavor ${firewall.flavor}, LAN ${firewall.lan_network_range}, WAN ${firewall.wan_network_range} vorschlagen.`,
    ),
  ).rejects.toMatchObject({ reason: "invalid_scope" });
});

it("retains the combined HA requirement while asking only genuinely missing SNA prerequisites", async () => {
  const f = fixture();
  const values = { ...f.values, "connectivity.network_area": null };
  const response = await model(
    {
      explanation: "Der bestaetigte freie SNA-Adresspool fehlt.",
      questions: [
        {
          path: "connectivity.network_area.ranges",
          text: "Welcher freie SNA-Adresspool ist bestaetigt?",
        },
      ],
      changes: [],
      references: ["stackit-network-components"],
    },
    "sna-and-firewall",
    "draft",
    "firewall-infrastructure",
    "ha",
  ).engine.converse(
    f.selection,
    values,
    [],
    "Zentrales Netzwerk und eine hochverfuegbare Firewall konfigurieren.",
  );
  expect(response.changes).toEqual([]);
  expect(response.questions).toHaveLength(1);
  expect(response.explanation).toContain("Firewall-Auftrag mit HA");
});

it("requires an explicit target with multiple saved appliances and changes only the selected area", async () => {
  const f = fixture(true);
  const template = catalogue.templates.find(
    (entry) => entry.id === "standalone",
  );
  if (!template) throw new Error("missing_fixture_template");
  const productionFirewall = {
    ...firewall,
    zone: "eu01-2",
    lan_network_range: "10.1.252.0/24",
    wan_network_range: "10.1.253.0/24",
  };
  const draft = commonConfigurationFromValues(
    template,
    f.draft.id,
    f.draft.name,
    {
      ...compileCommonConfiguration(f.draft),
      connectivity: {
        network_areas: {
          corporate: area,
          production: { ...area, ranges: ["10.1.0.0/16"] },
        },
        firewalls: { corporate: firewall, production: productionFirewall },
      },
    },
  );
  const values = assistantPublicValues(draft);
  const patch: Dialogue = {
    ...proposal,
    changes: [
      {
        path: "connectivity.firewalls",
        value: { corporate: { ha: { backup_zone: "eu01-2", vhid: 23 } } },
      },
    ],
  };
  const unknown = model(
    patch,
    "other",
    "draft",
    "firewall-infrastructure",
    "ha",
  );
  const question = await unknown.engine.converse(
    f.selection,
    values,
    [],
    "Bitte HA vorschlagen, Backup-Zone eu01-2.",
  );
  expect(question.changes).toEqual([]);
  expect(question.questions[0]?.path).toBe("connectivity.firewalls");
  expect(unknown.request).toHaveBeenCalledTimes(2);
  const selected = await model(
    patch,
    "other",
    "draft",
    "firewall-infrastructure",
    "ha",
    { keys: ["corporate"] },
  ).engine.converse(
    f.selection,
    values,
    [],
    "Nur Corporate: HA mit Backup-Zone eu01-2 und vhid 23.",
  );
  const network = objectValue(
    compileCommonConfiguration(applyAssistantChanges(draft, selected.changes))
      .connectivity,
  );
  expect(objectValue(network.firewalls).production).toEqual(productionFirewall);
  await expect(
    model(
      {
        ...patch,
        changes: [
          {
            path: "connectivity.firewalls",
            value: { production: { flavor: "g1.8" } },
          },
        ],
      },
      "other",
      "draft",
      "firewall-infrastructure",
      "unspecified",
      { keys: ["corporate"] },
    ).engine.converse(f.selection, values, [], "Nur Corporate: Flavor g1.8."),
  ).rejects.toMatchObject({ reason: "invalid_scope" });
});

it("requires explicit all-area consent before creating a map that enables additional appliances", async () => {
  const f = fixture(true, false);
  const template = catalogue.templates.find(
    (entry) => entry.id === "standalone",
  );
  if (!template) throw new Error("missing_fixture_template");
  const draft = commonConfigurationFromValues(
    template,
    f.draft.id,
    f.draft.name,
    {
      ...compileCommonConfiguration(f.draft),
      connectivity: {
        network_areas: {
          corporate: area,
          production: { ...area, ranges: ["10.1.0.0/16"] },
        },
      },
    },
  );
  const response = await model(
    proposal,
    "other",
    "draft",
    "firewall-infrastructure",
    "ha",
    { keys: ["corporate"] },
  ).engine.converse(
    f.selection,
    assistantPublicValues(draft),
    [],
    "Nur Corporate: Zone eu01-1, Backup-Zone eu01-2, Flavor g1.4, LAN 10.0.252.0/24, WAN 10.0.253.0/24.",
  );
  expect(response.changes).toEqual([]);
  expect(response.questions[0]?.text).toContain(
    "alle vorhandenen SNA-Bereiche",
  );
});

it("requires explicitly requested existing native fields in the answer contract", async () => {
  const f = fixture();
  const patch: Dialogue = {
    ...proposal,
    changes: [
      {
        path: "connectivity.firewall",
        value: { name: "reviewed-fw", flavor: "g1.8" },
      },
    ],
  };
  const { engine, request } = model(
    patch,
    "other",
    "draft",
    "firewall-infrastructure",
    "unspecified",
    { fields: ["name", "flavor"] },
  );
  const response = await engine.converse(
    f.selection,
    f.values,
    [],
    "Name reviewed-fw und Flavor g1.8 vorschlagen.",
  );
  expect(response.changes).toEqual(patch.changes);
  const schema = JSON.parse(String(request.mock.calls.at(-1)?.[1]?.body))
    .response_format.json_schema.schema;
  expect(schema.properties.changes.items.properties.value.required).toEqual([
    "flavor",
    "name",
  ]);
});
