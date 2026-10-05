import { randomBytes } from "node:crypto";
import { expect, it } from "vitest";
import {
  ArtifactCrypto,
  canonicalBase64,
} from "../apps/api/src/plans/crypto.js";
import {
  s3BackendConfiguration,
  s3BackendDescriptorSchema,
} from "../packages/contracts/src/backend.js";

it("encrypts artifacts without plaintext and authenticates tenant, owner and key", () => {
  const crypto = new ArtifactCrypto(randomBytes(32).toString("base64"));
  const plain = Buffer.from("private terraform state with credentials");
  const sealed = crypto.encrypt(plain, "tenant", "owner", "state:config");
  expect(sealed.includes(plain)).toBe(false);
  expect(crypto.decrypt(sealed, "tenant", "owner", "state:config")).toEqual(
    plain,
  );
  for (const [tenant, owner, key] of [
    ["other", "owner", "state:config"],
    ["tenant", "other", "state:config"],
    ["tenant", "owner", "artifact:config"],
  ])
    expect(() => crypto.decrypt(sealed, tenant!, owner!, key!)).toThrow();
  sealed[sealed.length - 1] = sealed[sealed.length - 1]! ^ 1;
  expect(() =>
    crypto.decrypt(sealed, "tenant", "owner", "state:config"),
  ).toThrow();
});

it("rejects noncanonical base64 and keys other than exactly 32 bytes", () => {
  for (const value of ["Zg", "Zh==", "Zg==\n", "", "!!!!"])
    expect(() => canonicalBase64(value, 32)).toThrow();
  expect(
    () => new ArtifactCrypto(randomBytes(31).toString("base64")),
  ).toThrow();
  expect(() =>
    canonicalBase64(Buffer.alloc(33).toString("base64"), 32),
  ).toThrow();
});

it("renders an independently usable S3 backend without credentials", () => {
  const descriptor = {
    bucket: "customer-tfstate",
    endpoint: "https://object.storage.eu01.onstackit.cloud",
    region: "eu01",
    key: "terraform.tfstate",
    useLockfile: true,
  } as const;
  const configuration = JSON.parse(s3BackendConfiguration(descriptor));
  expect(
    s3BackendDescriptorSchema.safeParse({ ...descriptor, key: "state\nfile" })
      .success,
  ).toBe(false);
  expect(configuration.terraform.backend.s3).toMatchObject({
    bucket: descriptor.bucket,
    key: descriptor.key,
    use_lockfile: true,
    endpoints: { s3: descriptor.endpoint },
  });
  expect(
    s3BackendDescriptorSchema.safeParse({
      ...descriptor,
      endpoint: "http://127.0.0.1",
    }).success,
  ).toBe(false);
  expect(
    s3BackendDescriptorSchema.safeParse({
      ...descriptor,
      secretAccessKey: "secret",
    }).success,
  ).toBe(false);
});
