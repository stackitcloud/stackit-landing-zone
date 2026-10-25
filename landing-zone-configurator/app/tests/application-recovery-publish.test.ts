import { stat } from "node:fs/promises";
import { recoverySha256 } from "@lzc/contracts/recovery";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  prepareNativeStateRecovery,
  type RecoveryNativeCommand,
} from "../apps/worker/src/state-recovery-native.js";
import { publishNativeStateRecovery } from "../apps/worker/src/state-recovery-publish.js";

vi.mock("../apps/worker/src/state-recovery-native.js", () => ({
  prepareNativeStateRecovery: vi.fn(),
  recoveryNativeCommand: vi.fn(),
}));
const tenant = "11111111-1111-4111-8111-111111111111";
const instance = "22222222-2222-4222-8222-222222222222";
const candidate = Buffer.from("reviewed-native-state-fixture");
function fixture() {
  const input = {
    root: "/packaged-runner",
    tenantId: tenant,
    instanceId: instance,
    sourceRevision: "a".repeat(40),
    providerLockSha256: "b".repeat(64),
    variables: {},
    key: {},
    original: Buffer.from("original"),
    inventory: {},
    candidate,
    approvedCandidateSha256: recoverySha256(candidate),
    orphanLockId: "33333333-3333-b333-5333-333333333333" as string | null,
    backend: {
      kind: "s3",
      descriptor: {
        bucket: "recovery-test-state",
        key: `applications/${tenant}/${instance}/terraform.tfstate`,
        endpoint: "https://object.storage.eu01.onstackit.cloud",
        region: "eu01",
        useLockfile: true,
      },
      credentials: {
        accessKeyId: "test-only-key",
        secretAccessKey: "test-only-secret",
      },
    },
  };
  const events: string[] = [];
  const calls: Parameters<RecoveryNativeCommand>[0][] = [];
  const command: RecoveryNativeCommand = async (c) => {
    calls.push(c);
    events.push(c.args.join(" "));
    return "";
  };
  const fence = async (step: "unlock" | "publish") => {
    events.push(`fence:${step}`);
  };
  return { input, events, calls, command, fence };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prepareNativeStateRecovery).mockResolvedValue({
    candidate,
  } as Awaited<ReturnType<typeof prepareNativeStateRecovery>>);
});
describe("single-use native State publication", () => {
  it("requires fresh native proof, durable fences and native locking without forcing State", async () => {
    const f = fixture();
    expect(
      await publishNativeStateRecovery(f.input, f.fence, f.command),
    ).toEqual({ publicationRequested: true });
    expect(prepareNativeStateRecovery).toHaveBeenCalledOnce();
    expect(f.events.slice(0, 4)).toEqual([
      "init -input=false -no-color",
      "fence:unlock",
      `force-unlock -force ${f.input.orphanLockId}`,
      "fence:publish",
    ]);
    const push = f.calls.find((c) => c.args[0] === "state")!;
    expect(push.args.slice(0, 3)).toEqual([
      "state",
      "push",
      "-lock-timeout=0s",
    ]);
    expect(push.args).not.toContain("-force");
    expect(push.args).not.toContain("-lock=false");
    expect(f.calls.flatMap((c) => c.args)).not.toContain("apply");
    expect(await stat(push.cwd).catch(() => null)).toBeNull();
  });
  it("handles an already free checkpoint without invoking force-unlock", async () => {
    const f = fixture();
    f.input.orphanLockId = null;
    await publishNativeStateRecovery(f.input, f.fence, f.command);
    expect(f.events.filter((x) => x.startsWith("fence:"))).toEqual([
      "fence:unlock",
      "fence:publish",
    ]);
    expect(f.calls.some((c) => c.args[0] === "force-unlock")).toBe(false);
  });
  it.each(["unlock-fence", "unlock-command", "publish-fence", "push-command"])(
    "never repeats native actions after uncertain %s",
    async (at) => {
      const f = fixture();
      await expect(
        publishNativeStateRecovery(
          f.input,
          async (step) => {
            await f.fence(step);
            if (at === `${step}-fence`) throw new Error("response lost");
          },
          async (c) => {
            const output = await f.command(c);
            if (
              (at === "unlock-command" && c.args[0] === "force-unlock") ||
              (at === "push-command" && c.args[0] === "state")
            )
              throw new Error("response lost");
            return output;
          },
        ),
      ).rejects.toThrow("commit-outcome-unknown");
      expect(
        f.calls.filter((c) => c.args[0] === "force-unlock").length,
      ).toBeLessThanOrEqual(1);
      expect(
        f.calls.filter((c) => c.args[0] === "state").length,
      ).toBeLessThanOrEqual(1);
      if (at !== "push-command")
        expect(f.calls.some((c) => c.args[0] === "state")).toBe(false);
      expect(await stat(f.calls[0]!.cwd).catch(() => null)).toBeNull();
    },
  );
  it("rejects stale approval, changed live native candidate and foreign backend before any fence", async () => {
    for (const mode of ["approval", "live", "backend"]) {
      const f = fixture();
      if (mode === "approval") f.input.approvedCandidateSha256 = "c".repeat(64);
      if (mode === "live")
        vi.mocked(prepareNativeStateRecovery).mockResolvedValueOnce({
          candidate: Buffer.from("changed"),
        } as never);
      if (mode === "backend")
        f.input.backend.descriptor.key = "another/terraform.tfstate";
      await expect(
        publishNativeStateRecovery(f.input, f.fence, f.command),
      ).rejects.toThrow();
      expect(f.calls).toEqual([]);
      expect(f.events).toEqual([]);
    }
  });
});
