# Terraform Diagram Generation

This repository contains a Mermaid diagram generator for the landing zone architecture.

Since v1.0.0, architecture variants are defined by tfvars files in `src/config/*.tfvars` (instead of multiple `main.tf` example folders).

## Generate diagrams

Run from repository root:

```bash
python3 docs/diagrams/scripts/generate_example_architecture.py
```

Default behavior:

- If `examples/` exists: scans `examples/**/main.tf` (legacy mode).
- If `examples/` is missing and `src/config/*.tfvars` exists: generates one diagram per tfvars variant using `src/main.tf`.

Current variant outputs are:

- `docs/diagrams/standalone-architecture.mmd(.md)`
- `docs/diagrams/hub-and-spoke-architecture.mmd(.md)`
- `docs/diagrams/hub-and-spoke-firewall-architecture.mmd(.md)`

## CI pipeline (automatic generation)

The repository includes a GitHub Actions workflow at `.github/workflows/generate-architecture-diagrams.yml`.

Behavior:

- `pull_request`: if relevant files changed (`src/**`, `modules/**`, `docs/diagrams/assets/**`, or the generator), diagrams are generated and CI fails when `docs/diagrams/*` is outdated.
- `push` to `main`: for the same file changes, diagrams are generated, rendered as SVG (`docs/diagrams/*.svg`), and updated diagram files are committed automatically.
- `workflow_dispatch`: manual run from the Actions tab.

This keeps generated architecture diagrams up to date in the repository.

## Local usage remains unchanged

For local development and quick tests, run the generator exactly as before:

```bash
python3 docs/diagrams/scripts/generate_example_architecture.py --out-dir docs/diagrams
```

Optional local SVG rendering (same output format used in CI):

```bash
npm install -g @mermaid-js/mermaid-cli
for diagram in docs/diagrams/*.mmd; do
  mmdc -i "$diagram" -o "${diagram%.mmd}.svg" -c .github/mermaid-config.json -p .github/mermaid-puppeteer-config.json
done
```

Generate only from a specific folder or `main.tf` file:

```bash
python3 docs/diagrams/scripts/generate_example_architecture.py --example-folder src
```

Use overview mode (default, recommended):

```bash
python3 docs/diagrams/scripts/generate_example_architecture.py --detail-level theme
```

Use full resource-level details:

```bash
python3 docs/diagrams/scripts/generate_example_architecture.py --detail-level full
```

Use semantic resource inference with optional STACKIT AI enrichment:

```bash
export STACKIT_MODEL_API_KEY="<token>"
python3 docs/diagrams/scripts/generate_example_architecture.py \
  --detail-level full \
  --semantic-provider stackit-ai
```

## Icons

Local STACKIT service icons from `assets/**/*.svg` (in `docs/diagrams/assets/`) are enabled by default.

```bash
python3 docs/diagrams/scripts/generate_example_architecture.py --stackit-icons architecture-symbols
```

Override icon directory:

```bash
python3 docs/diagrams/scripts/generate_example_architecture.py --stackit-icons-assets-dir assets
```

If no matching icon is found, a semantic fallback badge is rendered.

## Semantic options

Tune model and confidence threshold:

```bash
python3 docs/diagrams/scripts/generate_example_architecture.py \
  --detail-level full \
  --semantic-provider stackit-ai \
  --stackit-model cortecs/Llama-3.3-70B-Instruct-FP8-Dynamic \
  --semantic-threshold 0.75
```

Enable AI grouping:

```bash
python3 docs/diagrams/scripts/generate_example_architecture.py \
  --detail-level full \
  --semantic-provider stackit-ai \
  --semantic-grouping ai
```

Reproducible semantic modes:

```bash
# Learn mode (default): AI decisions are persisted
python3 docs/diagrams/scripts/generate_example_architecture.py \
  --detail-level full \
  --semantic-provider stackit-ai \
  --semantic-grouping ai \
  --semantic-mode learn

# Locked mode: no new AI calls, only lockfile decisions
python3 docs/diagrams/scripts/generate_example_architecture.py \
  --detail-level full \
  --semantic-provider stackit-ai \
  --semantic-grouping ai \
  --semantic-mode locked
```

Semantic decision data is stored in `.semantics/diagram.lock.json` (configurable via `--semantic-lock-file`).

## Preview in VS Code

1. Install recommended workspace extensions.
2. Open a generated markdown file, for example `docs/diagrams/hub-and-spoke-architecture.mmd.md`, and run `Markdown: Open Preview to the Side`.
3. Open a `.mmd` file, for example `docs/diagrams/hub-and-spoke-architecture.mmd`, and run the Mermaid preview command.

## What is modeled

- Module blocks from `src/main.tf` (variant mode) or legacy example `main.tf` files.
- Module dependencies inferred from `module.<name>` references.
- Module-internal Terraform resources from `modules/*/*.tf` as child elements.
- Detail levels:
  - `theme` (default): grouped architecture themes per module.
  - `full`: resource-level detail.

Generated diagrams include semantic styling and a legend (Networking, Compute, Kubernetes, Storage, Access/RBAC).