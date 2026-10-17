# Fetch the public STACKIT portal design reference

[English](README.md) | [Deutsch](README.de.md)

<a id="öffentliche-stackit-portal-designreferenz-abrufen"></a>

From the repository directory (requires Python 3 and curl):

```sh
python3 landing-zone-configurator/tools/portal-reference/fetch.py
```

The tool downloads `https://portal.stackit.cloud/`, discovers the current
stylesheet and main JavaScript filenames in the HTML and downloads them directly
using `curl`. This accommodates changing asset hashes without manual updates.
No login, bearer tokens, cookies or project API calls required.

The basic fetch can also be run directly:

```sh
curl -q --fail --silent --show-error --max-time 30 \
  https://portal.stackit.cloud/ --output /tmp/stackit-portal.html
```

`-q` suppresses personal curlrc settings. Certificates are verified normally;
redirects are not followed. For Zscaler/certificate errors, check the connection
and run again; do not disable TLS verification.

Output in the ignored directory `landing-zone-configurator/.local/portal-reference/`:

- `portal.html`, `stylesheet-*.css`, `main-*.js`: unchanged public sources.
- `sources.json`: source URLs, fetch timestamp, file sizes and SHA-256.
- `design-tokens.json`: NDS declarations by selector and font-face definitions.

The directory contains the latest fetch. Token extraction is
source analysis, not a complete CSS parser or browser. Brands, themes and
media queries must be evaluated separately. HTTP success does not confirm
a rendered project view. Fonts are not downloaded; complete
portal bundles are not incorporated into the app or checked in.

Recorded values and outstanding visual acceptance: [design reference](../../docs/design-reference.md).

<a id="semantische-tokens-für-die-app"></a>

## Semantic tokens for the app

After fetching, `python3 landing-zone-configurator/tools/portal-reference/export-tokens.py`
generates the deliberately limited token snapshot `app/apps/web/src/nebula-tokens.css`.
It uses only `brand--digits` / `theme--light` and preserves the
viewport rules for the selected sizes. Review changes before adopting them;
then run `npm run format` in the app directory.

The token file is not a complete Nebula library. The official reference
is [Nebula](https://styleguide.stackit.schwarz/), particularly the
[token architecture](https://styleguide.stackit.schwarz/foundations/design-tokens/about-tokens/)
and [form rules](https://styleguide.stackit.schwarz/patterns/forms/design/).
