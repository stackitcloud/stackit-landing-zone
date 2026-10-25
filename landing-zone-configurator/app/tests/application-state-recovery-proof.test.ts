import type { ApplicationStateRecoveryImport } from "@lzc/contracts";
import {
  readRecoveryState,
  retainRecoveryOutputs,
  verifyImportedRecoveryState,
  verifyRecoveryPreview,
} from "@lzc/contracts/recovery";
import { describe, expect, it } from "vitest";

const instanceId = "11111111-1111-4111-8111-111111111111";
const lineage = "22222222-2222-4222-8222-222222222222";
const provider = 'provider["registry.opentofu.org/stackitcloud/stackit"]';
const contract = {
  mode: "managed",
  type: "terraform_data",
  name: "contract",
  provider: 'provider["terraform.io/builtin/terraform"]',
  instances: [
    {
      attributes: { id: "contract", input: instanceId },
      private: "retained-private",
    },
  ],
};
const original = () => ({
  version: 4,
  terraform_version: "1.12.6",
  lineage,
  serial: 1,
  outputs: {},
  resources: [structuredClone(contract)],
});
const imported: ApplicationStateRecoveryImport = {
  address: "module.application.stackit_network.this[0]",
  type: "stackit_network",
  resourceId: "project,eu01,network",
};
const network = () => ({
  module: "module.application",
  mode: "managed",
  type: "stackit_network",
  name: "this",
  provider,
  instances: [
    {
      index_key: 0,
      attributes: { id: imported.resourceId, network_id: "network" },
    },
  ],
});
const bytes = (value: unknown) => Buffer.from(JSON.stringify(value));
function fixture() {
  const before = original();
  const after = {
    ...structuredClone(before),
    serial: 2,
    resources: [...structuredClone(before.resources), network()],
  };
  return { before, after };
}
function check(before: unknown, after: unknown, imports = [imported]) {
  return verifyImportedRecoveryState({
    original: bytes(before),
    candidate: bytes(after),
    instanceId,
    imports,
  });
}

describe("native Application recovery State proof", () => {
  it("accepts the exact native import and empty declarations without discarding original private fields", () => {
    const { before, after } = fixture();
    after.resources.push({ ...network(), name: "unused", instances: [] });
    expect(check(before, after)).toMatchObject({
      originalSerial: 1,
      candidateSerial: 2,
      retainedResources: 1,
      candidateResources: 2,
    });
  });
  it.each([
    "lineage",
    "serial",
    "owner",
    "private",
    "provider",
    "outputs",
    "missing",
    "extra",
    "id",
    "index",
    "tainted",
    "deposed",
    "duplicate",
  ])("rejects a candidate with changed %s", (mutation) => {
    const { before, after } = fixture();
    switch (mutation) {
      case "lineage":
        after.lineage = instanceId;
        break;
      case "serial":
        after.serial = 1;
        break;
      case "owner":
        Object.assign(after.resources[0]!.instances[0]!.attributes, {
          input: lineage,
        });
        break;
      case "private":
        Object.assign(after.resources[0]!.instances[0]!, {
          private: "rewritten",
        });
        break;
      case "provider":
        after.resources[0]!.provider = provider;
        break;
      case "outputs":
        after.outputs = { unexpected: "value" };
        break;
      case "missing":
        after.resources.shift();
        break;
      case "extra":
        after.resources.push({ ...network(), name: "other" });
        break;
      case "id":
        after.resources[1]!.instances[0]!.attributes.id = "foreign";
        break;
      case "index":
        Object.assign(after.resources[1]!.instances[0]!, { index_key: 1 });
        break;
      case "tainted":
        Object.assign(after.resources[1]!.instances[0]!, { status: "tainted" });
        break;
      case "deposed":
        Object.assign(after.resources[1]!.instances[0]!, { deposed: "old" });
        break;
      case "duplicate":
        after.resources.push(network());
        break;
    }
    expect(() => check(before, after)).toThrow();
  });
  it("rejects duplicate adoption requests and importing an already retained address", () => {
    const { before, after } = fixture();
    expect(() => check(before, after, [imported, imported])).toThrow();
    expect(() =>
      check(before, before, [
        { ...imported, address: "terraform_data.contract" },
      ]),
    ).toThrow();
  });
  it("requires an exact root instance contract and the pinned native format", () => {
    const state = original();
    expect(() => readRecoveryState(bytes(state), lineage)).toThrow();
    expect(() =>
      readRecoveryState(
        bytes({ ...state, terraform_version: "1.12.7" }),
        instanceId,
      ),
    ).toThrow();
    expect(() =>
      readRecoveryState(bytes({ ...state, version: 3 }), instanceId),
    ).toThrow();
    expect(() =>
      readRecoveryState(Buffer.alloc(16 * 1024 * 1024 + 1), instanceId),
    ).toThrow();
  });
  it("preserves native opaque lineages without requiring RFC version/variant bits", () => {
    const { before, after } = fixture();
    before.lineage = after.lineage = "571a932b-6ef9-bddf-57a0-9fe5dff3a09a";
    expect(check(before, after)).toMatchObject({
      retainedResources: 1,
      candidateResources: 2,
    });
  });
  it("retains original outputs while still rejecting changed resource data after normalization", () => {
    const { before, after } = fixture();
    after.outputs = { computed_during_import: "not-published-by-recovery" };
    const candidate = retainRecoveryOutputs(
      bytes(before),
      bytes(after),
      instanceId,
    );
    expect(JSON.parse(candidate.toString()).outputs).toEqual(before.outputs);
    expect(
      verifyImportedRecoveryState({
        original: bytes(before),
        candidate,
        instanceId,
        imports: [imported],
      }),
    ).toMatchObject({ candidateResources: 2 });
    after.resources[1]!.instances[0]!.attributes.id = "wrong";
    expect(() =>
      verifyImportedRecoveryState({
        original: bytes(before),
        candidate: retainRecoveryOutputs(
          bytes(before),
          bytes(after),
          instanceId,
        ),
        instanceId,
        imports: [imported],
      }),
    ).toThrow();
  });
});

describe("diagnostic recovery preview", () => {
  const noop = (address: string) => ({
    address,
    mode: "managed",
    change: { actions: ["no-op"] },
  });
  it("retains every existing identity and permits only additional creates", () => {
    const { after } = fixture();
    const plan = {
      resource_changes: [
        noop("terraform_data.contract"),
        noop(imported.address),
        {
          address: "module.application.new",
          mode: "managed",
          change: { actions: ["create"] },
        },
      ],
    };
    expect(verifyRecoveryPreview(plan, bytes(after), instanceId)).toEqual({
      create: 1,
      unchanged: 2,
      update: 0,
      delete: 0,
      replace: 0,
    });
  });
  it.each([
    ["delete"],
    ["update"],
    ["delete", "create"],
    ["create", "delete"],
    ["read"],
  ])("blocks unsafe managed actions %j", (...actions) => {
    const { after } = fixture();
    expect(() =>
      verifyRecoveryPreview(
        {
          resource_changes: [
            noop("terraform_data.contract"),
            { address: imported.address, mode: "managed", change: { actions } },
          ],
        },
        bytes(after),
        instanceId,
      ),
    ).toThrow();
  });
  it("does not accept a missing, duplicated or recreated retained resource", () => {
    const { after } = fixture();
    for (const entries of [
      [],
      [noop("terraform_data.contract")],
      [
        noop("terraform_data.contract"),
        noop(imported.address),
        noop(imported.address),
      ],
      [
        noop("terraform_data.contract"),
        {
          address: imported.address,
          mode: "managed",
          change: { actions: ["create"] },
        },
      ],
    ])
      expect(() =>
        verifyRecoveryPreview(
          { resource_changes: entries },
          bytes(after),
          instanceId,
        ),
      ).toThrow();
  });
});
