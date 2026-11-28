import { createHash, generateKeyPairSync, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { S3Client } from "@aws-sdk/client-s3";
import { expect, it, vi } from "vitest";
import {
  emptyRetirementBuckets,
  retirementBuckets,
  retirementS3Compatibility,
} from "../packages/contracts/src/recovery/retirement-buckets.js";

const project = randomUUID(),
  control = randomUUID(),
  group = randomUUID();
const key = {
  credentials: {
    kid: "test-key",
    iss: "cleanup@sa.stackit.cloud",
    sub: randomUUID(),
    aud: "https://accounts.stackit.cloud",
    privateKey: generateKeyPairSync("rsa", { modulusLength: 2048 })
      .privateKey.export({ type: "pkcs8", format: "pem" })
      .toString(),
  },
};
const bucket = {
  projectId: project,
  region: "eu01" as const,
  name: "retirement-fixture",
  address: "module.management.stackit_objectstorage_bucket.tfstate",
};
function fixture(
  settings: {
    wireUrl?: string;
    lostCreateReply?: boolean;
    activationFailures?: number;
    refuseDelete?: boolean;
    count?: number;
    lock?: boolean;
    hold?: boolean;
    retention?: number;
    deleteError?: boolean;
    writer?: boolean;
    listError?: boolean;
    repeatedCursor?: boolean;
    wrongName?: boolean;
    credentialExpires?: string | null;
    revokeError?: boolean;
  } = {},
) {
  let versions = Array.from({ length: settings.count ?? 2 }, (_, i) => ({
    Key: `private/key-${i}`,
    VersionId: i === 0 ? "null" : `v${i}`,
  }));
  let markers = [{ Key: "deleted/private-key", VersionId: "marker" }];
  let uploads = [{ Key: "private/unfinished", UploadId: "upload" }];
  const api: { url: string; method: string; body: unknown }[] = [],
    calls: { name: string; input: Record<string, unknown> }[] = [];
  const progress: string[] = [];
  const request = vi.fn(async (url: unknown, init: RequestInit = {}) => {
    const target = String(url),
      method = init.method ?? "GET";
    api.push({
      url: target,
      method,
      body: init.body ? String(init.body) : null,
    });
    if (target.endsWith("/token"))
      return Response.json({ access_token: "OAUTH_SECRET_SENTINEL" });
    expect(init.redirect).toBe("error");
    expect(
      target.startsWith(
        `https://object-storage.api.stackit.cloud/v2/project/${project}/regions/eu01/`,
      ),
    ).toBe(true);
    if (method === "POST" && target.endsWith("/credentials-group"))
      return Response.json({
        project,
        credentialsGroup: {
          credentialsGroupId: group,
          displayName: JSON.parse(String(init.body)).displayName,
        },
      });
    if (method === "POST" && target.includes("/access-key?")) {
      const body = JSON.parse(String(init.body));
      expect(Date.parse(body.expires)).toBeGreaterThan(Date.now());
      expect(Date.parse(body.expires)).toBeLessThanOrEqual(
        Date.now() + 3600000,
      );
      if (settings.lostCreateReply) return new Response(null, { status: 503 });
      return Response.json({
        project,
        keyId: "padded+key==",
        accessKey: "S3_ACCESS_SENTINEL",
        secretAccessKey: "S3_SECRET_SENTINEL",
        expires:
          settings.credentialExpires === undefined
            ? body.expires
            : settings.credentialExpires,
      });
    }
    if (method === "GET" && target.includes("/bucket/"))
      return Response.json({ project, bucket: { name: bucket.name } });
    if (method === "GET" && target.includes("/access-keys?"))
      return Response.json({ accessKeys: [{ keyId: "padded+key==" }] });
    if (method === "DELETE") {
      if (settings.revokeError && target.includes("/access-key/"))
        return new Response(null, { status: 503 });
      return new Response(null, { status: 204 });
    }
    throw Error("Unexpected API call");
  });
  const send = vi.fn(
    async (command: {
      constructor: { name: string };
      input: Record<string, unknown>;
    }) => {
      const { name } = command.constructor,
        input = command.input;
      calls.push({ name, input });
      expect(input.Bucket).toBe(bucket.name);
      if (name === "HeadBucketCommand") {
        if (
          calls.filter((c) => c.name === name).length <=
          (settings.activationFailures ?? 0)
        )
          throw Object.assign(Error("key propagating"), {
            name: "InvalidAccessKeyId",
          });
        return {};
      }
      if (name === "GetObjectLockConfigurationCommand") {
        if (settings.lock)
          return { ObjectLockConfiguration: { ObjectLockEnabled: "Enabled" } };
        throw Object.assign(Error("no lock"), {
          name: "ObjectLockConfigurationNotFoundError",
        });
      }
      if (name === "GetObjectRetentionCommand")
        return {
          Retention: settings.retention
            ? {
                Mode: "COMPLIANCE",
                RetainUntilDate: new Date(settings.retention),
              }
            : {},
        };
      if (name === "GetObjectLegalHoldCommand")
        return { LegalHold: { Status: settings.hold ? "ON" : "OFF" } };
      if (name === "ListObjectVersionsCommand") {
        if (settings.listError)
          throw Error("PRIVATE_ERROR_WITH_SECRET_SENTINEL");
        const offset = input.KeyMarker
          ? Number(String(input.KeyMarker).slice(1))
          : 0;
        const slice = versions.slice(offset, offset + 1000);
        const next = versions.length > offset + 1000;
        return {
          Name: settings.wrongName ? "foreign-bucket" : bucket.name,
          Versions: slice,
          DeleteMarkers: !next ? markers : [],
          IsTruncated: settings.repeatedCursor || next,
          ...(settings.repeatedCursor || next
            ? {
                NextKeyMarker: settings.repeatedCursor
                  ? "k0"
                  : `k${offset + 1000}`,
                NextVersionIdMarker: "v",
              }
            : {}),
        };
      }
      if (name === "ListMultipartUploadsCommand")
        return { Bucket: bucket.name, Uploads: uploads, IsTruncated: false };
      if (name === "AbortMultipartUploadCommand") {
        uploads = [];
        return {};
      }
      if (name === "DeleteObjectsCommand") {
        const objects = (
          input.Delete as { Objects: { Key: string; VersionId: string }[] }
        ).Objects;
        expect(input).not.toHaveProperty("BypassGovernanceRetention");
        if (settings.deleteError)
          return {
            Errors: [{ Key: objects[0]?.Key, Code: "AccessDenied" }],
            Deleted: [],
          };
        versions = versions.filter(
          (v) =>
            !objects.some(
              (o) => o.Key === v.Key && o.VersionId === v.VersionId,
            ),
        );
        markers = markers.filter(
          (v) =>
            !objects.some(
              (o) => o.Key === v.Key && o.VersionId === v.VersionId,
            ),
        );
        return { Deleted: objects };
      }
      if (name === "ListObjectsV2Command")
        return {
          Name: bucket.name,
          Contents: settings.writer ? [{ Key: "new-object" }] : [],
          IsTruncated: false,
        };
      throw Error("Unexpected S3 operation");
    },
  );
  const destroy = vi.fn();
  const beforeDelete = vi.fn(async () => {
    if (settings.refuseDelete) throw Error("approval withdrawn");
  });
  const run = () =>
    emptyRetirementBuckets({
      buckets: [bucket],
      key,
      jobId: randomUUID(),
      deadline: Date.now() + 60000,
      request: request as typeof fetch,
      client: (_bucket, credentials) => {
        expect(credentials).toEqual({
          accessKeyId: "S3_ACCESS_SENTINEL",
          secretAccessKey: "S3_SECRET_SENTINEL",
        });
        if (settings.wireUrl)
          return retirementS3Compatibility(
            new S3Client({
              region: "eu01",
              endpoint: settings.wireUrl,
              forcePathStyle: true,
              credentials,
              maxAttempts: 1,
              requestChecksumCalculation: "WHEN_REQUIRED",
              responseChecksumValidation: "WHEN_REQUIRED",
            }),
          );
        return { send: send as unknown as S3Client["send"], destroy };
      },
      beforeDelete,
      progress: async (line) => {
        progress.push(line);
      },
    });
  const writes = () =>
    calls.filter((c) =>
      ["DeleteObjectsCommand", "AbortMultipartUploadCommand"].includes(c.name),
    );
  return { run, api, calls, destroy, progress, writes, beforeDelete };
}
it("empties null/old versions, delete markers and multipart uploads with an independent expiring access key", async () => {
  const f = fixture();
  await f.run();
  expect(f.writes().map((c) => c.name)).toEqual([
    "AbortMultipartUploadCommand",
    "DeleteObjectsCommand",
  ]);
  expect(f.api.filter((c) => c.method === "DELETE").map((c) => c.url)).toEqual([
    expect.stringContaining(
      `/access-key/padded+key==?credentials-group=${group}`,
    ),
    expect.stringContaining(`/credentials-group/${group}`),
  ]);
  expect(f.destroy).toHaveBeenCalledOnce();
  expect(f.progress.join("")).toContain("empty; ready for OpenTofu deletion");
  expect(f.progress.join("")).not.toMatch(/SENTINEL|private\/|padded/);
});
it("pages through all versions and deletes in bounded batches", async () => {
  const f = fixture({ count: 2001 });
  await f.run();
  expect(
    f.calls
      .filter((c) => c.name === "DeleteObjectsCommand")
      .map((c) => (c.input.Delete as { Objects: unknown[] }).Objects.length),
  ).toEqual([1000, 1000, 2]);
});
it.each([
  { lock: true, retention: Date.now() + 3600000 },
  { lock: true, hold: true },
])(
  "refuses retention/legal hold before any content is removed and revokes temporary credentials",
  async (settings) => {
    const f = fixture(settings);
    await expect(f.run()).rejects.toThrow("retirement_bucket_cleanup_locked");
    expect(f.writes()).toHaveLength(0);
    expect(f.api.filter((c) => c.method === "DELETE")).toHaveLength(2);
  },
);
it("allows expired retention without governance bypass and does not query retention on markers", async () => {
  const f = fixture({ lock: true, retention: Date.now() - 60000 });
  await f.run();
  expect(
    f.calls.filter((c) => c.name === "GetObjectRetentionCommand"),
  ).toHaveLength(2);
});
it.each([
  [{ deleteError: true }, "incomplete"],
  [{ writer: true }, "incomplete"],
  [{ listError: true }, "unavailable"],
  [{ repeatedCursor: true }, "incomplete"],
  [{ wrongName: true }, "scope_invalid"],
] as const)(
  "stops on incomplete or untrusted S3 observations (%j)",
  async (settings, code) => {
    const f = fixture(settings);
    await expect(f.run()).rejects.toThrow(`retirement_bucket_cleanup_${code}`);
    expect(f.api.filter((c) => c.method === "DELETE")).toHaveLength(2);
    expect(f.destroy).toHaveBeenCalledOnce();
  },
);
it("revokes the known key even when the service ignores the requested expiry", async () => {
  const f = fixture({ credentialExpires: null });
  await expect(f.run()).rejects.toThrow(
    "retirement_bucket_cleanup_unavailable",
  );
  expect(f.writes()).toHaveLength(0);
  expect(f.api.filter((c) => c.method === "DELETE")).toHaveLength(2);
});
it("attempts group cleanup even if key revocation fails and prevents continuation", async () => {
  const f = fixture({ revokeError: true });
  await expect(f.run()).rejects.toThrow(
    "retirement_bucket_cleanup_credentials_failed",
  );
  expect(f.api.filter((c) => c.method === "DELETE")).toHaveLength(2);
});
it("derives exact project/region/name from reviewed bucket IDs and rejects protected or mismatched scope", () => {
  const resource = {
    type: "stackit_objectstorage_bucket",
    provider: "test",
    address: bucket.address,
    id: `${project},eu01,${bucket.name}`,
    selectors: { project_id: project, name: bucket.name },
  };
  expect(retirementBuckets([resource], [control])).toEqual([bucket]);
  for (const value of [
    { ...resource, id: `${control},eu01,${bucket.name}` },
    { ...resource, id: `${project},eu03,${bucket.name}` },
    { ...resource, selectors: { project_id: control } },
  ])
    expect(() => retirementBuckets([value], [control])).toThrow();
  expect(() => retirementBuckets([resource, resource], [control])).toThrow();
});

it("uses real signed S3 HTTP requests and XML serialization for versions, markers and multipart cleanup", async () => {
  let deleted = false,
    aborted = false;
  const calls: string[] = [],
    errors: string[] = [];
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (
        ![`/${bucket.name}`, `/${bucket.name}/unfinished`].includes(
          url.pathname.replace(/\/$/, ""),
        )
      )
        throw Error("wrong bucket path");
      if (
        !request.headers.authorization?.includes(
          "AWS4-HMAC-SHA256 Credential=S3_ACCESS_SENTINEL/",
        )
      )
        throw Error("missing S3 signature");
      calls.push(`${request.method}:${url.search}`);
      response.setHeader("content-type", "application/xml");
      const xml = (body: string) => response.end(body);
      if (request.method === "HEAD") {
        response.statusCode = 200;
        return response.end();
      }
      if (url.searchParams.has("object-lock")) {
        response.statusCode = 404;
        return xml(
          "<Error><Code>ObjectLockConfigurationNotFoundError</Code><Message>No lock configuration</Message></Error>",
        );
      }
      if (url.searchParams.has("versions"))
        return xml(
          `<ListVersionsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>${bucket.name}</Name><IsTruncated>false</IsTruncated>${deleted ? "" : "<Version><Key>terraform.tfstate</Key><VersionId>null</VersionId><IsLatest>true</IsLatest></Version><DeleteMarker><Key>old.tfstate</Key><VersionId>marker</VersionId><IsLatest>true</IsLatest></DeleteMarker>"}</ListVersionsResult>`,
        );
      if (url.searchParams.has("uploads"))
        return xml(
          `<ListMultipartUploadsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Bucket>${bucket.name}</Bucket><IsTruncated>false</IsTruncated>${aborted ? "" : "<Upload><Key>unfinished</Key><UploadId>upload</UploadId></Upload>"}</ListMultipartUploadsResult>`,
        );
      if (
        request.method === "DELETE" &&
        url.searchParams.get("uploadId") === "upload"
      ) {
        aborted = true;
        response.statusCode = 204;
        return response.end();
      }
      if (request.method === "POST" && url.searchParams.has("delete")) {
        let body = "";
        for await (const part of request) body += part.toString();
        if (
          !body.includes("<VersionId>null</VersionId>") ||
          !body.includes("<VersionId>marker</VersionId>")
        )
          throw Error("version IDs missing from delete XML");
        if (
          request.headers["content-md5"] !==
          createHash("md5").update(body).digest("base64")
        )
          throw Error("invalid Content-MD5");
        if (
          request.headers["x-amz-checksum-crc32"] ||
          request.headers["x-amz-sdk-checksum-algorithm"]
        )
          throw Error("unexpected optional checksum header");
        if (!request.headers.authorization.includes("content-md5"))
          throw Error("checksum was not signed");
        if (request.headers["x-amz-bypass-governance-retention"])
          throw Error("unexpected retention bypass");
        deleted = true;
        return xml(
          '<DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Deleted><Key>terraform.tfstate</Key><VersionId>null</VersionId></Deleted><Deleted><Key>old.tfstate</Key><VersionId>marker</VersionId></Deleted></DeleteResult>',
        );
      }
      if (url.searchParams.get("list-type") === "2")
        return xml(
          `<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>${bucket.name}</Name><KeyCount>0</KeyCount><IsTruncated>false</IsTruncated></ListBucketResult>`,
        );
      throw Error("unexpected S3 request");
    } catch (error) {
      errors.push((error as Error).message);
      response.statusCode = 500;
      response.end("<Error><Code>InternalError</Code></Error>");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const f = fixture({
      wireUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    });
    await f.run().catch((error) => {
      throw Error(
        `${(error as Error).message}; protocol fixture errors: ${errors.join(", ")}; requests: ${calls.join(", ")}`,
      );
    });
    expect(errors).toEqual([]);
    expect(deleted && aborted).toBe(true);
    expect(calls.some((c) => c.startsWith("POST:"))).toBe(true);
    expect(f.api.filter((c) => c.method === "DELETE")).toHaveLength(2);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it("keeps the standalone Accelerator cleanup helper usable without the Configurator", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const result = spawnSync(
    "python3",
    [
      "-m",
      "unittest",
      "discover",
      "-s",
      fileURLToPath(new URL("../../../src/retirement/", import.meta.url)),
      "-p",
      "test_empty_bucket.py",
    ],
    { encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } },
  );
  expect(result.status, result.stderr).toBe(0);
});

it("does not repeat an ambiguous key creation and discovers/revokes only its own temporary group's key", async () => {
  const f = fixture({ lostCreateReply: true });
  await expect(f.run()).rejects.toThrow(
    "retirement_bucket_cleanup_access_failed",
  );
  expect(
    f.api.filter((c) => c.method === "POST" && c.url.includes("/access-key?")),
  ).toHaveLength(1);
  expect(
    f.api
      .filter((c) => c.method === "GET" && c.url.includes("/access-keys?"))
      .map((c) => c.url),
  ).toEqual([
    expect.stringContaining(`/access-keys?credentials-group=${group}`),
  ]);
  expect(f.api.filter((c) => c.method === "DELETE")).toHaveLength(2);
  expect(f.writes()).toHaveLength(0);
});

it("waits for a newly issued S3 key to propagate without creating a second key", async () => {
  const f = fixture({ activationFailures: 1 });
  await f.run();
  expect(f.calls.filter((c) => c.name === "HeadBucketCommand")).toHaveLength(2);
  expect(
    f.api.filter((c) => c.method === "POST" && c.url.includes("/access-key?")),
  ).toHaveLength(1);
});

it("rechecks execution approval after preflight and performs no content writes if it is withdrawn", async () => {
  const f = fixture({ refuseDelete: true });
  await expect(f.run()).rejects.toThrow(
    "retirement_bucket_cleanup_unavailable",
  );
  expect(f.beforeDelete).toHaveBeenCalledOnce();
  expect(f.writes()).toHaveLength(0);
  expect(f.api.filter((c) => c.method === "DELETE")).toHaveLength(2);
});
