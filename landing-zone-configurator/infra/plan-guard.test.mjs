import assert from "node:assert/strict";
import test from "node:test";
import { isApplicablePlan } from "./plan-guard.mjs";

const now = Date.parse("2026-09-29T12:00:00Z");
const manifest = { status: "ready", contextHash: "context", planHash: "plan", createdAt: new Date(now).toISOString() };

test("only a matching reviewed plan can be applied", () => {
  assert.equal(isApplicablePlan(manifest, "context", "plan", now), true);
  assert.equal(isApplicablePlan(manifest, "other-context", "plan", now), false);
  assert.equal(isApplicablePlan(manifest, "context", "changed-plan", now), false);
});
test("failed, missing and consumed plans cannot be retried blindly", () => {
  for (const status of ["planning", "failed", "consumed"]) {
    assert.equal(isApplicablePlan({ ...manifest, status }, "context", "plan", now), false);
  }
  assert.equal(isApplicablePlan(null, "context", "plan", now), false);
});
test("invalid, future and expired timestamps fail closed", () => {
  for (const createdAt of ["invalid", new Date(now + 1).toISOString(), new Date(now - 86400001).toISOString()]) {
    assert.equal(isApplicablePlan({ ...manifest, createdAt }, "context", "plan", now), false);
  }
});
