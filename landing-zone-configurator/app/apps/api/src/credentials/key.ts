import { createPrivateKey } from "node:crypto";
import { z } from "zod";

const keySchema = z.object({
  id: z.string().max(128).optional(),
  active: z.literal(true).optional(),
  validUntil: z.iso.datetime({ offset: true }).optional(),
  credentials: z.object({
    kid: z.string().min(1).max(128),
    iss: z
      .email()
      .max(254)
      .regex(/@sa\.stackit\.cloud$/),
    sub: z.uuid(),
    // Stored audience is data, never used as a user-controlled request destination.
    aud: z.enum([
      "https://accounts.stackit.cloud",
      "https://service-account.api.stackit.cloud",
      "https://stackit-service-account-prod.apps.01.cf.eu01.stackit.cloud",
    ]),
    tokenEndpoint: z
      .enum([
        "https://accounts.stackit.cloud/oauth/v2/token",
        "https://service-account.api.stackit.cloud/token",
        "https://stackit-service-account-prod.apps.01.cf.eu01.stackit.cloud/token",
      ])
      .optional(),
    privateKey: z.string().min(100).max(16384),
  }),
});
export type ServiceAccountKey = z.infer<typeof keySchema>;
export function parseServiceAccountKey(input: unknown): ServiceAccountKey {
  const key = keySchema.parse(input);
  if (
    (key.id && key.id !== key.credentials.kid) ||
    (key.validUntil && Date.parse(key.validUntil) <= Date.now())
  )
    throw new Error("Invalid or expired service account key");
  const privateKey = createPrivateKey(key.credentials.privateKey);
  if (
    privateKey.asymmetricKeyType !== "rsa" ||
    (privateKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
  )
    throw new Error("RSA key with at least 2048 bits required");
  return key;
}
