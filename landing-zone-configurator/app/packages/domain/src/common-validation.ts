import {
  type CommonConfiguration,
  commonNetworkAreas,
  commonProjects,
  compileCommonConfiguration,
} from "./common-document.js";
import { objectValue, textValue, type Values } from "./configuration.js";
import { acceleratorInputs, effectiveInput } from "./features.js";

export type ConfigurationFinding = {
  path: string;
  code: string;
  scope: "configuration" | "execution";
  severity: "error" | "warning";
  message: string;
  issue?: number;
};
export type ConfigurationAssessment = {
  findings: ConfigurationFinding[];
  requiredPhases: (
    | "cloud-infrastructure"
    | "kubernetes-api"
    | "firewall-api"
  )[];
};
// This is shared semantic validation, not an OpenTofu/provider replacement.
// A clean report is not deployment authorization or a reachability proof.
export function assessCommonConfiguration(
  document: CommonConfiguration,
): ConfigurationAssessment {
  const values = compileCommonConfiguration(document);
  const areas = commonNetworkAreas(document);
  const findings: ConfigurationFinding[] = [];
  const add = (
    path: string,
    code: string,
    message: string,
    issue?: number,
    scope: ConfigurationFinding["scope"] = "configuration",
    severity: ConfigurationFinding["severity"] = "error",
  ) => {
    findings.push({
      path,
      code,
      message,
      scope,
      severity,
      ...(issue ? { issue } : {}),
    });
  };
  for (const input of acceleratorInputs) {
    if (values[input.name] === null && input.default !== null)
      add(
        input.name,
        "null-not-supported",
        "Diese Einstellung benötigt einen Wert. Verwende die Voreinstellung oder eine leere Sammlung statt null.",
      );
    if (
      input.required &&
      (values[input.name] == null || values[input.name] === "")
    )
      add(input.name, "required", "Diese Angabe ist erforderlich.");
  }
  const region = textValue(values.region) || "eu01";
  if (!["eu01", "eu02"].includes(region))
    add(
      "region",
      "unsupported-region",
      "Unterstützte Regionen sind eu01 und eu02.",
    );
  const regional = values.connectivity_regions != null;
  if (regional && values.connectivity != null)
    add(
      "connectivity",
      "ambiguous-connectivity",
      "Entweder ein gemeinsames oder ein regionales Netzwerkmodell verwenden.",
    );
  for (const key of Object.keys(objectValue(values.connectivity_regions)))
    if (!["eu01", "eu02"].includes(key))
      add(
        `connectivity_regions.${key}`,
        "unsupported-region",
        "Für diese Region gibt es keine Accelerator-Instanz.",
      );
  const configurations: [string, Values][] = regional
    ? Object.entries(objectValue(values.connectivity_regions)).map(
        ([key, raw]) => [`connectivity_regions.${key}`, objectValue(raw)],
      )
    : [["connectivity", objectValue(values.connectivity)]];
  for (const [path, network] of configurations) {
    if (network.network_area != null && network.network_areas != null)
      add(
        path,
        "ambiguous-areas",
        "Einzelbereich und Bereichsliste dürfen nicht gleichzeitig aktiv sein.",
      );
    if (network.firewall != null && network.firewalls != null)
      add(
        path,
        "ambiguous-firewalls",
        "Einzelne Firewall und Appliance-Liste dürfen nicht gleichzeitig aktiv sein.",
      );
    const keys =
      network.network_areas != null
        ? Object.keys(objectValue(network.network_areas))
        : network.network_area != null
          ? ["default"]
          : [];
    if (network.firewalls != null) {
      const firewallKeys = Object.keys(objectValue(network.firewalls));
      if (
        keys.length !== firewallKeys.length ||
        keys.some((key) => !firewallKeys.includes(key))
      )
        add(
          `${path}.firewalls`,
          "firewall-area-keys",
          "Appliances und Netzwerkbereiche müssen dieselben Kennungen verwenden.",
        );
    }
    if (network.vpn != null) {
      const vpn = objectValue(network.vpn);
      const routing = textValue(vpn.routing_type) || "ROUTE_BASED";
      if (!keys.length)
        add(
          `${path}.vpn`,
          "vpn-needs-sna",
          "STACKIT VPN benötigt mindestens eine SNA in dieser Connectivity-Konfiguration.",
        );
      if (!["ROUTE_BASED", "POLICY_BASED"].includes(routing))
        add(
          `${path}.vpn.routing_type`,
          "vpn-routing",
          "Der Accelerator unterstützt nur Route-based oder Policy-based VPN.",
        );
      for (const tunnel of ["tunnel1", "tunnel2"])
        if (!textValue(objectValue(vpn.availability_zones)[tunnel]).trim())
          add(
            `${path}.vpn.availability_zones.${tunnel}`,
            "vpn-availability-zone",
            "Für beide VPN-Tunnel muss eine Verfügbarkeitszone angegeben werden.",
          );
      for (const [connectionKey, raw] of Object.entries(
        objectValue(vpn.connections),
      )) {
        const connection = objectValue(raw);
        for (const tunnel of ["tunnel1", "tunnel2"])
          if (!textValue(objectValue(connection[tunnel]).remote_address).trim())
            add(
              `${path}.vpn.connections.${connectionKey}.${tunnel}.remote_address`,
              "vpn-peer-address",
              "Für beide VPN-Tunnel muss die Gegenstellenadresse angegeben werden.",
            );
        for (const field of routing === "POLICY_BASED"
          ? ["local_subnets", "remote_subnets"]
          : ["static_routes"]) {
          const entries = connection[field];
          if (
            !Array.isArray(entries) ||
            !entries.length ||
            entries.some((entry) => !textValue(entry).trim())
          )
            add(
              `${path}.vpn.connections.${connectionKey}.${field}`,
              "vpn-routing-input",
              "Die VPN-Verbindung benötigt die zum Routingverfahren passenden Netze bzw. statischen Routen.",
            );
        }
      }
    }
    for (const [key, raw] of Object.entries(objectValue(network.dns_zones))) {
      if (
        !keys.includes(
          textValue(objectValue(raw).network_area_key) || "default",
        )
      )
        add(
          `${path}.dns_zones.${key}`,
          "dns-area-reference",
          "Die DNS-Zone benötigt einen vorhandenen Netzwerkbereich.",
        );
    }
  }
  for (const area of areas) {
    const min = Number(area.settings.min_prefix_length ?? 24);
    const max = Number(area.settings.max_prefix_length ?? 28);
    const selected = Number(area.settings.default_prefix_length ?? 28);
    if (
      ![min, max, selected].every(
        (value) => Number.isInteger(value) && value >= 0 && value <= 32,
      ) ||
      min > max ||
      selected < min ||
      selected > max
    )
      add(
        area.path,
        "network-prefix-order",
        "Die Standard-Präfixlänge muss innerhalb der zulässigen IPv4-Präfixlängen liegen.",
      );
  }
  for (const project of commonProjects(document)) {
    if (project.kind === "sandbox") continue;
    const path = `landing_zones.${project.key}`;
    if (
      regional &&
      (project.settings.region == null ||
        objectValue(values.connectivity_regions)[project.region] == null)
    )
      add(
        `${path}.region`,
        "project-region-reference",
        "Im regionalen Modell benötigt jedes Projekt eine konfigurierte Region.",
      );
    if (project.kind === "corporate" && project.areaId === null)
      add(
        `${path}.network_area_key`,
        "project-area-reference",
        "Corporate-Projekte benötigen einen vorhandenen Netzwerkbereich in ihrer Region.",
      );
  }
  const folders = objectValue(effectiveInput(values, "rm_folders"));
  const requiredFolders = new Set<string>([
    "platform",
    ...commonProjects(document).map((project) => project.folder),
  ]);
  for (const role of requiredFolders)
    if (!Object.hasOwn(folders, role))
      add(
        `rm_folders.${role}`,
        "missing-folder-role",
        "Der Zielordner für diese Projekte fehlt.",
      );
  for (const [key, raw] of Object.entries(folders)) {
    const folder = objectValue(raw);
    const name = textValue(folder.name);
    if (Array.from(name).length < 1 || Array.from(name).length > 40)
      add(
        `rm_folders.${key}.name`,
        "folder-name-length",
        "Ordnernamen müssen 1–40 Zeichen lang sein.",
      );
    if (folder.description != null && folder.description !== "")
      add(
        `rm_folders.${key}.description`,
        "ignored-folder-description",
        "Der Accelerator reicht Ordnerbeschreibungen derzeit nicht zur Ressource durch.",
        82,
        "configuration",
        "warning",
      );
  }
  if (
    values.audit_logs != null &&
    objectValue(values.audit_logs).s3_object_lock == null
  )
    add(
      "audit_logs.s3_object_lock",
      "object-lock-default",
      "Object Lock ist durch den wirksamen Accelerator-Default eingeschaltet. Bitte die gewünschte Einstellung ausdrücklich prüfen.",
      81,
      "configuration",
      "warning",
    );
  const clusters = objectValue(effectiveInput(values, "platform_kubernetes"));
  const phases: ConfigurationAssessment["requiredPhases"] = [
    "cloud-infrastructure",
  ];
  for (const [key, raw] of Object.entries(clusters)) {
    const cluster = objectValue(raw);
    const network = objectValue(cluster.network);
    if (!["eu01", "eu02"].includes(textValue(cluster.region)))
      add(
        `platform_kubernetes.${key}.region`,
        "unsupported-region",
        "Der Cluster benötigt eine unterstützte Region.",
      );
    if (network.sna_enabled === true) {
      add(
        `platform_kubernetes.${key}.network`,
        "private-kubernetes-unreachable",
        "Der aktuelle CF-Runner hat keinen nachgewiesenen Zugriff auf die private Kubernetes-API. Der vollständige Lauf ist bis zur privaten Runner-Anbindung gesperrt.",
        37,
        "execution",
      );
      if (
        network.sna_network_area_id == null &&
        !areas.some(
          (area) =>
            area.region === cluster.region &&
            area.key === (textValue(network.network_area_key) || "default"),
        )
      )
        add(
          `platform_kubernetes.${key}.network`,
          "cluster-area-reference",
          "Der private Cluster benötigt einen passenden Bereich oder eine vorhandene Bereichs-ID.",
        );
    }
  }
  const namespaces = objectValue(
    effectiveInput(values, "landing_zone_namespace_services"),
  );
  if (Object.keys(namespaces).length) {
    phases.push("kubernetes-api");
    if (regional)
      add(
        "landing_zone_namespace_services",
        "regional-namespace-wiring",
        "Namespace-Dienste sind noch nicht mit regionalen Cluster- und Projektinstanzen verdrahtet.",
        80,
        "execution",
      );
    if (Object.keys(clusters).length !== 1)
      add(
        "landing_zone_namespace_services",
        "namespace-cluster-count",
        "Namespace-Dienste benötigen genau einen passenden Plattform-Cluster.",
      );
    const names = new Set<string>();
    for (const [key, raw] of Object.entries(namespaces)) {
      const service = objectValue(raw);
      const project = objectValue(objectValue(values.landing_zones)[key]);
      if (!Object.hasOwn(objectValue(values.landing_zones), key))
        add(
          `landing_zone_namespace_services.${key}`,
          "namespace-project-reference",
          "Der Namespace benötigt ein vorhandenes Landing-Zone-Projekt.",
        );
      const name =
        service.namespace == null
          ? `${textValue(project.project_code)}-${textValue(project.env) || "dev"}`
              .replace(/[^a-zA-Z0-9-]/g, "-")
              .toLowerCase()
              .replace(/-{2,}/g, "-")
              .replace(/^-+|-+$/g, "")
          : textValue(service.namespace);
      if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(name) || name.length > 63)
        add(
          `landing_zone_namespace_services.${key}.namespace`,
          "namespace-name",
          "Der Namespace benötigt einen gültigen Kubernetes-Namen mit höchstens 63 Zeichen.",
        );
      if (names.has(name))
        add(
          `landing_zone_namespace_services.${key}.namespace`,
          "duplicate-namespace",
          "Dieser Namespace-Name wird bereits verwendet.",
        );
      names.add(name);
    }
  }
  const singleFirewall = objectValue(values.connectivity).firewall;
  const haConfigured = configurations.some(([, network]) =>
    [network.firewall, ...Object.values(objectValue(network.firewalls))].some(
      (raw) => objectValue(raw).ha != null,
    ),
  );
  if (
    values.firewall_config != null ||
    haConfigured ||
    (!regional &&
      singleFirewall != null &&
      effectiveInput(values, "firewall_bootstrap") === true)
  )
    phases.push("firewall-api");
  if (values.firewall_config != null) {
    if (regional || singleFirewall == null)
      add(
        "firewall_config",
        "firewall-policy-wiring",
        "Firewall-Policies benötigen derzeit die einzelne nichtregionale Appliance. Policies für mehrere Appliances sind noch offen.",
        65,
        "execution",
      );
  }
  return { findings, requiredPhases: phases };
}
