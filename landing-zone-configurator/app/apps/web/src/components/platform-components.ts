import {
  areaLocations,
  effectiveInput,
  objectValue,
  textValue,
  type Values,
} from "@lzc/domain";

export type PlatformComponent = {
  key: string;
  name: string;
  type: string;
};

function resourceName(
  value: Values[string] | undefined,
  fallback: string,
): string {
  return value == null ? fallback : textValue(value);
}

export function platformProjectComponents(
  values: Values,
): Record<string, PlatformComponent[]> {
  const company = textValue(values.company_code) || "<Unternehmenskürzel>";
  const management = `${company}-pltfm-mgmt-prod`;
  const managementComponents: PlatformComponent[] = [
    {
      key: "automation",
      name: [...`${management}-automation`.replaceAll("-", "")]
        .slice(0, 20)
        .join(""),
      type: "Service Account",
    },
    {
      key: "secrets",
      name: `${management}-default`,
      type: "STACKIT Secrets Manager",
    },
    ...["default", "tfstate", "audit-logs"].map((key) => ({
      key: `bucket-${key}`,
      name: `${management}-${key}`,
      type: "Object Storage Bucket",
    })),
  ];
  const result: Record<string, PlatformComponent[]> = {
    management: managementComponents,
  };
  if (effectiveInput(values, "observability") != null)
    managementComponents.push({
      key: "observability",
      name: management,
      type: "STACKIT Observability",
    });
  if (effectiveInput(values, "audit_logs") != null)
    managementComponents.push(
      { key: "audit-logs", name: `${management}-audit`, type: "STACKIT Logs" },
      {
        key: "audit-router",
        name: `${management}-audit`,
        type: "Telemetry Router",
      },
    );

  const connectivity = effectiveInput(values, "connectivity") ?? null;
  const regions = effectiveInput(values, "connectivity_regions") ?? null;
  for (const area of areaLocations({
    ...values,
    connectivity,
    connectivity_regions: regions,
  })) {
    const configuration = objectValue(
      regions != null ? objectValue(regions)[area.region] : connectivity,
    );
    const prefix =
      textValue(configuration.naming_pattern) ||
      (regions != null
        ? `${company}-pltfm-connectivity-${area.region}`
        : `${company}-pltfm-hub-prod`);
    const components: PlatformComponent[] = [
      {
        key: "network-area",
        name: resourceName(
          area.settings.name,
          area.key === "default" ? prefix : `${prefix}-${area.key}`,
        ),
        type: "STACKIT Network Area (SNA)",
      },
    ];
    const firewall =
      configuration.firewalls != null
        ? objectValue(configuration.firewalls)[area.key]
        : regions == null
          ? configuration.firewall
          : null;
    if (firewall != null) {
      const settings = objectValue(firewall);
      const name = textValue(settings.name);
      components.push(
        {
          key: "lan",
          name: area.key === "default" ? "lan" : `lan-${area.key}`,
          type: "Netzwerk",
        },
        {
          key: "wan",
          name:
            area.key === "default" ? "wan_network" : `wan_network-${area.key}`,
          type: "Netzwerk",
        },
        { key: "firewall", name, type: "Firewall" },
      );
      if (settings.ha != null)
        components.push({
          key: "firewall-backup",
          name:
            textValue(objectValue(settings.ha).backup_name) || `${name}-backup`,
          type: "Firewall",
        });
    }
    for (const [key, raw] of Object.entries(
      objectValue(configuration.dns_zones),
    )) {
      const zone = objectValue(raw);
      if ((zone.network_area_key ?? "default") === area.key)
        components.push({
          key: `dns-${key}`,
          name: resourceName(zone.name, textValue(zone.dns_name)),
          type: "DNS-Zone",
        });
    }
    if (configuration.vpn != null)
      components.push({
        key: "vpn",
        name: resourceName(
          objectValue(configuration.vpn).display_name,
          `${prefix}-vpn`,
        ),
        type: "VPN-Gateway",
      });
    result[area.path] = components;
  }

  const devops = effectiveInput(values, "devops");
  if (devops != null && objectValue(devops).git_flavor != null)
    result.devops = [
      {
        key: "git",
        name: [...textValue(values.company_name)]
          .slice(0, 31)
          .join("")
          .toLowerCase()
          .replaceAll(" ", "-"),
        type: "Git-Service",
      },
    ];
  for (const [key, raw] of Object.entries(
    objectValue(effectiveInput(values, "platform_kubernetes")),
  )) {
    const settings = objectValue(raw);
    const name = `${company}-pltfm-k8s-${textValue(settings.region)}`;
    const cluster = textValue(objectValue(settings.cluster).name);
    const components: PlatformComponent[] = [
      { key: "cluster", name: cluster, type: "Kubernetes-Cluster" },
    ];
    const network = objectValue(settings.network);
    if (network.sna_enabled === true)
      components.push({
        key: "network",
        name: `${cluster}-sna`,
        type: "Netzwerk",
      });
    const dns = objectValue(settings.dns);
    if (dns.create_zones === true && Array.isArray(dns.zones))
      for (const zone of new Set(
        dns.zones.filter(
          (zone): zone is string => typeof zone === "string" && zone !== "",
        ),
      ))
        components.push({ key: `dns-${zone}`, name: zone, type: "DNS-Zone" });
    const observability = objectValue(settings.observability);
    if (observability.enabled === true)
      components.push({
        key: "observability",
        name: resourceName(observability.name, name),
        type: "STACKIT Observability",
      });
    const encryption = objectValue(settings.encrypted_volumes);
    if (encryption.enabled === true)
      components.push(
        {
          key: "kms-keyring",
          name: `${name}-${textValue(encryption.kms_keyring_name)}`,
          type: "KMS-Schlüsselbund",
        },
        {
          key: "kms-key",
          name: `${name}-${textValue(encryption.kms_key_name)}`,
          type: "KMS-Schlüssel",
        },
      );
    const bastion = objectValue(settings.debug_bastion);
    if (bastion.enabled === true && network.sna_enabled === true)
      components.push({
        key: "bastion",
        name: resourceName(bastion.name, `${name}-dbg`),
        type: "Virtuelle Maschine",
      });
    result[`k8s-${key}`] = components;
  }
  return result;
}
