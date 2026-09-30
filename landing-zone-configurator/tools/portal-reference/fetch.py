#!/usr/bin/env python3
"""Capture public portal design sources without credentials or browser access."""
import hashlib
import json
import re
import subprocess
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit

ORIGIN = "https://portal.stackit.cloud"
BASE = Path(__file__).resolve().parents[2]
OUTPUT = BASE / ".local" / "portal-reference"
OUTPUT.mkdir(parents=True, exist_ok=True)


def fetch(url, name):
    if urlsplit(url).scheme != "https" or urlsplit(url).netloc != "portal.stackit.cloud":
        raise ValueError("Only public portal assets are permitted")
    target = OUTPUT / name
    # -q ignores personal curlrc (including any default authentication options).
    subprocess.run([
        "curl", "-q", "--fail", "--silent", "--show-error", "--max-time", "30",
        "--max-filesize", "10000000", url, "--output", str(target),
    ], check=True)
    raw = target.read_bytes()
    return raw.decode("utf-8"), {
        "url": url, "file": name, "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.styles = []
        self.main = []

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == "link" and attrs.get("rel") == "stylesheet":
            self.styles.append(attrs["href"])
        if tag == "script" and re.fullmatch(r"main-[A-Za-z0-9]+\.js", attrs.get("src", "")):
            self.main.append(attrs["src"])


html, html_source = fetch(ORIGIN + "/", "portal.html")
assets = Assets()
assets.feed(html)
sources = [html_source]
token_groups = []
fonts = []
for index, href in enumerate(dict.fromkeys(assets.styles)):
    css, source = fetch(urljoin(ORIGIN + "/", href), f"stylesheet-{index}.css")
    sources.append(source)
    fonts.extend(re.findall(r"@font-face\s*\{[^}]+\}", css))
    # Capture declarations with their selector. This is source extraction, not a
    # CSS cascade evaluator: selected brand/theme and viewport still need review.
    for rule in css.split("}"):
        selector, separator, values = rule.rpartition("{")
        declarations = re.findall(r"(--nds-[\w-]+)\s*:\s*([^;}]+)", values)
        if separator and declarations:
            token_groups.append({"source": source["file"], "selector": selector.strip(),
                                 "declarations": dict(declarations)})
for index, src in enumerate(dict.fromkeys(assets.main)):
    _, source = fetch(urljoin(ORIGIN + "/", src), f"main-{index}.js")
    sources.append(source)
if not token_groups:
    raise RuntimeError("No NDS tokens found; inspect the portal asset structure")
(OUTPUT / "design-tokens.json").write_text(json.dumps({
    "note": "Source declarations only; not computed styles or a rendered project page.",
    "groups": token_groups, "fontFaces": list(dict.fromkeys(fonts)),
}, indent=2) + "\n")
(OUTPUT / "sources.json").write_text(json.dumps({
    "fetchedAt": datetime.now(timezone.utc).isoformat(),
    "authentication": "none", "sources": sources,
}, indent=2) + "\n")
print(f"Saved {len(sources)} public sources and {len(token_groups)} token groups to {OUTPUT}")
print("No login, bearer token, cookies or project API requests used.")
