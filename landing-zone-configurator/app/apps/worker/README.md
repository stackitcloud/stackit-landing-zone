# Plan runner

An ephemeral CF task per plan in a dedicated application and CF organisation.
The task receives only a short-lived capability for one persisted job, its ID and
the fixed broker origin. No PostgreSQL, Vault, Model Serving, GitHub or CF-manager
credentials are bound to it. The API is the trusted dispatcher/credential broker.

The broker rechecks ownership, role, credential version and organisation access
before returning the immutable tfvars and that job's STACKIT key once. OpenTofu
runs with an explicit environment allowlist without the broker ticket. The source
commit, provider lock and engine are packaged in CI; no user Terraform is executed.

`deploy/runner/run-plan.sh` contains the direct init, validate, plan and show commands.
This first implementation supports initial empty-state previews only. There is no
apply/destroy command or endpoint. Private key, logs, raw JSON and binary plan stay
in the ephemeral container and are removed; only value-free counts leave it.
These previews cannot later be applied. A future apply needs a new plan, explicit
approval and durable bootstrap-state recovery before it can be implemented.

The task has an 18-minute engine deadline; the persisted job expires after 25
minutes. API maintenance invalidates expired jobs and deletes finished/cancelled
runner apps. Failed dispatch is not retried automatically. Restart between database
insert and dispatch leaves a visible job that can be cancelled or expires.
See [execution and acceptance](../../../docs/plan-execution.md).
