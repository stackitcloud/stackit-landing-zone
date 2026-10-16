import type { Values } from "@lzc/domain";
import { expect, it } from "vitest";
import { platformProjectComponents } from "../apps/web/src/components/platform-components.js";

const area = { ranges: ["10.0.0.0/16"], transfer_network: "100.64.0.0/24" };
const firewall = {
  name: "Edge",
  zone: "eu01-1",
  flavor: "g2i.2",
  lan_network_range: "10.0.1.0/24",
  wan_network_range: "192.168.0.0/24",
};

it("projects mandatory management storage separately from optional audit and observability", () => {
  const values: Values = {
    company_code: "acme",
    audit_logs: null,
    observability: null,
  };
  const original = structuredClone(values);
  const components = platformProjectComponents(values).management;
  expect(components).toEqual([
    {
      key: "automation",
      name: "acmepltfmmgmtprodaut",
      type: "Service Account",
    },
    {
      key: "secrets",
      name: "acme-pltfm-mgmt-prod-default",
      type: "STACKIT Secrets Manager",
    },
    ...["default", "tfstate", "audit-logs"].map((key) => ({
      key: `bucket-${key}`,
      name: `acme-pltfm-mgmt-prod-${key}`,
      type: "Object Storage Bucket",
    })),
  ]);
  expect(
    platformProjectComponents({
      ...values,
      audit_logs: { retention_days: 90 },
      observability: {},
    }).management,
  ).toEqual([
    ...(components ?? []),
    {
      key: "observability",
      name: "acme-pltfm-mgmt-prod",
      type: "STACKIT Observability",
    },
    {
      key: "audit-logs",
      name: "acme-pltfm-mgmt-prod-audit",
      type: "STACKIT Logs",
    },
    {
      key: "audit-router",
      name: "acme-pltfm-mgmt-prod-audit",
      type: "Telemetry Router",
    },
  ]);
  expect(values).toEqual(original);
});

it.each(["single", "regional"])(
  "assigns network, DNS, firewall and VPN components to the exact area in %s mode",
  (mode) => {
    const configuration = {
      naming_pattern: "Central",
      network_areas: {
        default: { ...area, name: "Corporate" },
        isolated: area,
      },
      firewalls: {
        default: {
          ...firewall,
          ha: { backup_zone: "eu01-2", backup_name: "Edge standby" },
        },
      },
      dns_zones: {
        internal: { dns_name: "corp.example", name: "Corporate DNS" },
        isolated: {
          dns_name: "isolated.example",
          network_area_key: "isolated",
        },
      },
      vpn: { display_name: "Office VPN", plan_id: "synthetic-plan" },
    };
    const values: Values = {
      company_code: "acme",
      region: "eu01",
      ...(mode === "regional"
        ? {
            connectivity_regions: {
              eu01: configuration,
              eu02: { network_areas: { default: area } },
            },
            connectivity: {
              network_area: area,
              firewall: { ...firewall, name: "Ignored legacy edge" },
            },
          }
        : { connectivity: configuration }),
    };
    const original = structuredClone(values);
    const components = platformProjectComponents(values);
    const base =
      mode === "regional" ? "connectivity_regions.eu01" : "connectivity";
    expect(components[`${base}.network_areas.default`]).toEqual([
      {
        key: "network-area",
        name: "Corporate",
        type: "STACKIT Network Area (SNA)",
      },
      { key: "lan", name: "lan", type: "Netzwerk" },
      { key: "wan", name: "wan_network", type: "Netzwerk" },
      { key: "firewall", name: "Edge", type: "Firewall" },
      { key: "firewall-backup", name: "Edge standby", type: "Firewall" },
      { key: "dns-internal", name: "Corporate DNS", type: "DNS-Zone" },
      { key: "vpn", name: "Office VPN", type: "VPN-Gateway" },
    ]);
    expect(components[`${base}.network_areas.isolated`]).toEqual([
      {
        key: "network-area",
        name: "Central-isolated",
        type: "STACKIT Network Area (SNA)",
      },
      { key: "dns-isolated", name: "isolated.example", type: "DNS-Zone" },
      { key: "vpn", name: "Office VPN", type: "VPN-Gateway" },
    ]);
    if (mode === "regional")
      expect(
        components["connectivity_regions.eu02.network_areas.default"],
      ).toEqual([
        {
          key: "network-area",
          name: "acme-pltfm-connectivity-eu02",
          type: "STACKIT Network Area (SNA)",
        },
      ]);
    expect(values).toEqual(original);
  },
);

it("retains legacy single-area names, HA defaults and explicit empty firewall replacement", () => {
  const values: Values = {
    company_code: "acme",
    connectivity: {
      network_area: area,
      firewall: { ...firewall, ha: { backup_zone: "eu01-2", backup_name: "" } },
      vpn: { plan_id: "synthetic-plan" },
    },
  };
  expect(
    platformProjectComponents(values)["connectivity.network_area"],
  ).toEqual([
    {
      key: "network-area",
      name: "acme-pltfm-hub-prod",
      type: "STACKIT Network Area (SNA)",
    },
    { key: "lan", name: "lan", type: "Netzwerk" },
    { key: "wan", name: "wan_network", type: "Netzwerk" },
    { key: "firewall", name: "Edge", type: "Firewall" },
    { key: "firewall-backup", name: "Edge-backup", type: "Firewall" },
    { key: "vpn", name: "acme-pltfm-hub-prod-vpn", type: "VPN-Gateway" },
  ]);
  expect(
    platformProjectComponents({
      ...values,
      connectivity: { network_area: area, firewall, firewalls: {} },
    })["connectivity.network_area"],
  ).toEqual([
    {
      key: "network-area",
      name: "acme-pltfm-hub-prod",
      type: "STACKIT Network Area (SNA)",
    },
  ]);
});

it("uses native Kubernetes defaults and shows only enabled services, not existing DNS references", () => {
  const settings = {
    region: "eu01",
    cluster: { name: "platform" },
    dns: { enabled: false, zones: ["example.org", "example.org", ""] },
    encrypted_volumes: { enabled: true },
    debug_bastion: { enabled: true },
  };
  const values: Values = {
    company_code: "acme",
    platform_kubernetes: { primary: settings },
  };
  const components = platformProjectComponents(values);
  expect(components["k8s-primary"]).toEqual([
    { key: "cluster", name: "platform", type: "Kubernetes-Cluster" },
    { key: "dns-example.org", name: "example.org", type: "DNS-Zone" },
    {
      key: "observability",
      name: "acme-pltfm-k8s-eu01",
      type: "STACKIT Observability",
    },
    {
      key: "kms-keyring",
      name: "acme-pltfm-k8s-eu01-ske-volume-keyring",
      type: "KMS-Schlüsselbund",
    },
    {
      key: "kms-key",
      name: "acme-pltfm-k8s-eu01-ske-volume-key",
      type: "KMS-Schlüssel",
    },
  ]);
  expect(
    platformProjectComponents({
      ...values,
      platform_kubernetes: {
        primary: {
          ...settings,
          network: { sna_enabled: true },
          observability: { enabled: false },
          dns: { zones: ["existing.example"], create_zones: false },
          encrypted_volumes: { enabled: false },
          debug_bastion: { enabled: true, name: "Diagnostics" },
        },
      },
    })["k8s-primary"],
  ).toEqual([
    { key: "cluster", name: "platform", type: "Kubernetes-Cluster" },
    { key: "network", name: "platform-sna", type: "Netzwerk" },
    { key: "bastion", name: "Diagnostics", type: "Virtuelle Maschine" },
  ]);
});

it("does not invent a Git instance for an empty DevOps project", () => {
  expect(platformProjectComponents({ devops: {} }).devops).toBeUndefined();
  expect(
    platformProjectComponents({
      company_name: "Example Company",
      devops: { git_flavor: "synthetic-flavor" },
    }).devops,
  ).toEqual([{ key: "git", name: "example-company", type: "Git-Service" }]);
});
