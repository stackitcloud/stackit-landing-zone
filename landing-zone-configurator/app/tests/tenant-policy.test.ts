import { canAccessTenant } from "@lzc/domain";
import { describe, expect, it } from "vitest";

const tenantId = "00000000-0000-4000-8000-000000000001";
const otherTenantId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000003";

describe("tenant permission boundary", () => {
  it("denies cross-tenant access even for administrators", () => {
    expect(
      canAccessTenant(
        { userId, tenantId, role: "admin" },
        otherTenantId,
        "read",
      ),
    ).toBe(false);
  });
  it("does not let editors deploy or deployers edit", () => {
    expect(
      canAccessTenant({ userId, tenantId, role: "editor" }, tenantId, "deploy"),
    ).toBe(false);
    expect(
      canAccessTenant({ userId, tenantId, role: "deployer" }, tenantId, "edit"),
    ).toBe(false);
    expect(
      canAccessTenant({ userId, tenantId, role: "editor" }, tenantId, "edit"),
    ).toBe(true);
  });
  it("fails closed for missing or malformed membership and tenant IDs", () => {
    for (const membership of [null, {}, { userId, tenantId, role: "owner" }]) {
      expect(canAccessTenant(membership, tenantId, "read")).toBe(false);
    }
    expect(
      canAccessTenant({ userId, tenantId, role: "admin" }, "", "read"),
    ).toBe(false);
  });
});
