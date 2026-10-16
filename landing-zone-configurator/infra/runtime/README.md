# Configurator runtime infrastructure

This root creates the `configurator` space in the existing `lzc-dev` CF organization,
assigns the deployment identity organization membership and the space developer role, and creates separate
PostgreSQL and read-only Secrets Manager application users. The platform's database
migration and Secrets provisioning credentials are not application credentials.

Apply runs only in `.github/workflows/configurator-runtime.yml`, with visible
`tofu init`, `tofu plan` and `tofu apply` steps. State is encrypted with its own
key at `configurator/lzc-dev/runtime/terraform.tfstate` in the workload bucket.
The same workflow-level `configurator-lzc-dev-mutation` concurrency group serializes
all Configurator mutations. No local remote-state applies are supported.

Platform outputs supply CF authentication and existing service IDs through private
files. The sensitive `app_environment` output is intended only for the backend CF
application; never expose it in logs, frontend builds, or unencrypted artifacts.
The app has no database schema grants yet and Secrets access is read-only for this
connectivity milestone. Tenant authorization and credential write operations need
a separate application implementation before onboarding users.

User authorization (2026-09-30): necessary Configurator deployment applies are
approved until the MVP milestone. Saved plans are still reviewed for scope and
GitHub Environment approval is retained. Changes stay on the feature branch.
