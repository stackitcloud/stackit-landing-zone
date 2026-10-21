import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createEditorConfiguration,
  editCommonInput,
  initialPlanIssues,
  type JsonValue,
  recordValues,
  serializeTfvars,
  supportedAcceleratorRevision,
} from "../packages/domain/dist/index.js";

if (!process.argv[2]?.startsWith("/"))
  throw new Error("Absolute qualification directory required");
const target = resolve(process.argv[2]);
const source = execFileSync(
  "git",
  ["show", `${supportedAcceleratorRevision}:src/tests/standalone.tftest.hcl`],
  { encoding: "utf8" },
);
const mocks = source.slice(0, source.indexOf("variables {")).replace(
  'mock_provider "stackit" {',
  `mock_provider "stackit" {
  mock_resource "stackit_vpn_gateway" {
    defaults = {
      gateway_id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    }
  }

  mock_resource "stackit_image" {
    defaults = {
      image_id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
    }
  }

  mock_resource "stackit_volume" {
    defaults = {
      volume_id = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
    }
  }

  mock_resource "stackit_server" {
    defaults = {
      server_id = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
    }
  }

  mock_resource "stackit_public_ip" {
    defaults = {
      ip = "192.0.2.20"
    }
  }

  mock_resource "stackit_logs_instance" {
    defaults = {
      instance_id = "99999999-9999-4999-8999-999999999999"
      ingest_otlp_url = "logs.stackit.test/otlp"
    }
  }

  mock_resource "stackit_telemetryrouter_instance" {
    defaults = {
      instance_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    }
  }
`,
);
let base = createEditorConfiguration(
  "standalone",
  "11111111-2222-4333-8444-555555555555",
);
base = editCommonInput(
  base,
  "organization_id",
  "11111111-1111-4111-8111-111111111111",
);
base = editCommonInput(base, "owner_email", "owner@stackit.cloud");
const connectivity = {
  network_areas: {
    default: { ranges: ["10.0.0.0/16"], transfer_network: "10.255.0.0/24" },
    isolated: { ranges: ["10.1.0.0/16"], transfer_network: "10.254.0.0/24" },
  },
  dns_zones: {
    internal: {
      dns_name: "internal.stackit.run",
      network_area_key: "isolated",
    },
  },
};
const capabilities = {
  audit_logs: { s3_object_lock: false },
  observability: {},
  connectivity,
  devops: { git_flavor: "git-10", allowed_network_ranges: ["192.0.2.0/24"] },
};
const firewall = {
  zone: "eu01-1",
  flavor: "c1.2",
  name: "qualification-firewall",
  lan_network_range: "10.0.0.0/24",
  wan_network_range: "10.0.1.0/24",
};
const configurations: [string, Record<string, JsonValue>][] = [
  ["governance_only", {}],
  ...Object.entries(capabilities).map(
    ([key, value]): [string, Record<string, JsonValue>] => [
      key,
      { [key]: value },
    ],
  ),
  [
    "combined",
    {
      ...capabilities,
      observability: { logs_retention_days: 14, acl: ["192.0.2.0/24"] },
      bucket_naming: "project-id",
      audit_logs: {
        s3_object_lock: false,
        link_scopes: [
          {
            resource_type: "organization",
            resource_id: "11111111-1111-4111-8111-111111111111",
          },
        ],
      },
    },
  ],
  ["audit_defaults", { audit_logs: {} }],
  [
    "legacy_network_area",
    {
      connectivity: {
        network_area: {
          ranges: ["10.0.0.0/16"],
          transfer_network: "10.255.0.0/24",
        },
        dns_zones: { internal: { dns_name: "internal.stackit.run" } },
      },
    },
  ],
  [
    "vpn_gateway",
    {
      connectivity: {
        network_area: {
          ranges: ["10.0.0.0/16"],
          transfer_network: "10.255.0.0/24",
        },
        vpn: { availability_zones: { tunnel1: "eu01-1", tunnel2: "eu01-2" } },
      },
    },
  ],
  ...[false, true].map((ha): [string, Record<string, JsonValue>] => [
    `firewall_${ha ? "ha" : "single"}`,
    {
      connectivity: {
        network_area: {
          ranges: ["10.0.0.0/16"],
          transfer_network: "10.255.0.0/24",
        },
        firewall: {
          ...firewall,
          ...(ha ? { ha: { backup_zone: "eu01-2" } } : {}),
        },
      },
    },
  ]),
  [
    "firewalls_ha_by_area",
    {
      connectivity: {
        network_areas: connectivity.network_areas,
        firewalls: {
          default: { ...firewall, ha: { backup_zone: "eu01-2" } },
          isolated: {
            ...firewall,
            name: "isolated-firewall",
            lan_network_range: "10.1.0.0/24",
            wan_network_range: "10.1.1.0/24",
          },
        },
      },
    },
  ],
];
const runs = configurations.map(([name, patch]) => {
  let document = structuredClone(base);
  for (const [key, value] of Object.entries(patch))
    document = editCommonInput(document, key, value);
  const issues = initialPlanIssues(document);
  if (issues.length) throw new Error(JSON.stringify({ name, issues }));
  return `run "${name}" {
  command = plan

  variables {
${serializeTfvars(recordValues(document))}
  }
}`;
});
mkdirSync(resolve(target, "tests"), { recursive: true });
writeFileSync(
  resolve(target, "tests/initial_plan.tftest.hcl"),
  `${mocks}
mock_provider "vault" {}
mock_provider "time" {}
mock_provider "random" {}
mock_provider "helm" {}
mock_provider "kubernetes" {
  alias = "platform"
}
mock_provider "helm" {
  alias = "platform"
}
mock_provider "grafana" {}
mock_provider "opnsense" {}

${runs.join("\n\n")}
`,
);
const blockedRuns = [false, true].map((ha) => {
  let document = editCommonInput(base, "connectivity", {
    network_area: {
      ranges: ["10.0.0.0/16"],
      transfer_network: "10.255.0.0/24",
    },
    firewall: { ...firewall, ...(ha ? { ha: { backup_zone: "eu01-2" } } : {}) },
  });
  document = editCommonInput(document, "firewall_bootstrap", true);
  document = editCommonInput(document, "firewall_config", {
    aliases: { qualification: { type: "host", content: ["192.0.2.1"] } },
  });
  if (
    !initialPlanIssues(document).some(
      (issue) => issue.field === "firewall_config",
    )
  )
    throw new Error("Policy/bootstrap evidence must not enable execution");
  return `run "blocked_firewall_${ha ? "ha" : "single"}" {
  command = plan

  variables {
${serializeTfvars(recordValues(document))}
  }
}`;
});
const mockDeclarations = `${mocks}
mock_provider "vault" {}
mock_provider "time" {}
mock_provider "random" {}
mock_provider "helm" {}
mock_provider "kubernetes" { alias = "platform" }
mock_provider "helm" { alias = "platform" }
mock_provider "grafana" {}
mock_provider "opnsense" {}
`;
writeFileSync(
  resolve(target, "tests/blocked_connectivity.tftest.hcl"),
  `${mockDeclarations}
${blockedRuns.join("\n\n")}
`,
);
writeFileSync(
  resolve(target, "tests/vpn_boundaries.tftest.hcl"),
  `${mocks}
mock_provider "time" {}
mock_provider "random" {}
run "vpn_missing_psks" {
  command = plan

  module {
    source = "./modules/connectivity"
  }

  variables {
    owner_email = "owner@stackit.cloud"
    organization_id = "11111111-1111-4111-8111-111111111111"
    parent_container_id = "11111111-1111-4111-8111-111111111111"
    naming_pattern = "qualification-vpn"
    network_areas = {
      default = { ranges = ["10.0.0.0/16"], transfer_network = "10.255.0.0/24" }
    }
    vpn = {
      availability_zones = { tunnel1 = "eu01-1", tunnel2 = "eu01-2" }
      connections = {
        office = {
          static_routes = ["192.0.2.0/24"]
          tunnel1 = { remote_address = "192.0.2.1" }
          tunnel2 = { remote_address = "198.51.100.1" }
        }
      }
    }
  }

  expect_failures = [var.vpn_pre_shared_keys]
}
`,
);
