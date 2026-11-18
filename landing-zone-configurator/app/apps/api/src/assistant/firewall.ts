import { isDeepStrictEqual } from "node:util";
import type { AssistantLanguage } from "@lzc/contracts";
import { objectValue } from "@lzc/domain";
import { z } from "zod";
import type { Dialogue } from "./dialogue.js";

export const assistantFirewallHaSchema = z.strictObject({
  backup_zone: z.string().trim().min(1).max(100),
  backup_name: z.string().trim().min(1).max(100).nullable().optional(),
  backup_lan_ip: z.ipv4().nullable().optional(),
  backup_wan_ip: z.ipv4().nullable().optional(),
  lan_vip: z.ipv4().nullable().optional(),
  vhid: z.number().int().min(1).max(255).optional(),
});

export const assistantFirewallSchema = z.strictObject({
  zone: z.string().trim().min(1).max(100),
  flavor: z.string().regex(/^[a-z][0-9]+\.[0-9]+$/),
  name: z.string().trim().min(1).max(100),
  volume_performance_class: z.string().trim().min(1).max(100).optional(),
  volume_size: z.number().int().min(16).optional(),
  lan_network_range: z.cidrv4(),
  wan_network_range: z.cidrv4(),
  lan_ip: z.ipv4().nullable().optional(),
  wan_ip: z.ipv4().nullable().optional(),
  ha: assistantFirewallHaSchema.nullable().optional(),
});

export const assistantFirewallPatchSchema = assistantFirewallSchema
  .omit({ ha: true })
  .partial()
  .extend({ ha: assistantFirewallHaSchema.partial().optional() })
  .refine((firewall) => Object.keys(firewall).length > 0);

export const assistantFirewallsPatchSchema = z
  .record(
    z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    assistantFirewallPatchSchema,
  )
  .refine(
    (firewalls) =>
      Object.keys(firewalls).length > 0 && Object.keys(firewalls).length <= 32,
  );

function ipNumber(address: string) {
  return z
    .ipv4()
    .parse(address)
    .split(".")
    .reduce((result, octet) => result * 256 + Number(octet), 0);
}

export function assistantSubnet(cidr: string) {
  const [address, length] = z.cidrv4().parse(cidr).split("/");
  const prefix = Number(length);
  const size = 2 ** (32 - prefix);
  const start = Math.floor(ipNumber(address ?? "") / size) * size;
  return { prefix, start, end: start + size, size };
}

export function assistantNetworkCapacity(
  area: unknown,
  language: AssistantLanguage = "de",
) {
  const values = objectValue(area as Parameters<typeof objectValue>[0]);
  if (
    !Array.isArray(values.ranges) ||
    typeof values.default_prefix_length !== "number"
  )
    return [];
  const prefix = values.default_prefix_length;
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return [];
  return values.ranges.flatMap((range) => {
    if (typeof range !== "string" || !z.cidrv4().safeParse(range).success)
      return [];
    const pool = assistantSubnet(range);
    return prefix >= pool.prefix
      ? [
          language === "en"
            ? `${range} mathematically contains ${2 ** (prefix - pool.prefix)} /${prefix} subnets with ${2 ** (32 - prefix)} addresses each before infrastructure reservations. This does not confirm free project networks, quotas or firewall throughput.`
            : `${range} enthält rechnerisch ${2 ** (prefix - pool.prefix)} /${prefix}-Subnetze mit je ${2 ** (32 - prefix)} Adressen vor Infrastrukturreservierungen. Keine Zusage zu freien Projektnetzen, Quoten oder Firewall-Durchsatz.`,
        ]
      : [];
  });
}

export function assistantPublicFirewall(value: unknown) {
  if (value == null) return null;
  const firewall = objectValue(value as Parameters<typeof objectValue>[0]);
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(assistantFirewallSchema.shape)) {
    if (firewall[key] === undefined) continue;
    if (key !== "ha" || firewall.ha == null) result[key] = firewall[key];
    else {
      const ha = objectValue(firewall.ha);
      result[key] = Object.fromEntries(
        Object.keys(assistantFirewallHaSchema.shape)
          .filter((field) => ha[field] !== undefined)
          .map((field) => [field, ha[field]]),
      );
    }
  }
  return result;
}

export function mergeAssistantFirewall(existing: unknown, patch: unknown) {
  const before = objectValue(existing as Parameters<typeof objectValue>[0]);
  const proposed = assistantFirewallPatchSchema.parse(patch);
  for (const field of ["lan_ip", "wan_ip"] as const)
    if (before[field] != null && proposed[field] === null)
      throw new Error("assistant_firewall_address_removal_not_supported");
  const merged = {
    ...before,
    ...JSON.parse(JSON.stringify(proposed)),
    ...(proposed.ha
      ? { ha: { ...objectValue(before.ha), ...proposed.ha } }
      : {}),
  };
  const parsed = assistantFirewallSchema.parse(assistantPublicFirewall(merged));
  return {
    ...before,
    ...parsed,
    ...(parsed.ha ? { ha: { ...objectValue(before.ha), ...parsed.ha } } : {}),
  };
}

export function assistantFirewallPatchChanged(
  existing: unknown,
  patch: unknown,
) {
  const before = objectValue(existing as Parameters<typeof objectValue>[0]);
  const proposed = assistantFirewallPatchSchema.parse(patch);
  return Object.entries(proposed).some(([key, value]) =>
    key === "ha"
      ? Object.entries(value ?? {}).some(
          ([field, input]) =>
            !isDeepStrictEqual(
              objectValue(before.ha)[field] ?? null,
              input ?? null,
            ),
        )
      : !isDeepStrictEqual(before[key] ?? null, value ?? null),
  );
}

export function validateAssistantFirewall(
  firewall: z.infer<typeof assistantFirewallSchema>,
  area: unknown,
) {
  const network = objectValue(area as Parameters<typeof objectValue>[0]);
  if (!Array.isArray(network.ranges) || !network.ranges.length)
    throw new Error("assistant_firewall_area_unknown");
  const pools = network.ranges.map((range) =>
    assistantSubnet(z.string().parse(range)),
  );
  const lan = assistantSubnet(firewall.lan_network_range);
  const wan = assistantSubnet(firewall.wan_network_range);
  const overlaps = (
    a: ReturnType<typeof assistantSubnet>,
    b: ReturnType<typeof assistantSubnet>,
  ) => a.start < b.end && b.start < a.end;
  if (
    ![lan, wan].every((subnet) =>
      pools.some(
        (pool) => subnet.start >= pool.start && subnet.end <= pool.end,
      ),
    ) ||
    overlaps(lan, wan)
  )
    throw new Error("assistant_firewall_subnets_invalid");
  if (typeof network.transfer_network === "string") {
    const transfer = assistantSubnet(network.transfer_network);
    if (overlaps(lan, transfer) || overlaps(wan, transfer))
      throw new Error("assistant_firewall_transfer_overlap");
  }
  const primaryLan = firewall.lan_ip
    ? ipNumber(firewall.lan_ip)
    : lan.start + 4;
  const primaryWan = firewall.wan_ip
    ? ipNumber(firewall.wan_ip)
    : wan.start + 4;
  const addresses: [number, ReturnType<typeof assistantSubnet>][] = [
    [primaryLan, lan],
    [primaryWan, wan],
  ];
  if (firewall.ha)
    addresses.push(
      [
        firewall.ha.backup_lan_ip
          ? ipNumber(firewall.ha.backup_lan_ip)
          : lan.start + 5,
        lan,
      ],
      [
        firewall.ha.backup_wan_ip
          ? ipNumber(firewall.ha.backup_wan_ip)
          : wan.start + 5,
        wan,
      ],
      [
        firewall.ha.lan_vip ? ipNumber(firewall.ha.lan_vip) : lan.start + 6,
        lan,
      ],
    );
  if (
    addresses.some(
      ([address, subnet]) =>
        address <= subnet.start + 1 || address >= subnet.end - 1,
    ) ||
    new Set(addresses.map(([address]) => address)).size !== addresses.length
  )
    throw new Error("assistant_firewall_addresses_invalid");
  if (firewall.ha?.backup_zone === firewall.zone)
    throw new Error("assistant_firewall_backup_zone_invalid");
}

export function assistantFirewallRequirementQuestions(
  nextDecision: "traffic" | "capacity" | "operations" | undefined,
  operator: string | null,
  language: AssistantLanguage | undefined,
): Dialogue["questions"] {
  const decisionPaths = {
    traffic: "connectivity.firewall.lan_network_range",
    capacity: "connectivity.firewall.flavor",
    operations: "connectivity.firewall.ha",
  };
  const followups: Record<
    keyof typeof decisionPaths,
    Dialogue["questions"][number]
  > = {
    traffic: {
      path: decisionPaths.traffic,
      text: "Welche Verkehrswege sollen über die zentrale Firewall laufen? Gleicher Subnetzverkehr ist nicht automatisch ein gerouteter Firewall-Pfad. Die Antwort beschreibt den Infrastrukturbedarf, nicht Firewall-Regeln; diese pflegt der Firewall-Admin.",
      options: ["Internet-Verkehr", "Zwischen Projekten", "Zu externen Netzen"],
      multiple: true,
    },
    capacity: {
      path: decisionPaths.capacity,
      text: "Welchen Spitzen-Durchsatz und wie viele parallele Verbindungen erwartest du? Die gespeicherte VM-Größe bleibt erhalten; Projektzahlen und Produktnamen allein belegen keine ausreichende Leistung.",
    },
    operations: {
      path: decisionPaths.operations,
      text: operator
        ? "Welche maximale Unterbrechung bei Ausfall oder Wartung ist tolerierbar? Der bereits benannte Firewall-Betrieb bleibt erhalten; HA allein belegt keine bestimmte Ausfallzeit."
        : "Welche maximale Unterbrechung bei Ausfall oder Wartung ist tolerierbar und wer übernimmt den Firewall-Betrieb? Bereits angeforderte HA bleibt erhalten; eine bestimmte Ausfallzeit ist damit noch nicht nachgewiesen.",
    },
  };
  for (const question of Object.values(followups))
    question.answerType = "requirements";
  followups.capacity.options =
    language === "en"
      ? [
          "Traffic is not yet quantifiable; retain the current VM size as a provisional baseline and validate capacity separately",
          "I will provide peak throughput and concurrent connection requirements",
        ]
      : [
          "Traffic ist noch nicht bezifferbar; aktuelle VM-Größe vorläufig beibehalten und Kapazität separat prüfen",
          "Ich gebe Spitzen-Durchsatz und gleichzeitige Verbindungen an",
        ];
  if (language === "en") {
    followups.traffic.text =
      "Which traffic paths should use the central firewall? Traffic within one subnet is not automatically routed through it. This describes infrastructure needs; the firewall administrator manages rules.";
    followups.traffic.options = [
      "Internet traffic",
      "Between projects",
      "To external networks",
    ];
    followups.capacity.text =
      "What peak throughput and concurrent connection count do you expect? The current VM size is preserved; project counts and product names alone do not prove sufficient performance.";
    followups.operations.text = operator
      ? "What maximum interruption is acceptable during failure or maintenance? The named operator is retained; HA alone does not establish a recovery time."
      : "What maximum interruption is acceptable during failure or maintenance, and who operates the firewall? Requested HA is retained without a recovery-time guarantee.";
    followups.operations.options = operator
      ? [
          "Requirement: maximum two minutes interruption",
          "Requirement: maximum ten minutes interruption",
          "I will state the tolerated interruption",
        ]
      : [
          "Requirement: maximum two minutes interruption; our platform team operates the firewall",
          "Requirement: maximum ten minutes interruption; our platform team operates the firewall",
          "I will state the tolerated interruption and operator",
        ];
  }
  return nextDecision ? [followups[nextDecision]] : [];
}
