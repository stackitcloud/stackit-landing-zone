# HCL import adapter

[English](README.md) | [Deutsch](README.de.md)

<a id="hcl-importadapter"></a>

Small Go adapter using [HashiCorp HCL v2](https://pkg.go.dev/github.com/hashicorp/hcl/v2/hclparse).
It reads the checked-in `.tfvars` from `src/config`, evaluates only
expressions without a variable/function context and generates the versioned
JSON catalogue for the web app. No Terraform/OpenTofu invocation, network service
or secret resolution. Domain rules remain in the TypeScript domain package.

From this directory:

```sh
# Einmal vor den Roundtrip-Tests: in ../../app npm ci und npm run build:packages
go test ./...
go run .          # Katalog aktualisieren
go run . -check   # CI: veralteten Katalog erkennen, keine Dateien ändern
```

`go.mod`/`go.sum` pin dependencies. CI uses Go 1.27.1.
The catalogue contains `schemaVersion: 1` and, per template, its ID, repository path,
SHA-256 of the unchanged source file and all active attribute values.
Comments are not configuration and are not imported. Unsupported
references, functions, HCL blocks and syntax errors abort generation.

The current adapter processes only trusted repository templates
during development/build. It is not an API for executing arbitrary user files.
No default values from `variables.tf` are materialized automatically.
Untouched attributes are preserved when creating a standalone draft.

When changing `src/config`, regenerate the catalogue and commit it together with the changes.
Validation and release check the catalogue against the sources; an outdated version
is not published. The Accelerator files themselves are not changed.

<a id="accelerator-eingabeinventar"></a>

## Accelerator input inventory

All root variables, including nested types, optional defaults and
validation blocks, can be extracted from the trusted Accelerator:

```sh
go run . -variables-source ../../../src/variables.tf -output ../../docs/accelerator-inputs.json
go run . -variables-source ../../../src/variables.tf -output ../../app/packages/domain/src/accelerator-inputs.json
go run . -variables-source ../../../src/variables.tf -output ../../docs/accelerator-inputs.json -check
```

Sensitive defaults are omitted. The `dynamic` type explicitly remains
unresolved and requires a domain schema from the module wiring.
`nestedDefaults.children[""]` denotes a map/list element type. The inventory
does not replace domain dependencies or generate a Terraform variable UI.

The second inventory file is the build artifact in the domain package. CI checks both
files against the same source. The common compiler and legacy migration are described in
the [domain README](../../app/packages/domain/README.md).
