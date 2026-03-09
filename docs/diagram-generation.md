# Terraform Example Diagram Generation (MVP)

This repository includes a small MVP generator that creates Mermaid architecture diagrams from Terraform module usage in the examples.

## Generate diagrams

Run from repository root:

```bash
python3 scripts/generate_example_architecture.py
```

Default behavior:

- scans all `main.tf` files under `examples/**`
- generates one Mermaid markdown file per discovered example

Generate for one specific example folder only:

```bash
python3 scripts/generate_example_architecture.py --example-folder examples/02-hub-spoke
```

Use overview mode (default, recommended for readability):

```bash
python3 scripts/generate_example_architecture.py --example-folder examples/02-hub-spoke --detail-level theme
```

Use full resource-level details:

```bash
python3 scripts/generate_example_architecture.py --example-folder examples/02-hub-spoke --detail-level full
```

You can also point to another examples root:

```bash
python3 scripts/generate_example_architecture.py --examples-root examples
```

Generated files:

- `docs/diagrams/01-standalone-architecture.mmd.md`
- `docs/diagrams/02-hub-spoke-architecture.mmd.md`
- `docs/diagrams/01-standalone-architecture.mmd`
- `docs/diagrams/02-hub-spoke-architecture.mmd`

## Preview `.md` and `.mmd` directly in VS Code

This repository is configured to preview Mermaid without converting to HTML or SVG first.

1. Install the recommended workspace extensions when VS Code prompts you:
  - `bierner.markdown-mermaid`
  - `d8aware.vscode-mermaid-extension`
2. Open a Markdown diagram file (for example `docs/diagrams/02-hub-spoke-architecture.mmd.md`) and run `Markdown: Open Preview to the Side` (`Cmd+K V`).
3. Open a raw Mermaid file (for example `docs/diagrams/02-hub-spoke-architecture.mmd`) and run the Mermaid preview command from the Command Palette (`Cmd+Shift+P`, then search for `Mermaid` + `Preview`).

Notes:

- `.mmd` is mapped to Mermaid language in `.vscode/settings.json`.
- `.mmd.md` is mapped to Markdown and rendered by the built-in Markdown preview.

## What is modeled

- Module blocks from the example `main.tf` files
- Module dependencies inferred from `module.<name>` references inside module blocks
- Module-internal Terraform resources (derived from `modules/*/*.tf`) as child elements
- Two levels are available:
  - `theme` (default): grouped architecture themes per module (better overview)
  - `full`: all detected resource types per module
- High-level grouping into:
  - Resource Manager
  - Connectivity
  - Projects

This is intentionally a fast MVP. It can later be extended with richer semantics from Terragrunt and additional rules.

Generated diagrams now include semantic styling (colors/icons) and a legend to distinguish architecture domains such as Networking, Compute, Kubernetes, Storage, and Access/RBAC.