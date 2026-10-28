import { z } from "zod";

export const applicationExecutionCurrentRevision =
  "08ac257de1548c8ec5e83dae1a79373711c3d644";
export const applicationExecutionProviderLockSha256 =
  "d40debbff204aee590c2a76d09f6ad3234643329b438fd5c6497de60687f6fa5";
export const applicationExecutionRevisions = [
  "c4b43c36af198985980b17626c48d357795e3fbd",
  "88149782bf8e91dcdbb43a203b54337886023f7f",
  "57ad1f6a651c1787694b74ff8aa8b241a3dcd16f",
  "9e7fb46c329aca32e878ce1f0ea3b944ea240354",
  "1ed855609d4dcbfded6759c7c8b4fabf7bd6725d",
  applicationExecutionCurrentRevision,
] as const;
export const applicationExecutionRevisionSchema = z.enum(
  applicationExecutionRevisions,
);
export const applicationExecutionProfileSchema = z.strictObject({
  revision: z.string().regex(/^[a-f0-9]{40}$/),
  providerLockSha256: z.literal(applicationExecutionProviderLockSha256),
  openTofuVersion: z.literal("1.12.6"),
  contractVersion: z.literal(1),
  status: z.enum(["supported", "withdrawn"]),
  replacementRevision: z.literal(applicationExecutionCurrentRevision),
  maintenanceEnabled: z.boolean(),
});
export type ApplicationExecutionProfile = z.infer<
  typeof applicationExecutionProfileSchema
>;
export const applicationExecutionProfiles: readonly ApplicationExecutionProfile[] =
  [
    ...applicationExecutionRevisions.map(
      (revision): ApplicationExecutionProfile => ({
        revision,
        providerLockSha256: applicationExecutionProviderLockSha256,
        openTofuVersion: "1.12.6" as const,
        contractVersion: 1 as const,
        status: "supported" as const,
        replacementRevision: applicationExecutionCurrentRevision,
        maintenanceEnabled: true,
      }),
    ),
    {
      revision: "4d15d7870afa323badd93559d8b37c5a8d138dcf",
      providerLockSha256: applicationExecutionProviderLockSha256,
      openTofuVersion: "1.12.6",
      contractVersion: 1,
      status: "withdrawn",
      replacementRevision: applicationExecutionCurrentRevision,
      maintenanceEnabled: false,
    },
  ];
export const applicationExecutionManifestSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    profiles: z
      .array(
        applicationExecutionProfileSchema.extend({
          sourcePath: z
            .string()
            .regex(/^(?:application-src|application-sources\/[a-f0-9]{40})$/),
          payloadSha256: z.string().regex(/^[a-f0-9]{64}$/),
        }),
      )
      .min(1)
      .max(applicationExecutionProfiles.length),
  })
  .superRefine((manifest, context) => {
    const revisions = new Set<string>(),
      paths = new Set<string>();
    for (const [index, profile] of manifest.profiles.entries()) {
      const reviewed = applicationExecutionProfiles.find(
        (entry) => entry.revision === profile.revision,
      );
      if (
        !reviewed ||
        revisions.has(profile.revision) ||
        paths.has(profile.sourcePath) ||
        (profile.sourcePath === "application-src"
          ? profile.revision !== applicationExecutionCurrentRevision
          : profile.sourcePath !== `application-sources/${profile.revision}`) ||
        profile.providerLockSha256 !== reviewed?.providerLockSha256 ||
        profile.openTofuVersion !== reviewed?.openTofuVersion ||
        profile.contractVersion !== reviewed?.contractVersion ||
        (reviewed?.status === "withdrawn" && profile.status !== "withdrawn") ||
        (profile.maintenanceEnabled && !reviewed?.maintenanceEnabled)
      )
        context.addIssue({
          code: "custom",
          path: ["profiles", index],
          message: "Unreviewed or duplicate Application execution profile",
        });
      revisions.add(profile.revision);
      paths.add(profile.sourcePath);
    }
  });
export type ApplicationExecutionManifest = z.infer<
  typeof applicationExecutionManifestSchema
>;
export function applicationExecutionProfile(
  manifest: ApplicationExecutionManifest,
  revision: string,
) {
  const reviewed = applicationExecutionProfiles.find(
    (entry) => entry.revision === revision,
  );
  const profile = manifest.profiles.find(
    (entry) => entry.revision === revision,
  );
  if (reviewed?.status === "withdrawn" || profile?.status === "withdrawn")
    throw new Error(
      `Application source withdrawn; upgrade to ${applicationExecutionCurrentRevision}`,
    );
  if (!reviewed || !profile)
    throw new Error(
      `Application source unavailable; upgrade to ${applicationExecutionCurrentRevision}`,
    );
  return profile;
}

/** Preserve historical native bucket identities on an explicit source upgrade. */
export function applicationExecutionNativeOverrides(
  originRevision: string,
  selectedRevision: string,
): { bucket_naming?: "legacy" } {
  const legacyOrigins = [
    "4d15d7870afa323badd93559d8b37c5a8d138dcf",
    ...applicationExecutionRevisions.slice(0, 3),
  ];
  const modernTargets = applicationExecutionRevisions.slice(3);
  return legacyOrigins.includes(originRevision) &&
    modernTargets.some((revision) => revision === selectedRevision)
    ? { bucket_naming: "legacy" }
    : {};
}
