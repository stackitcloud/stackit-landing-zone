<a id="adr-0001--sprache-und-anwendungsstack"></a>
# ADR 0001 – Language and application stack

[English](0001-application-stack.md) | [Deutsch](0001-application-stack.de.md)

As of 2026-09-29. **Status: accepted in the planning discussion.**

<a id="entscheidung"></a>
## Decision

TypeScript as the primary language for the React interface, Node.js backend and worker. Shared domain model, runtime schemas, API contracts, configuration compiler and graph model as internal packages. Backend: Fastify; frontend: React with Vite. npm workspaces with lockfile. Runtime: Node.js 24.21.0 LTS and npm 11.19.0; concrete package versions in `app/package.json` and the workspace manifests.

Limit Go to a small HCL import adapter. OpenTofu runs as a pinned external process in isolated Runners. The app therefore does not need to be written in Go. Only choose additional Go for a Runner supervisor when packaging or process control demonstrates a concrete advantage.

<a id="warum-das-zum-configurator-passt"></a>
## Why this suits the Configurator

The main work consists of forms, validation, GitHub/cloud APIs, chat streaming and asynchronous job coordination. TypeScript enables shared contracts and domain logic between browser and backend. No language switch is required for each schema change. Still always validate external inputs at runtime: TypeScript types are not an authorization or validation boundary.

OpenTofu handles the actual infrastructure work. CPU-intensive processing of large Plans and HCL import belong in bounded worker/adapter processes, not in the HTTP event loop. Raw backend performance is not the deciding criterion for the expected API/I/O tasks.

Cloud Foundry documents both [Node.js](https://docs.cloudfoundry.org/buildpacks/node/) and [Go](https://docs.cloudfoundry.org/buildpacks/go/index.html). STACKIT describes deployment with buildpacks and other artifact formats; versions offered at the target must be checked during the spike. [STACKIT app deployment](https://docs.stackit.cloud/products/runtime/cloud-foundry/getting-started/push-your-app-to-cloud-foundry/)

For HCL, the maintainer project provides a Go parser and Go APIs. This motivates the targeted Go adapter, not the need for an entire Go backend. [HashiCorp HCL](https://github.com/hashicorp/hcl)

<a id="alternativen"></a>
## Alternatives

| Option | Strength for this task | Effort / disadvantage |
| --- | --- | --- |
| TypeScript for web/API/worker plus small Go adapter | Shared domain logic, short paths between editor and API | Maintain Node dependencies; small additional Go toolchain |
| React/TypeScript plus Go backend | Direct HCL integration, compact backend binaries, good process tools | Two full application stacks; generate contracts and align validation boundaries |
| React/TypeScript plus Python backend | Useful with substantial Python experience or custom ML processing | No clear added value for pure Model Serving API usage; also two stacks |
| React/TypeScript plus Java/Kotlin backend | Useful with an existing JVM team and established operational standards | More initial structure for this new project without such requirements |

React plus Go would be my second choice, especially with a backend team predominantly experienced in Go. Python is not required just because a chatbot is part of the app: the model is called as a service.

<a id="bewusste-grenzen"></a>
## Deliberate boundaries

- Separate CF deployables for API and worker; no long OpenTofu runs in HTTP requests.
- Shared packages contain no server secrets; browser bundles are checked for them.
- Security and tenant isolation come from architecture, authorization and tests, not the language.
- No unrestricted HCL or shell execution by the model.
- Team experience can change the recommendation. Record existing TypeScript/Go experience and maintenance responsibilities before implementation.

<a id="abschlusskriterien"></a>
## Completion criteria

- [x] Jointly confirm the primary language.
- [x] Define frontend/backend framework, package manager and supported runtime versions.
- [ ] Test a minimal CF deployment of web/API/worker.
- [ ] Validate HCL import with all eight templates in a prototype.
- [ ] Define schema contracts, build boundaries and versioning.

The local foundation is implemented and tested. CF deployment and HCL adapter remain open. Node.js 24 was chosen as the LTS line; updates are made deliberately through the runtime pin and lockfile. [Node.js release status](https://nodejs.org/en/about/previous-releases)
