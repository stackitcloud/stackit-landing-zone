import { RecoveryReplanError } from "./recovery-replan.js";

/** A retry click authorizes a fresh Plan, never a replay or a new Apply. */
export async function prepareApplyRetryRecovery(dependencies: {
  check: () => Promise<{
    mode: "reported-failure" | "operator-attested";
    reviewToken: string;
  }>;
  approve: (input: {
    reviewToken: string;
    confirmFreshPlan: true;
  }) => Promise<unknown>;
}) {
  const checkpoint = await dependencies.check();
  // An application must not invent operator attestations for an unknown outcome.
  if (checkpoint.mode !== "reported-failure") {
    throw new RecoveryReplanError(409, "application_apply_retry_unavailable");
  }
  await dependencies.approve({
    reviewToken: checkpoint.reviewToken,
    confirmFreshPlan: true,
  });
}
