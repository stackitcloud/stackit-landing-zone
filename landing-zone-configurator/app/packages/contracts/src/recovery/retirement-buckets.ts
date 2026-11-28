import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  AbortMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectLegalHoldCommand,
  GetObjectLockConfigurationCommand,
  GetObjectRetentionCommand,
  HeadBucketCommand,
  ListMultipartUploadsCommand,
  type ListMultipartUploadsCommandOutput,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
  type ListObjectVersionsCommandOutput,
  S3Client,
} from "@aws-sdk/client-s3";
import { z } from "zod";
import type { RetirementInventory } from "./retirement.js";
import {
  parseServiceAccountKey,
  serviceAccountTokenEndpoints,
  signedAssertion,
} from "./service-account.js";

export const bucketCleanupErrors = [
  "retirement_bucket_cleanup_unavailable",
  "retirement_bucket_cleanup_locked",
  "retirement_bucket_cleanup_incomplete",
  "retirement_bucket_cleanup_scope_invalid",
  "retirement_bucket_cleanup_access_failed",
  "retirement_bucket_cleanup_credentials_failed",
] as const;
const fail = (code: (typeof bucketCleanupErrors)[number]) => Error(code);
// Match the pinned STACKIT SDK's Go url.PathEscape for opaque, padded key IDs.
const keySegment = (value: string) =>
  encodeURIComponent(value)
    .replace(
      /[!'()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
    )
    .replaceAll("%3D", "=")
    .replaceAll("%2B", "+")
    .replaceAll("%40", "@")
    .replaceAll("%3A", ":")
    .replaceAll("%26", "&")
    .replaceAll("%24", "$");
const regionSchema = z.enum(["eu01", "eu02"]);
const bucketName = z
  .string()
  .min(3)
  .max(63)
  .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/)
  .refine((v) => !v.includes(".."));
export type RetirementBucket = {
  projectId: string;
  region: "eu01" | "eu02";
  name: string;
  address: string;
};
/** Only exact bucket identities from the already verified deletion list. No cloud discovery expands scope. */
export function retirementBuckets(
  deletes: RetirementInventory["resources"],
  protectedProjects: readonly string[],
): RetirementBucket[] {
  const seen = new Set<string>();
  return deletes
    .filter((r) => r.type === "stackit_objectstorage_bucket")
    .map((r) => {
      const parts = r.id?.split(",");
      if (!parts || parts.length !== 3)
        throw fail("retirement_bucket_cleanup_scope_invalid");
      const projectId = z.uuid().parse(parts[0]),
        region = regionSchema.parse(parts[1]),
        name = bucketName.parse(parts[2]);
      if (
        protectedProjects.some(
          (id) => id.toLowerCase() === projectId.toLowerCase(),
        ) ||
        (r.selectors.project_id && r.selectors.project_id !== projectId) ||
        (r.selectors.name && r.selectors.name !== name) ||
        seen.has(r.id!)
      )
        throw fail("retirement_bucket_cleanup_scope_invalid");
      seen.add(r.id!);
      return { projectId, region, name, address: r.address };
    });
}
/** Keep standard Content-MD5 for multi-delete on STACKIT's S3-compatible API.
 * The pinned SDK supports MD5 but also emits an optional SDK algorithm header;
 * remove that advertisement before signing. Payload integrity remains mandatory. */
export function retirementS3Compatibility(client: S3Client) {
  client.middlewareStack.add(
    (next, context) => async (args) => {
      if (context.commandName === "DeleteObjectsCommand") {
        const request = args.request as { headers: Record<string, string> };
        delete request.headers["x-amz-sdk-checksum-algorithm"];
      }
      return next(args);
    },
    { step: "build", priority: "low", name: "retirementS3Compatibility" },
  );
  return client;
}
type Store = Pick<S3Client, "send" | "destroy">;
export type BucketCleanupOptions = {
  buckets: RetirementBucket[];
  key: unknown;
  jobId: string;
  deadline: number;
  request?: typeof fetch;
  progress?: (line: string) => Promise<void>;
  beforeDelete?: () => Promise<void>;
  client?: (
    bucket: RetirementBucket,
    credentials: { accessKeyId: string; secretAccessKey: string },
  ) => Store;
};
const entry = z.object({
  Key: z.string().min(1).max(1024),
  VersionId: z.string().min(1).max(2048),
});
const upload = z.object({
  Key: z.string().min(1).max(1024),
  UploadId: z.string().min(1).max(2048),
});
const maximum = 50000;
function signal(deadline: number) {
  if (Date.now() >= deadline)
    throw fail("retirement_bucket_cleanup_incomplete");
  return AbortSignal.timeout(
    Math.max(1, Math.min(10000, deadline - Date.now())),
  );
}
async function json(
  request: typeof fetch,
  url: string,
  init: RequestInit,
  deadline: number,
) {
  const response = await request(url, {
    ...init,
    redirect: "error",
    signal: signal(deadline),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw fail("retirement_bucket_cleanup_access_failed");
  }
  if (response.status === 204) return null;
  if (!response.body) throw fail("retirement_bucket_cleanup_access_failed");
  const reader = response.body.getReader(),
    parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 256 * 1024)
        throw fail("retirement_bucket_cleanup_access_failed");
      parts.push(value);
    }
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function waitForAccess(
  client: Store,
  bucket: RetirementBucket,
  deadline: number,
) {
  const until = Math.min(deadline, Date.now() + 30_000);
  for (;;) {
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket.name }), {
        abortSignal: signal(until),
      });
      return;
    } catch (error) {
      const observed = error as {
        name?: string;
        $metadata?: { httpStatusCode?: number };
      };
      if (
        (observed.$metadata?.httpStatusCode !== 403 &&
          ![
            "InvalidAccessKeyId",
            "AccessDenied",
            "SignatureDoesNotMatch",
          ].includes(observed.name ?? "")) ||
        Date.now() >= until
      )
        throw fail("retirement_bucket_cleanup_access_failed");
      // HEAD errors have no XML error body; use HTTP 403 as well as named errors.
      // New S3 keys may propagate asynchronously. Observe access; never repeat creation.
      await delay(Math.min(250, Math.max(1, until - Date.now())));
    }
  }
}

async function inventory(
  client: Store,
  bucket: RetirementBucket,
  deadline: number,
) {
  const objects: z.infer<typeof entry>[] = [],
    retainedObjects: z.infer<typeof entry>[] = [],
    uploads: z.infer<typeof upload>[] = [];
  let key: string | undefined, version: string | undefined;
  const cursors = new Set<string>();
  for (;;) {
    const page: ListObjectVersionsCommandOutput = await client.send(
      new ListObjectVersionsCommand({
        Bucket: bucket.name,
        KeyMarker: key,
        VersionIdMarker: version,
        MaxKeys: 1000,
      }),
      { abortSignal: signal(deadline) },
    );
    if (page.Name !== bucket.name)
      throw fail("retirement_bucket_cleanup_scope_invalid");
    const versions = z.array(entry).parse(page.Versions ?? []);
    retainedObjects.push(...versions);
    objects.push(
      ...versions,
      ...z.array(entry).parse(page.DeleteMarkers ?? []),
    );
    if (objects.length > maximum)
      throw fail("retirement_bucket_cleanup_incomplete");
    if (page.IsTruncated === false) break;
    if (page.IsTruncated !== true || !page.NextKeyMarker)
      throw fail("retirement_bucket_cleanup_incomplete");
    const cursor = JSON.stringify([
      page.NextKeyMarker,
      page.NextVersionIdMarker,
    ]);
    if (cursors.has(cursor)) throw fail("retirement_bucket_cleanup_incomplete");
    cursors.add(cursor);
    key = page.NextKeyMarker;
    version = page.NextVersionIdMarker;
  }
  key = undefined;
  let uploadId: string | undefined;
  cursors.clear();
  for (;;) {
    const page: ListMultipartUploadsCommandOutput = await client.send(
      new ListMultipartUploadsCommand({
        Bucket: bucket.name,
        KeyMarker: key,
        UploadIdMarker: uploadId,
        MaxUploads: 1000,
      }),
      { abortSignal: signal(deadline) },
    );
    if (page.Bucket !== bucket.name)
      throw fail("retirement_bucket_cleanup_scope_invalid");
    uploads.push(...z.array(upload).parse(page.Uploads ?? []));
    if (uploads.length > maximum)
      throw fail("retirement_bucket_cleanup_incomplete");
    if (page.IsTruncated === false) break;
    if (page.IsTruncated !== true || !page.NextKeyMarker)
      throw fail("retirement_bucket_cleanup_incomplete");
    const cursor = JSON.stringify([
      page.NextKeyMarker,
      page.NextUploadIdMarker,
    ]);
    if (cursors.has(cursor)) throw fail("retirement_bucket_cleanup_incomplete");
    cursors.add(cursor);
    key = page.NextKeyMarker;
    uploadId = page.NextUploadIdMarker;
  }
  return { objects, retainedObjects, uploads };
}
async function checkRetention(
  client: Store,
  bucket: RetirementBucket,
  objects: z.infer<typeof entry>[],
  deadline: number,
) {
  let enabled = false;
  try {
    const config = await client.send(
      new GetObjectLockConfigurationCommand({ Bucket: bucket.name }),
      { abortSignal: signal(deadline) },
    );
    if (config.ObjectLockConfiguration?.ObjectLockEnabled !== "Enabled")
      throw fail("retirement_bucket_cleanup_access_failed");
    enabled = true;
  } catch (error) {
    if (
      (error as { name?: string }).name !==
      "ObjectLockConfigurationNotFoundError"
    )
      throw fail("retirement_bucket_cleanup_access_failed");
  }
  if (!enabled) return;
  for (const object of objects) {
    // Delete markers have no retention; distinguish them in the caller's inventory.
    const input = {
      Bucket: bucket.name,
      Key: object.Key,
      VersionId: object.VersionId,
    };
    const missing = (error: unknown) =>
      [
        "NoSuchObjectLockConfiguration",
        "ObjectLockConfigurationNotFoundError",
      ].includes((error as { name?: string }).name ?? "");
    const retention = await client
      .send(new GetObjectRetentionCommand(input), {
        abortSignal: signal(deadline),
      })
      .catch((error) => {
        if (missing(error)) return { Retention: {} };
        throw error;
      });
    const hold = await client
      .send(new GetObjectLegalHoldCommand(input), {
        abortSignal: signal(deadline),
      })
      .catch((error) => {
        if (missing(error)) return { LegalHold: { Status: "OFF" as const } };
        throw error;
      });
    const detail = z
      .object({
        Mode: z.enum(["COMPLIANCE", "GOVERNANCE"]).optional(),
        RetainUntilDate: z.date().optional(),
      })
      .parse(retention.Retention ?? {});
    if (Boolean(detail.Mode) !== Boolean(detail.RetainUntilDate))
      throw fail("retirement_bucket_cleanup_access_failed");
    z.enum(["ON", "OFF"]).parse(hold.LegalHold?.Status);
    if (
      hold.LegalHold?.Status === "ON" ||
      (detail.RetainUntilDate && detail.RetainUntilDate.getTime() > Date.now())
    )
      throw fail("retirement_bucket_cleanup_locked");
  }
}

/** Apply-only cleanup. Temporary one-hour credentials are independent of the native State's old credentials. */
export async function emptyRetirementBuckets(options: BucketCleanupOptions) {
  if (!options.buckets.length) return;
  z.uuid().parse(options.jobId);
  const key = parseServiceAccountKey(options.key),
    request = options.request ?? fetch;
  const token = z.object({ access_token: z.string().min(1).max(32768) }).parse(
    await json(
      request,
      key.credentials.tokenEndpoint ??
        serviceAccountTokenEndpoints[key.credentials.aud],
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion: signedAssertion(key),
        }).toString(),
      },
      options.deadline,
    ),
  );
  const headers = {
    authorization: `Bearer ${token.access_token}`,
    "content-type": "application/json",
  };
  const sessions: {
    base: string;
    group: string;
    keyId?: string;
    client?: Store;
    bucket: RetirementBucket;
  }[] = [];
  let cleanupFailed = false;
  let failure: Error | undefined;
  z.array(
    z.strictObject({
      projectId: z.uuid(),
      region: regionSchema,
      name: bucketName,
      address: z.string().min(1).max(4096),
    }),
  )
    .max(64)
    .parse(options.buckets);
  try {
    let totalEntries = 0;
    const prepared: {
      bucket: RetirementBucket;
      client: Store;
      data: Awaited<ReturnType<typeof inventory>>;
    }[] = [];
    // Prepare and inspect every target before deleting any contents.
    for (const bucket of options.buckets) {
      const base = `https://object-storage.api.stackit.cloud/v2/project/${bucket.projectId}/regions/${bucket.region}`;
      z.object({
        project: z.literal(bucket.projectId),
        bucket: z.object({ name: z.literal(bucket.name) }),
      }).parse(
        await json(
          request,
          `${base}/bucket/${encodeURIComponent(bucket.name)}`,
          { method: "GET", headers },
          options.deadline,
        ),
      );
      const displayName = `lzc-retire-${options.jobId.slice(0, 8)}-${randomUUID().slice(0, 8)}`;
      const group = z
        .object({
          project: z.literal(bucket.projectId),
          credentialsGroup: z.object({
            credentialsGroupId: z.uuid(),
            displayName: z.literal(displayName),
          }),
        })
        .parse(
          await json(
            request,
            `${base}/credentials-group`,
            {
              method: "POST",
              headers,
              body: JSON.stringify({
                displayName,
              }),
            },
            options.deadline,
          ),
        );
      const session: (typeof sessions)[number] = {
        base,
        group: group.credentialsGroup.credentialsGroupId,
        bucket,
      };
      sessions.push(session);
      const rawCredential = await json(
        request,
        `${base}/access-key?credentials-group=${encodeURIComponent(session.group)}`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            expires: new Date(Date.now() + 3600000).toISOString(),
          }),
        },
        options.deadline,
      );
      session.keyId = z
        .object({
          project: z.literal(bucket.projectId),
          keyId: z.string().min(1).max(512),
        })
        .parse(rawCredential).keyId;
      const credential = z
        .object({
          project: z.literal(bucket.projectId),
          keyId: z.string().min(1).max(512),
          accessKey: z.string().min(1),
          secretAccessKey: z.string().min(1),
          expires: z.string().datetime({ offset: true }),
        })
        .parse(rawCredential);
      if (
        Date.parse(credential.expires) > Date.now() + 3700000 ||
        Date.parse(credential.expires) <= Date.now()
      )
        throw fail("retirement_bucket_cleanup_credentials_failed");
      const credentials = {
        accessKeyId: credential.accessKey,
        secretAccessKey: credential.secretAccessKey,
      };
      const client =
        options.client?.(bucket, credentials) ??
        retirementS3Compatibility(
          new S3Client({
            region: bucket.region,
            endpoint: `https://object.storage.${bucket.region}.onstackit.cloud`,
            forcePathStyle: true,
            credentials,
            maxAttempts: 1,
            followRegionRedirects: false,
            requestChecksumCalculation: "WHEN_REQUIRED",
            responseChecksumValidation: "WHEN_REQUIRED",
          }),
        );
      session.client = client;
      await options.progress?.(
        `Bucket ${bucket.name}: preparing cleanup access.\n`,
      );
      await waitForAccess(client, bucket, options.deadline);
      const data = await inventory(client, bucket, options.deadline);
      totalEntries += data.objects.length + data.uploads.length;
      if (totalEntries > maximum)
        throw fail("retirement_bucket_cleanup_incomplete");
      // Version markers are deleted too, but only actual versions can carry retention.
      // Retention errors are deliberately not bypassed, including governance mode.
      await checkRetention(
        client,
        bucket,
        data.retainedObjects,
        options.deadline,
      );
      await options.progress?.(
        `Bucket ${bucket.name}: ${data.objects.length} versions/markers, ${data.uploads.length} multipart uploads.\n`,
      );
      prepared.push({ bucket, client, data });
    }
    await options.beforeDelete?.();
    for (const { bucket, client, data } of prepared) {
      for (const item of data.uploads)
        await client.send(
          new AbortMultipartUploadCommand({
            Bucket: bucket.name,
            Key: item.Key,
            UploadId: item.UploadId,
          }),
          { abortSignal: signal(options.deadline) },
        );
      for (let offset = 0; offset < data.objects.length; offset += 1000) {
        const result = await client.send(
          new DeleteObjectsCommand({
            ChecksumAlgorithm: "MD5",
            Bucket: bucket.name,
            Delete: {
              Objects: data.objects.slice(offset, offset + 1000),
              Quiet: false,
            },
          }),
          { abortSignal: signal(options.deadline) },
        );
        if (
          result.Errors?.length ||
          result.Deleted?.length !==
            data.objects.slice(offset, offset + 1000).length
        )
          throw fail("retirement_bucket_cleanup_incomplete");
        await options.progress?.(
          `Bucket ${bucket.name}: ${Math.min(offset + 1000, data.objects.length)}/${data.objects.length} versions/markers removed.\n`,
        );
      }
      const remaining = await inventory(client, bucket, options.deadline);
      const current = await client.send(
        new ListObjectsV2Command({ Bucket: bucket.name, MaxKeys: 1 }),
        { abortSignal: signal(options.deadline) },
      );
      if (
        current.Name !== bucket.name ||
        current.Contents?.length ||
        current.IsTruncated !== false ||
        remaining.objects.length ||
        remaining.uploads.length
      )
        throw fail("retirement_bucket_cleanup_incomplete");
      await options.progress?.(
        `Bucket ${bucket.name}: empty; ready for OpenTofu deletion.\n`,
      );
    }
  } catch (error) {
    failure = bucketCleanupErrors.includes(
      (error as Error).message as (typeof bucketCleanupErrors)[number],
    )
      ? fail((error as Error).message as (typeof bucketCleanupErrors)[number])
      : fail("retirement_bucket_cleanup_unavailable");
  } finally {
    const cleanupDeadline = Date.now() + 60_000;
    for (const session of sessions.reverse()) {
      session.client?.destroy();
      let keyIds = session.keyId ? [session.keyId] : [];
      if (!session.keyId) {
        try {
          const listed = z
            .object({
              accessKeys: z
                .array(z.object({ keyId: z.string().min(1).max(512) }))
                .max(1),
            })
            .parse(
              await json(
                request,
                `${session.base}/access-keys?credentials-group=${encodeURIComponent(session.group)}`,
                { method: "GET", headers },
                cleanupDeadline,
              ),
            );
          keyIds = listed.accessKeys.map((item) => item.keyId);
        } catch {
          cleanupFailed = true;
        }
      }
      const paths = [
        ...keyIds.map(
          (id) =>
            `${session.base}/access-key/${keySegment(id)}?credentials-group=${encodeURIComponent(session.group)}`,
        ),
        `${session.base}/credentials-group/${encodeURIComponent(session.group)}`,
      ];
      for (const path of paths) {
        try {
          await json(
            request,
            path,
            { method: "DELETE", headers },
            cleanupDeadline,
          );
        } catch {
          cleanupFailed = true;
        }
      }
    }
  }
  if (cleanupFailed) throw fail("retirement_bucket_cleanup_credentials_failed");
  if (failure) throw failure;
}
