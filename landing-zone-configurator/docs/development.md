# Configurator development map

Start with [CONTRIBUTING](../../CONTRIBUTING.md) and the
[local application setup](../app/README.md). This page indexes technical
references; the [user guide](user-guide.md) describes product usage.

## Component contracts

| Area | Reference |
| --- | --- |
| Components, trust boundaries and diagrams | [Architecture](architecture.md) |
| Native schemas and compiler | [Common feature model](common-feature-model.md), [common editor](common-editor.md) |
| Template drafts and parameters | [Project template drafts](project-template-drafts.md), [parameters and bindings](template-parameters-and-bindings.md) |
| Authentication and organization binding | [Login](github-login.md) |
| Runner, jobs and state | [Plan execution](plan-execution.md), [Runner packaging](../deploy/runner/README.md) |
| Assistant facts, generation and qualification | [Knowledge contract](assistant-knowledge/README.md) |
| Operator IaC and encrypted state | [Infrastructure](../infra/README.md) |
| CI permissions and manual operations | [CI runbook](../infra/ci/README.md) |
| Packaging, migrations and promotion | [CF release](../deploy/cloud-foundry/README.md) |

The older [planning notes](planning.md) and
[Platform/Application design rationale](platform-application-architecture.md)
preserve design decisions, not current acceptance status or operator commands.
Use code, current contracts, tests and issue discussions for implementation state.
Historical workstation handoffs and run-specific acceptance logs are not part of
the maintained documentation.

## Validation versus cloud operations

| Workflow | Trigger and purpose |
| --- | --- |
| Validate | Every PR and main push; required Accelerator check names remain present, with change-aware execution |
| Validate Configurator | Relevant PRs/main pushes or manual dispatch; catalogue, app, browser, database and mock-IaC checks |
| Assistant live qualification | Manual/reusable; synthetic inference with a dedicated test token, no execution credentials |
| Verify Deployment / Publish Release | Manual Accelerator cloud verification/release; not ordinary PR validation |
| Configurator Bootstrap / Platform / Runtime | Manual main-branch plan, optional separately approved Apply |
| Configurator Release | Manual qualified build/promotion and optional development deployment |

Source merge does not dispatch deployment. Never put customer credentials,
state, private inventories or raw Plan output in issues, chat or test artifacts.
Local model receipts qualify only their exact source and configured models;
they do not replace the protected release workflow's qualification.
