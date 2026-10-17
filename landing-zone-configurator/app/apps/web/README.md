# Web interface

[English](README.md) | [Deutsch](README.de.md)

<a id="web-oberfläche"></a>

Planned: React/TypeScript, domain-specific forms, topology, chat and Plan/Run view. No cloud or GitHub tokens in the browser.

<a id="template-editor-erster-fachlicher-stand"></a>

## Template editor (initial domain implementation)

- Eight templates generated from `src/config`, with search and structure preview.
- Edit a standalone copy: organization, region, owners, landing zones,
  environments, Secrets Manager selection and sandboxes.
- Original portal design tokens (digits/light), locally served brand assets;
  provenance and outstanding visual acceptance in `docs/design-reference.md`.
- State only in the current tab's memory; no cloud/GitHub write operations.
- Download `landing-zone.lzc.json`: versioned draft with the template source hash
  and configuration values edited through the domain model. Not a directly executable
  `.tfvars.json` export, and no import of this draft format yet.
- Network templates remain read-only for now. The standalone editor explicitly sets
  `corporate: false`, because the current source template without a hub would
  otherwise inherit the Accelerator default of `true`.

Local acceptance from `app/` after `npm run build`:

```sh
npx playwright install chromium
npm run test:e2e
```

Alternatively, with Chrome installed: `LZC_TEST_CHROME=true npm run test:e2e`.
Tests use isolated browser contexts without an existing user session.
Screenshots/error traces are ignored under `.local/browser-tests` and provided
as short-lived CI artifacts during validation. Desktop and
mobile widths check search, preview, validation, download and source isolation.
