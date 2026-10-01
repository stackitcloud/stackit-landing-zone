import { expect, it } from "vitest";
import { compileApplicationPlan } from "../packages/domain/src/application-plan.js";

const id = "11111111-2222-4333-8444-555555555555";
const other = "22222222-2222-4333-8444-555555555555";
const revision = "a".repeat(40);
function fixture() {
  return {
    context: {
      tenant_id: id,
      user_id: id,
      instance_id: id,
      role: "application-owner",
      verified_stackit_email: "owner@stackit.cloud",
      stackit_organization_id: id,
      allowed_accelerator_revision: revision,
    },
    platform: {
      schema_version: 1,
      tenant_id: id,
      revision: id,
      organization_id: id,
      targets: {
        public: {
          folder_id: id,
          region: "eu01",
          corporate: false,
          network_area_id: null,
          firewall_next_hop_ip: null,
          ipv4_nameservers: null,
        },
      },
    },
    template: {
      schema_version: 1,
      tenant_id: id,
      id: "project-base",
      version: 1,
      status: "published",
      accelerator_revision: revision,
      platform_revision: id,
      target_keys: ["public"],
      apply_policy: "approval-required",
      services: {
        secretsmanager_enabled: true,
        observability: {
          enabled: false,
          plan_name: "Observability-Starter-EU01",
          acl: [],
        },
      },
    },
    request: { name: "Team Application", target_key: "public" },
  };
}
it("compiles one isolated application using only verified owner and published policies", () => {
  const input = fixture();
  const before = structuredClone(input);
  const plan = compileApplicationPlan(input);
  expect(plan.variables.application.owner_email).toBe(
    input.context.verified_stackit_email,
  );
  expect(plan.variables.application.secretsmanager_enabled).toBe(true);
  expect(plan.entrypoint).toBe("src/application");
  expect(plan.stateKey).toBe(`applications/${id}/${id}/terraform.tfstate`);
  expect(input).toEqual(before);
  input.context.instance_id = other;
  expect(compileApplicationPlan(input).stateKey).not.toBe(plan.stateKey);
});
it("rejects tenant, organisation, publication, revision and destination mismatches", () => {
  const mutations = [
    (input: ReturnType<typeof fixture>) => {
      input.context.tenant_id = other;
    },
    (input: ReturnType<typeof fixture>) => {
      input.context.stackit_organization_id = other;
    },
    (input: ReturnType<typeof fixture>) => {
      input.template.platform_revision = other;
    },
    (input: ReturnType<typeof fixture>) => {
      input.template.accelerator_revision = "b".repeat(40);
    },
    (input: ReturnType<typeof fixture>) => {
      input.template.status = "draft";
    },
    (input: ReturnType<typeof fixture>) => {
      input.request.target_key = "unknown";
    },
  ];
  for (const mutate of mutations) {
    const input = fixture();
    mutate(input);
    expect(() => compileApplicationPlan(input)).toThrow();
  }
});
it("rejects owner, service and backend injection through the request", () => {
  for (const extra of [
    { owner_email: "attacker@stackit.cloud" },
    { secretsmanager_enabled: false },
    { stateKey: "platform.tfstate" },
  ]) {
    const input = fixture();
    expect(() =>
      compileApplicationPlan({
        ...input,
        request: { ...input.request, ...extra },
      }),
    ).toThrow();
  }
});
it("does not authorize execution even when future template policy allows direct Apply", () => {
  const input = fixture();
  input.template.apply_policy = "direct";
  expect(compileApplicationPlan(input).applyPolicy).toBe("direct");
  expect(compileApplicationPlan(input).executionEnabled).toBe(false);
});
