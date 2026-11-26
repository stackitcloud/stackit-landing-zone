import { expect, it, vi } from "vitest";
import { prepareApplyRetryRecovery } from "../apps/api/src/applications/retry-apply.js";

it("internally reviews a reported failure without another user confirmation or an Apply", async () => {
  const approve = vi.fn(async () => undefined);
  await prepareApplyRetryRecovery({
    check: async () => ({
      mode: "reported-failure",
      reviewToken: "signed-state-proof",
    }),
    approve,
  });
  expect(approve).toHaveBeenCalledExactlyOnceWith({
    reviewToken: "signed-state-proof",
    confirmFreshPlan: true,
  });
});
it("never fabricates an operator attestation for an ambiguous outcome", async () => {
  const approve = vi.fn();
  await expect(
    prepareApplyRetryRecovery({
      check: async () => ({ mode: "operator-attested", reviewToken: "proof" }),
      approve,
    }),
  ).rejects.toMatchObject({ code: "application_apply_retry_unavailable" });
  expect(approve).not.toHaveBeenCalled();
});
it("keeps a locked or changed State blocked and does not approve it", async () => {
  const error = new Error("state_locked");
  const approve = vi.fn();
  await expect(
    prepareApplyRetryRecovery({
      check: async () => {
        throw error;
      },
      approve,
    }),
  ).rejects.toBe(error);
  expect(approve).not.toHaveBeenCalled();
});
it("propagates a changed checkpoint instead of starting work after a failed approval", async () => {
  const error = new Error("checkpoint_changed");
  await expect(
    prepareApplyRetryRecovery({
      check: async () => ({
        mode: "reported-failure",
        reviewToken: "stale-proof",
      }),
      approve: async () => {
        throw error;
      },
    }),
  ).rejects.toBe(error);
});
