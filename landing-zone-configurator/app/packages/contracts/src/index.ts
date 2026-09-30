import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("landing-zone-configurator"),
  authentication: z.enum(["not-configured", "github"]),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
