<a id="designreferenz-offizielles-stackit-portal"></a>
# Design reference: official STACKIT Portal

[English](design-reference.md) | [Deutsch](design-reference.de.md)

User requirement from 2026-09-30: the look and feel of the Landing Zone Configurator
should match the official STACKIT Portal. The reference is the project home page
already open in the user's browser. No freely interpreted STACKIT-like
theme as a substitute for this comparison.

<a id="design-abnahme"></a>
## Design acceptance

- [ ] View the open project home page in the user's browser and capture the reference.
- [ ] Determine portal shell: header, project/organization selection, navigation, breadcrumbs and content width.
- [ ] Document actual colors, typography, font weights, spacing, radii, borders and shadows.
- [ ] Compare forms, buttons, cards, tables, dialogs and focus/error/disabled states.
- [x] Check official design tokens, fonts and component sources through Nebula.
- [ ] Integrate official icons and full component parity.
- [x] Implement shared form/structure components and selected semantic tokens in the Configurator.
- [ ] Visually qualify login, template selection, domain editor and fork selection against the reference.
- [ ] Check keyboard operation, focus, contrast and narrow views.

<a id="öffentliche-designquellen-erfasst-2026-09-30"></a>
## Public design sources captured (2026-09-30)

- [x] Retrieve portal HTML, referenced stylesheets and main JavaScript without login using `curl`.
- [x] Extract original `--nds-*` declarations with brand/theme selectors and font-face definitions.
- [x] Document repeatable retrieval with source URLs, UTC timestamp and SHA-256.
- [ ] Visually confirm active brand, theme and computed styles of the project view.

Retrieval: [instructions and tool](../tools/portal-reference/README.md).
Local source files are under `.local/portal-reference/` and are not
versioned. Personal tokens, cookies or project access are unnecessary.

The captured public [portal stylesheet](https://portal.stackit.cloud/styles-HOVMV7T5.css)
contains these reference values (filename applies to this snapshot):

| Scope | Observed declaration |
| --- | --- |
| `html.brand--digits` | Body text: DIN 2014; headings: Univia Pro |
| `html.brand--digits` | Light branding header: `#0a1e2dff` |
| `html.brand--digits` | CTA: `#00c2ccff`, hover `#00b2bcff`, active `#00a2acff` |
| `html.brand--neutral` | Body text and headings: Inter |
| `html.brand--schwarz` | Body text and headings: Helvetica Now Var |
| Theme selectors | `theme--light`, `theme--dark`, `theme--a11y` |
| Body rule | 16 px, weight 400, line height 1.56; colors through theme tokens |

The HTML response initially contains only `html lang="en"`, no selected brand
or theme class. Tokens must therefore not be merged across all selectors.
Extraction is not a complete CSS parser and computes neither cascade nor rendered
styles. The application explicitly selects
`digits/light`. A limited semantic token snapshot preserves
viewport rules; font files and logo are served locally.
[Asset origin and checksums](brand-assets.md). Portal JavaScript is not
incorporated into the application.

`curl` delivers SPA source files, not a rendered, authenticated
project home page. Shell geometry, concrete components and interaction states
therefore remain open acceptance items. The earlier browser connection error
(missing plugin version `26.917.71314`) does not prevent public retrieval.

<a id="unabhängig-vorbereitete-arbeit"></a>
## Independently prepared work

- [x] GitHub App registration draft with fixed callback URL under `deploy/github/`.
- [x] Pure auth building blocks for S256 PKCE, state/browser binding and secure cookie output with negative tests.
- [ ] Register/assign GitHub App and configure user authorization.
- [ ] Implement persistent, atomically consumed login transactions and server-side sessions.
- [ ] Tenant/membership model, migrations and real PostgreSQL RLS negative tests.
- [ ] Protect user-bound GitHub tokens; perform repository actions exclusively with them.
- [ ] First vertical template-to-fork flow with actual user login.

The auth helpers are not yet connected to HTTP routes. In particular,
a successful state comparison does not replace atomic single use in PostgreSQL.
The protected API remains closed until full integration.
The public template editor works exclusively with repository templates
and transient drafts in the current browser tab.

<a id="nebula-als-bestätigte-referenz"></a>
## Nebula as the confirmed reference

On 2026-09-30 the user specified [styleguide.stackit.schwarz](https://styleguide.stackit.schwarz/)
as the reference. Pages are accessible without login (subpages with
a trailing `/`). Relevant requirements:

- [Tokens](https://styleguide.stackit.schwarz/foundations/design-tokens/about-tokens/):
  use semantic names, keep brands/modes separate.
- [Typography](https://styleguide.stackit.schwarz/foundations/typography/):
  16-px base unit, graduated text styles; local original fonts.
- [Forms](https://styleguide.stackit.schwarz/patterns/forms/design/):
  one-/two-column wizard, inline errors and clickable error summary.
  Download remains clickable and leads to the affected field when inputs are invalid.
- [Buttons](https://styleguide.stackit.schwarz/components/buttons/design/):
  one prominent primary action per action group.
- [Header](https://styleguide.stackit.schwarz/components/header/design/) and
  [navigation](https://styleguide.stackit.schwarz/patterns/side-navigation/design/):
  logo, context and clearly marked active navigation item.

Nebula refers to an Angular component library. This is not a directly
usable React dependency. The confirmed React stack remains in place for this step;
native semantic components use the selected token snapshot.
Full component and behavior parity is not automatically achieved.
The Configurator shows only its actually available features; project/region
selection for authenticated users follows with login.

Local acceptance: browser checks at 1440 and 390 px, including search,
error focus, draft download and successful loading of both original fonts and
the logo. Screenshots are under `.local/browser-tests`. The integrated
browser connection remains broken; isolated local
browser contexts were therefore used. Direct visual comparison with the authenticated
portal project home page and complete keyboard/contrast checks remain outstanding.

<a id="fachliches-bedienkonzept"></a>
## Domain interaction concept

The [binding editor design principles](editor-design-principles.md) supplement
the visual portal references: official product names, component overview,
progressive detail disclosure and documentation-aligned flows, initially for STACKIT VPN.
