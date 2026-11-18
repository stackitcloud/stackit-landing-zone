export const cloudCatalogueFields = [
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
  "projectRoles",
  "projectPermissions",
] as const;
export type CloudCatalogueField = (typeof cloudCatalogueFields)[number];

export function catalogueField(path: string): CloudCatalogueField | null {
  if (path.endsWith("custom_roles[*].permissions[*]"))
    return "projectPermissions";
  if (path.endsWith("role_assignments[*].role")) return "projectRoles";
  if (
    /^connectivity(?:_regions\[\*\])?\.(?:firewall|firewalls\[\*\])\./.test(
      path,
    )
  ) {
    if (path.endsWith(".flavor")) return "bastionMachineTypes";
    if (path.endsWith(".zone") || path.endsWith(".ha.backup_zone"))
      return "bastionAvailabilityZones";
  }
  if (
    path === "observability.plan_name" ||
    path.endsWith(".observability.plan_name")
  )
    return "observabilityPlans";
  if (
    path.startsWith("platform_kubernetes") &&
    path.includes(".debug_bastion.")
  ) {
    if (path.endsWith(".machine_type")) return "bastionMachineTypes";
    if (path.endsWith(".image_id")) return "bastionImages";
    if (path.endsWith(".availability_zone")) return "bastionAvailabilityZones";
  }
  if (path === "git.flavor" || path.endsWith(".git.flavor"))
    return "gitFlavors";
  if (path.endsWith(".git_flavor")) return "gitFlavors";
  if (path.includes(".vpn.") && path.endsWith(".plan_id")) return "vpnPlans";
  if (
    (path.startsWith("platform_kubernetes") && path.includes(".cluster.")) ||
    path.includes(".ske.cluster.")
  ) {
    if (path.endsWith(".kubernetes_version_min")) return "kubernetesVersions";
    if (path.endsWith(".machine_type")) return "machineTypes";
    if (path.endsWith(".node_pools[*].os_name")) return "machineImages";
    if (path.endsWith(".availability_zones[*]")) return "availabilityZones";
    if (path.endsWith(".volume_type")) return "volumeTypes";
  }
  return null;
}

export function catalogueChoiceMatches(
  choice: string,
  option: { value: string; label: string },
) {
  return [option.value, option.label].some((value) => {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      `(?:^|[^\\p{L}\\p{N}_])${escaped}(?:$|[^\\p{L}\\p{N}_])`,
      "iu",
    ).test(choice);
  });
}
