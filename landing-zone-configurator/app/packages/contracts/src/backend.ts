import { z } from "zod";

export const s3BackendDescriptorSchema = z
  .object({
    bucket: z
      .string()
      .min(3)
      .max(63)
      .regex(/^[a-z0-9][a-z0-9.-]+[a-z0-9]$/),
    endpoint: z.literal("https://object.storage.eu01.onstackit.cloud"),
    region: z.literal("eu01"),
    key: z
      .string()
      .min(1)
      .max(1024)
      .refine((value) =>
        [...value].every(
          (character) =>
            character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127,
        ),
      ),
    useLockfile: z.literal(true),
  })
  .strict();

export type S3BackendDescriptor = z.infer<typeof s3BackendDescriptorSchema>;

export const s3RunnerBackendSchema = z
  .object({
    kind: z.literal("s3"),
    descriptor: s3BackendDescriptorSchema,
    credentials: z
      .object({
        accessKeyId: z.string().min(1).max(512),
        secretAccessKey: z.string().min(1).max(4096),
      })
      .strict(),
  })
  .strict();

export type S3RunnerBackend = z.infer<typeof s3RunnerBackendSchema>;

export function s3BackendConfiguration(
  descriptor: S3BackendDescriptor,
): string {
  const value = s3BackendDescriptorSchema.parse(descriptor);
  return (
    JSON.stringify(
      {
        terraform: {
          backend: {
            s3: {
              bucket: value.bucket,
              endpoints: { s3: value.endpoint },
              key: value.key,
              region: value.region,
              use_lockfile: value.useLockfile,
              skip_credentials_validation: true,
              skip_region_validation: true,
              skip_requesting_account_id: true,
              skip_s3_checksum: true,
            },
          },
        },
      },
      null,
      2,
    ) + "\n"
  );
}
