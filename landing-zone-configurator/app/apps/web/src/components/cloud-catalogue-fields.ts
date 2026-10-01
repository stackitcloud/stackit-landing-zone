type Part = {
  status: "available" | "unavailable";
  options: { value: string; label: string }[];
};
export type CloudCatalogue = {
  region: string;
  projectId: string;
  fetchedAt: string;
  gitFlavors: Part;
  vpnPlans: Part;
  kubernetesVersions: Part;
  machineTypes: Part;
  availabilityZones: Part;
  volumeTypes: Part;
  observabilityPlans?: Part;
  bastionMachineTypes?: Part;
  bastionImages?: Part;
  bastionAvailabilityZones?: Part;
};

export function catalogueField(
  path: string,
):
  | keyof Pick<
      CloudCatalogue,
      | "gitFlavors"
      | "vpnPlans"
      | "kubernetesVersions"
      | "machineTypes"
      | "availabilityZones"
      | "volumeTypes"
      | "observabilityPlans"
      | "bastionMachineTypes"
      | "bastionImages"
      | "bastionAvailabilityZones"
    >
  | null {
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
  if (path.endsWith(".git_flavor")) return "gitFlavors";
  if (path.includes(".vpn.") && path.endsWith(".plan_id")) return "vpnPlans";
  if (path.startsWith("platform_kubernetes") && path.includes(".cluster.")) {
    if (path.endsWith(".kubernetes_version_min")) return "kubernetesVersions";
    if (path.endsWith(".machine_type")) return "machineTypes";
    if (path.endsWith(".availability_zones[*]")) return "availabilityZones";
    if (path.endsWith(".volume_type")) return "volumeTypes";
  }
  return null;
}
