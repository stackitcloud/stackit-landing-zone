import type { ObservabilityPlanOption } from "@lzc/domain";

type Part = {
  status: "available" | "unavailable";
  options: ObservabilityPlanOption[];
};
export type CloudCatalogue = {
  region: string;
  projectId: string | null;
  fetchedAt: string;
  gitFlavors: Part;
  vpnPlans: Part;
  kubernetesVersions: Part;
  machineTypes: Part;
  machineImages?: Part;
  availabilityZones: Part;
  volumeTypes: Part;
  observabilityPlans?: Part;
  bastionMachineTypes?: Part;
  bastionImages?: Part;
  bastionAvailabilityZones?: Part;
  projectRoles?: Part;
  projectPermissions?: Part;
  projectRoleTemplates?: {
    name: string;
    description: string;
    permissions: string[];
  }[];
};

export { catalogueField } from "@lzc/contracts";
