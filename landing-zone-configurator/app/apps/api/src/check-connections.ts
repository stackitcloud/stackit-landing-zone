import { checkDatabase, checkSecrets, safeFailure } from "./connectivity.js";
import { checkMailout } from "./notifications/mail.js";

for (const [service, check] of [
  ["postgresql", checkDatabase],
  ["secrets-manager", checkSecrets],
  ...(process.env.LZC_MAILOUT_ENABLED === "true"
    ? [["mailout", checkMailout] as const]
    : []),
] as const) {
  try {
    await check();
    console.log(JSON.stringify({ service, ok: true, tls: "verified" }));
  } catch (error) {
    console.error(
      JSON.stringify({ service, ok: false, error: safeFailure(error) }),
    );
    process.exitCode = 1;
  }
}
