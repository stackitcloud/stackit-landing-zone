import { createCipheriv, scryptSync } from "node:crypto";
import { expect, it } from "vitest";
import { assistantTestTokenFromRecovery } from "../scripts/local-assistant-credentials.js";

const passphrase = "synthetic-original-state-key-for-tests";

function recovery(outputs: Record<string, unknown>) {
  const salt = Buffer.alloc(16, 1);
  const nonce = Buffer.alloc(12, 2);
  const cipher = createCipheriv(
    "aes-256-gcm",
    scryptSync(passphrase, salt, 32),
    nonce,
  );
  const data = Buffer.concat([
    cipher.update(JSON.stringify({ outputs })),
    cipher.final(),
  ]);
  return JSON.stringify({
    version: 1,
    kdf: "scrypt",
    cipher: "aes-256-gcm",
    salt: salt.toString("base64"),
    nonce: nonce.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  });
}

it("reads only the dedicated sensitive test token from authenticated encrypted recovery", () => {
  expect(
    assistantTestTokenFromRecovery(
      recovery({
        assistant_test_model_serving_token: {
          sensitive: true,
          value: "synthetic-ci-token",
        },
        model_serving_token: {
          sensitive: true,
          value: "synthetic-application-token",
        },
      }),
      passphrase,
    ),
  ).toBe("synthetic-ci-token");
});

it("never falls back to application credentials when the test token is missing", () => {
  expect(() =>
    assistantTestTokenFromRecovery(
      recovery({
        model_serving_token: {
          sensitive: true,
          value: "synthetic-application-token",
        },
      }),
      passphrase,
    ),
  ).toThrow("test_token_output_required");
});

it.each([
  { sensitive: false, value: "synthetic-ci-token" },
  { sensitive: true, value: "" },
  { sensitive: true, value: " " },
  { sensitive: true, value: 42 },
])("rejects invalid or non-sensitive token output %j", (output) => {
  expect(() =>
    assistantTestTokenFromRecovery(
      recovery({ assistant_test_model_serving_token: output }),
      passphrase,
    ),
  ).toThrow("sensitive_test_token_required");
});

it("rejects plaintext recovery rather than treating it as an encrypted snapshot", () => {
  expect(() =>
    assistantTestTokenFromRecovery(
      JSON.stringify({
        outputs: {
          assistant_test_model_serving_token: {
            sensitive: true,
            value: "synthetic-ci-token",
          },
        },
      }),
      passphrase,
    ),
  ).toThrow("encrypted_recovery_required");
});

it("rejects the wrong encryption key", () => {
  expect(() =>
    assistantTestTokenFromRecovery(recovery({}), `${passphrase}-wrong`),
  ).toThrow();
});

it("rejects an unauthenticated modified ciphertext", () => {
  const envelope = JSON.parse(recovery({}));
  const data = Buffer.from(envelope.data, "base64");
  data[0] = (data[0] ?? 0) ^ 1;
  envelope.data = data.toString("base64");
  expect(() =>
    assistantTestTokenFromRecovery(JSON.stringify(envelope), passphrase),
  ).toThrow();
});
