# Domain model

[English](README.md) | [Deutsch](README.de.md)

<a id="fachmodell"></a>

Shared logic for UI, API and chat proposals. No secret resolution in this
package. The common editor and fork persistence use model v3. Existing
v1/v2 drafts remain editable in the previous editor and can explicitly
be switched to the common editor.

<a id="gemeinsames-modell-v3"></a>

## Common model (v3)

- `features.ts`: all 28 root inputs in domain groups; field catalogue including
  nested types and separately identified protected inputs.
- `common-document.ts`: import all eight templates, migrate versions 1/2,
  stable object identities, shared project/area projections and export.
- `common-validation.ts`: assess references, configuration combinations and known
  execution limits separately. No substitute for provider validation or Plan.
- `accelerator-inputs.json`: generated type contract, not a second manually maintained
  Terraform type definition. Freshness checks in CI; see the HCL adapter README.

`createCommonConfiguration(templateId, id)` copies a trusted template.
`migrateCommonConfiguration(legacy)` first compiles using the old contract;
subsequent export remains byte-identical, including folder changes in v2.
`readCommonConfiguration` checks structure, provenance, inputs and object identities.
Incomplete domain information may remain for further editing.

Internally, the feature groups contain the explicit engine inputs. The interface
should build domain-specific editors on top, not a generic Terraform variable form.
`commonProjects` provides Public, Corporate and Sandbox in the same view with
target folder and area reference. `commonNetworkAreas` provides single and regional
areas without rewriting their sources when reading.

`setCommonInput` changes values, **not** a collection's identity list.
Collection changes require explicit operations with a consistent identity list.
`renameCommonProject` preserves the UI identity and updates namespace references;
Terraform addresses still change. The future UI must request confirmation
for this. `removeCommonNetworkArea` blocks existing project/service references.
`editor-document.ts` adds project creation/removal, safe collection changes
and the compatible persistence/editor bridge.

`compileCommonConfiguration` / `exportCommonTfvars` preserve omitted values,
explicit `null` and explicit configuration. `effectiveInput` supplies only
display/validation values with defaults; this projection must not be exported back.
Regional `map(any)` inputs are accepted only for fields actually wired in the root;
their defaults are not indiscriminately taken from the single-region model.
Unknown attributes and declared secret inputs are rejected,
not silently removed. This does not make a free-text field a secret scanner.

`assessCommonConfiguration` returns configuration errors, warnings, known
execution limits and required phases. An empty result is **not**
deployment approval. Production v3 execution still lacks Runner integration,
credential bindings, complete domain checks, provider/module tests and
server-enforced Runner capabilities. The existing Plan endpoint
continues to accept v1/v2 only. Customer Apply remains subject to separate approval.

<a id="prüfungen"></a>

## Checks

From `landing-zone-configurator/app` with Node 24 and `node_modules` installed:

```sh
npm run check
node scripts/prepare-common-contract.ts
tofu -chdir=../.local/common-contract init -backend=false -input=false -no-color
tofu -chdir=../.local/common-contract test -no-color
```

The ten native tests check the unchanged root variable contract without providers,
backend or cloud access: eight templates plus two Object Lock default cases.
Standalone specifically expects the known validation error from issue #84.
These are not complete module/resource plans. The native HCL roundtrip in
`tools/hcl-adapter` additionally compares all exported values semantically.

<a id="gemeinsamer-editor-und-speicherung"></a>

## Common editor and persistence

`readConfigurationRecord` accepts v1/v2/v3; `saveEditorDraft` checks the respective
contract. The GitHub API stores JSON and tfvars atomically and retains the existing
conflict/path checks. Before using deployment credentials, `prepareSnapshot`
rejects v3 server-side with `configuration_execution_not_supported`.
This limits execution, not editing and persistence.

The field catalogue distinguishes form fields, missing protected bindings and
the ineffective folder description. Tests require German domain labels
for all non-sensitive schema fields. UI instructions and
acceptance: [common editor](../../../docs/common-editor.md).
