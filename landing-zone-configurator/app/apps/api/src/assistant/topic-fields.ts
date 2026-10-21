import { featureFieldCatalogue } from "@lzc/domain";

export const assistantTopicFields: Record<
  string,
  { paths: readonly string[]; prefixes: readonly string[] }
> = {
  "credential-foundations": {
    paths: [],
    prefixes: [
      "platform_kubernetes_kube_config_override",
      "vpn_pre_shared_keys",
      "firewall_admin_password",
      "firewall_api_credentials",
    ],
  },
  "stackit-network-components": {
    paths: ["connectivity", "connectivity_regions", "connectivity_regions[*]"],
    prefixes: [
      "connectivity.naming_pattern",
      "connectivity.network_area",
      "connectivity.network_areas",
      "connectivity_regions[*].naming_pattern",
      "connectivity_regions[*].network_areas",
    ],
  },
  "identity-foundations": {
    paths: [],
    prefixes: [
      "organization_id",
      "owner_email",
      "company_name",
      "company_code",
      "region",
      "labels",
      "platform_contract_namespace",
    ],
  },
  "governance-folders": {
    paths: [],
    prefixes: [
      "rm_folder_parent_id",
      "rm_folders",
      "organization_owners",
      "organization_auditors",
    ],
  },
  "management-state": { paths: [], prefixes: ["bucket_naming"] },
  observability: { paths: [], prefixes: ["observability"] },
  "audit-logs": { paths: [], prefixes: ["audit_logs"] },
  "federated-identities": {
    paths: [],
    prefixes: ["federated_identity_providers"],
  },
  "dns-zones": {
    paths: [],
    prefixes: ["connectivity.dns_zones", "connectivity_regions[*].dns_zones"],
  },
  "firewall-infrastructure": {
    paths: [],
    prefixes: [
      "connectivity.firewall",
      "connectivity.firewalls",
      "connectivity_regions[*].firewalls",
    ],
  },
  vpn: {
    paths: [],
    prefixes: ["connectivity.vpn", "connectivity_regions[*].vpn"],
  },
  "firewall-policy": { paths: [], prefixes: ["firewall_config"] },
  "firewall-access-bootstrap": {
    paths: [],
    prefixes: [
      "firewall_admin_username",
      "firewall_bootstrap",
      "firewall_api_secret_version",
    ],
  },
  "devops-git": { paths: [], prefixes: ["devops"] },
  "platform-kubernetes": { paths: [], prefixes: ["platform_kubernetes"] },
  "project-templates": { paths: [], prefixes: ["landing_zones"] },
  "sandbox-projects": { paths: [], prefixes: ["sandboxes"] },
  "namespace-services": {
    paths: [],
    prefixes: ["landing_zone_namespace_services"],
  },
  "configuration-lifecycle": { paths: [], prefixes: [] },
};

export function buildAssistantTopicFieldPaths(topicIds: readonly string[]) {
  if (
    JSON.stringify([...topicIds].sort()) !==
    JSON.stringify(Object.keys(assistantTopicFields).sort())
  )
    throw new Error("assistant_topic_field_assignment_mismatch");
  const assignments = Object.fromEntries(
    topicIds.map((id) => [id, [] as string[]]),
  );
  const fields = featureFieldCatalogue();
  for (const field of fields) {
    const owners = Object.entries(assistantTopicFields).filter(
      ([, selection]) =>
        selection.paths.includes(field.path) ||
        selection.prefixes.some(
          (prefix) =>
            field.path === prefix ||
            field.path.startsWith(`${prefix}.`) ||
            field.path.startsWith(`${prefix}[*]`),
        ),
    );
    if (owners.length !== 1)
      throw new Error(`assistant_field_assignment_invalid:${field.path}`);
    const owner = owners[0];
    if (owner) assignments[owner[0]]?.push(field.path);
  }
  for (const [id, selection] of Object.entries(assistantTopicFields))
    for (const prefix of [...selection.paths, ...selection.prefixes])
      if (!assignments[id]?.some((path) => path === prefix))
        throw new Error(`assistant_field_selector_stale:${id}:${prefix}`);
  return assignments;
}
