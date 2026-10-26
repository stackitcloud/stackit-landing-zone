import { z } from "zod";

// Admission control for durable order reservations, not cloud-provider quotas.
export const applicationOrderLimitSchema = z
  .number()
  .int()
  .min(0)
  .max(1000000)
  .nullable();
export const applicationOrderQuotaSchema = z.strictObject({
  maxReservedOrders: applicationOrderLimitSchema,
  reservedOrders: z.number().int().nonnegative().refine(Number.isSafeInteger),
  revision: z.number().int().nonnegative().max(2147483646),
});
export const applicationOrderQuotaUpdateSchema = z.strictObject({
  maxReservedOrders: applicationOrderLimitSchema,
  expectedRevision: z.number().int().nonnegative().max(2147483645),
  confirmQuota: z.literal(true),
});
