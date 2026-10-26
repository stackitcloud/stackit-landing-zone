import {
  applicationOrderQuotaSchema,
  applicationOrderQuotaUpdateSchema,
} from "@lzc/contracts";
import { describe, expect, it } from "vitest";

describe("Application reserved-order quota contract", () => {
  it("requires an explicit, bounded integer or unlimited and a versioned confirmation", () => {
    for (const maxReservedOrders of [null, 0, 1, 1000000]) {
      expect(
        applicationOrderQuotaUpdateSchema.parse({
          maxReservedOrders,
          expectedRevision: 0,
          confirmQuota: true,
        }).maxReservedOrders,
      ).toBe(maxReservedOrders);
    }
    for (const maxReservedOrders of [
      undefined,
      "1",
      -1,
      0.5,
      1000001,
      NaN,
      Infinity,
    ]) {
      expect(
        applicationOrderQuotaUpdateSchema.safeParse({
          maxReservedOrders,
          expectedRevision: 0,
          confirmQuota: true,
        }).success,
      ).toBe(false);
    }
    expect(
      applicationOrderQuotaUpdateSchema.safeParse({
        maxReservedOrders: 0,
        expectedRevision: 0,
        confirmQuota: false,
      }).success,
    ).toBe(false);
    expect(
      applicationOrderQuotaUpdateSchema.safeParse({
        maxReservedOrders: 0,
        expectedRevision: 0,
        confirmQuota: true,
        tenantId: "injected",
      }).success,
    ).toBe(false);
    expect(
      applicationOrderQuotaSchema.parse({
        maxReservedOrders: null,
        reservedOrders: 12,
        revision: 0,
      }),
    ).toEqual({ maxReservedOrders: null, reservedOrders: 12, revision: 0 });
  });
});
