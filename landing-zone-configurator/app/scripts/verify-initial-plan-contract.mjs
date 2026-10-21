import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const events = readFileSync(process.argv[2], "utf8")
  .trim()
  .split("\n")
  .map(JSON.parse);
const plans = events.filter(
  (event) =>
    event.type === "test_plan" &&
    !event["@testrun"].startsWith("blocked_") &&
    event["@testrun"] !== "vpn_missing_psks",
);
assert.equal(
  plans.length,
  12,
  "Every capability and governance baseline must produce a real native plan",
);
for (const event of plans) {
  const name = event["@testrun"];
  const firewall =
    name.startsWith("firewall_") || name === "firewalls_ha_by_area";
  const ha = name === "firewall_ha" || name === "firewalls_ha_by_area";
  const changes = event.test_plan.resource_changes.filter(
    (change) => change.mode === "managed",
  );
  const resources = (type) => changes.filter((change) => change.type === type);
  const enabled = (capability) => name === capability || name === "combined";
  assert.equal(
    resources("stackit_git").length,
    enabled("devops") ? 1 : 0,
    name,
  );
  assert.equal(
    resources("stackit_observability_instance").length,
    enabled("observability") ? 1 : 0,
    name,
  );
  assert.equal(
    resources("stackit_observability_credential").length,
    enabled("observability") ? 1 : 0,
    name,
  );
  const audit = enabled("audit_logs") || name === "audit_defaults";
  for (const type of [
    "stackit_logs_instance",
    "stackit_telemetryrouter_instance",
    "stackit_telemetrylink",
  ])
    assert.equal(resources(type).length, audit ? 1 : 0, `${name}: ${type}`);
  assert.equal(
    resources("stackit_telemetryrouter_destination").length,
    audit ? 2 : 0,
    name,
  );
  assert.equal(
    resources("stackit_logs_access_token").length,
    audit ? 2 : 0,
    name,
  );
  assert.equal(
    resources("stackit_telemetryrouter_access_token").length,
    audit ? 1 : 0,
    name,
  );
  for (const [secret, present] of [
    ["observability", enabled("observability")],
    ["audit_logs", audit],
  ]) {
    const stored = resources("vault_kv_secret_v2").filter(
      (change) => change.name === secret,
    );
    assert.equal(stored.length, present ? 1 : 0, `${name}: ${secret} storage`);
    if (present)
      assert.equal(
        stored[0].change.after_sensitive.data_json,
        true,
        `${name}: ${secret} sensitivity`,
      );
  }
  if (audit) {
    const link = resources("stackit_telemetrylink")[0].change.after;
    assert.equal(link.resource_type, "organization", name);
    assert.equal(
      link.resource_id,
      "11111111-1111-4111-8111-111111111111",
      name,
    );
  }
  assert.equal(
    resources("stackit_objectstorage_default_retention").length,
    name === "audit_defaults" ? 1 : 0,
    name,
  );
  const network = firewall
    ? name === "firewalls_ha_by_area"
      ? 2
      : 1
    : name === "legacy_network_area" || name === "vpn_gateway"
      ? 1
      : enabled("connectivity")
        ? 2
        : 0;
  assert.equal(resources("stackit_network_area").length, network, name);
  assert.equal(
    resources("stackit_dns_zone").length,
    network && name !== "vpn_gateway" && !firewall ? 1 : 0,
    name,
  );
  assert.equal(
    resources("stackit_server").length,
    firewall ? (name === "firewalls_ha_by_area" ? 3 : ha ? 2 : 1) : 0,
    name,
  );
  const images = resources("stackit_image");
  assert.equal(images.length, firewall ? network : 0, name);
  for (const image of images) {
    assert.notEqual(image.change.after.local_file_path, "/dev/null", name);
    assert(
      image.change.after.local_file_path.endsWith("/firewall-image.qcow2"),
      name,
    );
  }
  assert.equal(resources("random_password").length, ha ? 1 : 0, name);
  assert.equal(
    changes.filter((change) =>
      change.address.includes("terraform_data.firewall_ha_"),
    ).length,
    ha ? 2 : 0,
    name,
  );
  assert.equal(
    resources("stackit_vpn_gateway").length,
    name === "vpn_gateway" ? 1 : 0,
    name,
  );
  assert.equal(resources("stackit_vpn_connection").length, 0, name);
  if (enabled("observability")) {
    const instance = resources("stackit_observability_instance")[0].change
      .after;
    // Mock providers synthesize computed retention values. Assert the native
    // input contract instead of mistaking a mock zero for a service default.
    assert.equal(
      event.test_plan.variables.observability.value.logs_retention_days ?? null,
      name === "combined" ? 14 : null,
      name,
    );
    if (name === "combined")
      assert.equal(instance.logs_retention_days, 14, name);
    assert.deepEqual(
      instance.acl,
      name === "combined" ? ["192.0.2.0/24"] : [],
      name,
    );
  }
  const blocked = events.filter(
    (event) =>
      event.type === "test_plan" &&
      event["@testrun"].startsWith("blocked_firewall_"),
  );
  assert.equal(blocked.length, 2);
  for (const event of blocked) {
    const name = event["@testrun"];
    const ha = name.endsWith("_ha");
    const changes = event.test_plan.resource_changes.filter(
      (change) => change.mode === "managed",
    );
    const resources = (type) =>
      changes.filter((change) => change.type === type);
    assert(
      resources("stackit_image")[0].change.after.local_file_path.endsWith(
        "/firewall-image.qcow2",
      ),
      name,
    );
    assert.equal(resources("stackit_server").length, ha ? 2 : 1, name);
    assert.equal(resources("random_password").length, ha ? 1 : 0, name);
    assert.equal(
      changes.filter((change) =>
        change.address.includes("terraform_data.firewall_ha_"),
      ).length,
      ha ? 2 : 0,
      name,
    );
    assert.equal(
      changes.filter(
        (change) =>
          change.address === "terraform_data.firewall_api_bootstrap[0]",
      ).length,
      1,
      name,
    );
    assert.equal(
      changes.filter((change) =>
        change.address.startsWith("module.firewall_config"),
      ).length,
      0,
      name,
    );
  }
  assert.equal(
    events.find(
      (event) =>
        event.type === "test_run" && event["@testrun"] === "vpn_missing_psks",
    )?.test_run.status,
    "pass",
  );
  assert.equal(
    resources("stackit_git").at(0)?.change.after.acl?.[0],
    enabled("devops") ? "192.0.2.0/24" : undefined,
    name,
  );
  assert(
    changes.every((change) =>
      change.change.actions.every(
        (action) => action === "create" || action === "no-op",
      ),
    ),
    name,
  );
}
assert.equal(
  events.find((event) => event.type === "test_summary")?.test_summary.status,
  "pass",
);
console.log(
  `PASS: ${plans.length} supported native plans including verified-image single/HA/per-area firewalls and VPN gateway; 2 policy/bootstrap boundary plans and native missing-PSK rejection. All cloud providers mocked.`,
);
