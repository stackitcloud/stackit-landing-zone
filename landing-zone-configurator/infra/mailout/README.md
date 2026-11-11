# Configurator MailOut operations

[English](README.md) | [Deutsch](README.de.md)

This directory provisions the operator's sending integration, not a customer
Landing Zone feature. It uses the official MailOut v1beta1 and DNS v1 APIs because
the pinned STACKIT Terraform provider does not provide MailOut resources.
`environments/lzc-dev.json` is the reviewed declarative desired state. The reconciler
only creates missing dedicated resources and validates existing ones; it never
rewrites existing DNS policies or automatically rotates/deletes credentials.
Production is deliberately not an accepted target in this first Dev rollout.

## Provision and bind

Use Node 24.21.0 and the official STACKIT CLI. The operator key needs MailOut access
in Dev and DNS access to the existing parent zone. Keep keys outside version control.
The application route/domain is not changed; only the sending subdomain's SPF,
DMARC, DKIM and return-path records are managed. Do not remove these records after
validation: MailOut checks them continuously.

```sh
# From the repository root; the default private directory is ignored and mode 0700.
export STACKIT_SERVICE_ACCOUNT_KEY_PATH=/secure/operator-key.json
node landing-zone-configurator/infra/mailout/provision.mjs plan
# Inspect the private plan and the exact Dev DNS scope before applying.
node landing-zone-configurator/infra/mailout/provision.mjs apply
```

Domain creation and DNS validation are asynchronous. If DNS records are not ready,
or the summary reports `ready:false`, inspect state and rerun the same command
later. It discovers the existing domain, leaves matching records alone and refuses
conflicting records. POST failures are not blindly retried. An ambiguous sender
creation may require a deliberately reviewed credential recovery/rotation.

The one-time sender response is immediately saved privately, before endpoint
validation. Successful reconciliation writes `.local/mailout/bindings.private.json`
(file 0600), with the exact project/domain/sender IDs and SMTP credentials. Preserve
this file during setup; never print it, attach it to an issue or commit it. An
existing sender without its credential is a recovery error, not a reason to create
another sender or silently delete the old one. Only proceed when `ready:true`.

```sh
# Explicitly publish the private binding to the protected Dev Environment.
gh secret set LZC_MAILOUT_BINDINGS --repo stackitcloud/stackit-landing-zone \
  --env lzc-dev-release < landing-zone-configurator/.local/mailout/bindings.private.json
```

The protected GitHub Environment secret is the durable operational binding used by
subsequent releases; the local file is the private bootstrap/recovery copy. The
manifest remains in Git and provider IDs can also be read from MailOut. Protect
these together with the existing encrypted platform/runtime recovery snapshots and
artifact-encryption key. GitHub does not reveal an existing secret to a workstation;
recover it through an explicitly authorized protected job or rotate deliberately.
The application needs only SMTP credentials, not the operator's cloud key. SMTP
credentials go to backend CF bindings, never web assets, Runner or migration tasks.

The manual Configurator Release workflow reads the secret, verifies stage/project,
sender domain and official SMTP host, then includes it in final app bindings.
Staging mail is always disabled. An absent binding leaves mail disabled while inbox
and preferences continue working. No source merge automatically deploys the feature.
After activation the release compares the actual CF environment with every approved
MailOut setting before running the SMTP check. Missing, disabled or stale bindings
fail the release; connection checks cannot silently skip configured email delivery.
The existing artifact-encryption key encrypts invitation tokens with separate,
context-bound purposes; preserve that key while encrypted pending jobs exist.

## Delivery diagnostics and recovery

- The user inbox and invitation list expose bounded queued/sending/accepted/
  suppressed/failed/uncertain states. They do not claim inbox delivery.
- SMTP `accepted` means the provider accepted the message. Inspect the MailOut
  project's sending-domain message history, suppression list and metrics for
  actual delivery, bounce or complaint outcomes. Provider bounce processing is
  automatic; do not remove suppressions merely to force another attempt.
- Retryable SMTP outcomes have at most five attempts. Lost DATA acknowledgement or
  an abandoned lease is quarantined as `uncertain`; no automatic resend. Inspect
  provider history using the stable `<notification-UUID@sender-domain>` Message-ID
  before considering a new notification. Never rerun infrastructure to resend mail.
- Check application logs for fixed `notification_delivery_failed` diagnostics and
  verify DB access/availability if queue maintenance stops. Do not enable Nodemailer
  raw SMTP debugging in shared logs; it can reveal addresses and message content.
- Disabling the instance binding sets `LZC_MAILOUT_ENABLED=false` on the next manual
  release. Pending messages remain subject to current rights/preferences and a
  seven-day eligibility limit. Inbox metadata is retained for 90 days.
- For rotation, explicitly review/create a new dedicated sender generation, capture
  and publish its private binding, deploy and verify it, then revoke the exact old
  sender. Never delete a sender merely because a local file is missing.

## Verification

```sh
node --test landing-zone-configurator/infra/mailout/*.test.mjs
cd landing-zone-configurator/app
npm run check
# Local dedicated PostgreSQL test DB only:
LZC_TEST_DATABASE_URL=postgres://.../configurator_test npm run test:database
npx playwright test e2e/notifications.spec.ts e2e/invitations.spec.ts
```

Ordinary CI uses fake SMTP and local PostgreSQL/browser fixtures; it sends no real
mail. Real Dev acceptance is a separate authorized operation. Users choose their
own topics, without a workspace administrator overriding their preferences.
See the [user and delivery contract](../../docs/notifications.md).

Official contracts checked 2026-11-11:
[MailOut API](https://docs.api.stackit.cloud/oas/mailout/version/v1beta1),
[MailOut domain setup](https://docs.stackit.cloud/products/messaging/mailout/how-tos/create-setup-and-manage-sending-domains/),
[SMTP submission](https://docs.stackit.cloud/products/messaging/mailout/how-tos/send-mails/).
