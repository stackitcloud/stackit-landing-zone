#!/usr/bin/env python3
"""Render the bilingual workflow phase map and check its source coverage."""

import argparse
import hashlib
import html
import json
from pathlib import Path
import textwrap
import xml.etree.ElementTree as ET

import yaml

ROOT = Path(__file__).resolve().parents[2]
PHASES = {
    "checks": ("Pre-checks / Plan", "Vorprüfungen / Plan", "#dbeafe", "#1d4ed8"),
    "build": ("Build / package", "Build / Paketierung", "#ccfbf1", "#0f766e"),
    "publish": ("Publication", "Veröffentlichung", "#ede9fe", "#6d28d9"),
    "deploy": ("Deploy / verify", "Deploy / Abnahme", "#ffedd5", "#9a3412"),
}
LANES = {
    "shared": ("SHARED / TARGET-SELECTABLE / ACCELERATOR", "GEMEINSAM / ZIEL WÄHLBAR / ACCELERATOR"),
    "dev": ("DEVELOPMENT DELIVERY", "DEV-AUSLIEFERUNG"),
    "prod": ("PRODUCTION DELIVERY", "PROD-AUSLIEFERUNG"),
}


def load_sources(root):
    # BaseLoader preserves the YAML key `on` instead of treating it as bool.
    files = sorted((root / ".github/workflows").glob("*.y*ml"))
    return {path.name: yaml.load(path.read_text(), Loader=yaml.BaseLoader) for path in files}


def validate(rows, sources):
    names = [row["file"] for row in rows]
    if len(set(names)) != len(names) or set(names) != set(sources):
        raise ValueError("Workflow inventory changed: update docs/workflow-map.json")
    for row in rows:
        source = sources[row["file"]]
        jobs = set(source["jobs"])
        mapped = set()
        if row["lane"] not in LANES:
            raise ValueError(f"Unknown lane: {row['file']}")
        for phase, cell in row["phases"].items():
            if phase not in PHASES or not cell["jobs"]:
                raise ValueError(f"Invalid phase: {row['file']} / {phase}")
            mapped.update(cell["jobs"])
            for language in ("en", "de"):
                if not cell.get(language):
                    raise ValueError(f"Missing translation: {row['file']} / {phase}")
        if mapped != jobs:
            raise ValueError(f"Unmapped or removed jobs in {row['file']}: {mapped ^ jobs}")
        environment = source.get("jobs", {}).get("deploy", {}).get("environment", {})
        if isinstance(environment, dict):
            target = environment.get("name")
            expected = {"lzc-dev-release": "dev", "lzc-prod-release": "prod"}.get(target)
            if expected and row["lane"] != expected:
                raise ValueError(f"Deployment lane disagrees with YAML: {row['file']}")
        for job in source["jobs"].values():
            target = job.get("uses", "")
            if target.startswith("./.github/workflows/") and Path(target).name not in sources:
                raise ValueError(f"Missing reusable workflow: {target}")


def signature(sources):
    # Ignore action pin bumps and shell implementation details. Named steps,
    # trigger/input changes, job additions/dependencies/gates do need review.
    selected = {}
    for name, workflow in sources.items():
        selected[name] = {"name": workflow["name"], "on": workflow["on"], "jobs": {}}
        for key, job in workflow["jobs"].items():
            selected[name]["jobs"][key] = {
                field: job[field] for field in ("name", "needs", "if", "environment", "uses", "strategy") if field in job
            }
            selected[name]["jobs"][key]["steps"] = [
                {key: step[key] for key in ("name", "if") if key in step}
                for step in job.get("steps", []) if "name" in step
            ]
    return hashlib.sha256(json.dumps(selected, sort_keys=True).encode()).hexdigest()


def trigger_lines(name, sources, language):
    source = sources[name]
    events = source["on"]
    lines = []
    if "pull_request" in events:
        filtered = isinstance(events["pull_request"], dict) and "paths" in events["pull_request"]
        lines.append("PR" + (" (paths)" if language == "en" else " (Pfade)") if filtered else "PR")
    if "push" in events:
        value = events["push"]
        branches = ", ".join(value.get("branches", ["*"])) if isinstance(value, dict) else "*"
        lines.append(f"Push: {branches}" + (" *" if isinstance(value, dict) and "paths" in value else ""))
    for entry in events.get("schedule", []):
        parts = entry["cron"].split()
        if len(parts) == 5 and parts[0].isdigit() and parts[1].isdigit() and parts[2:4] == ["*", "*"] and parts[4] in "0123456":
            weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] if language == "en" else ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"]
            lines.append(f"{weekdays[int(parts[4])]} {int(parts[1]):02}:{int(parts[0]):02} UTC")
        else:
            lines.append(f"Cron: {entry['cron']} UTC")
    if "release" in events:
        lines.append("Release: " + ", ".join(events["release"].get("types", ["*"])))
    if "workflow_call" in events:
        callers = [w["name"] for w in sources.values() if any(job.get("uses") == f"./.github/workflows/{name}" for job in w["jobs"].values())]
        lines.extend(("Called by: " if language == "en" else "Aufruf durch: ") + caller for caller in callers)
        if not callers:
            lines.append("Workflow call")
    if "workflow_dispatch" in events:
        lines.append("Manual" if language == "en" else "Manuell")
    return lines


def wrap(lines, width):
    result = []
    for line in lines:
        result.extend(textwrap.wrap(line, width=width, break_long_words=False, break_on_hyphens=False) or [""])
    return result


def text(x, y, lines, size=17, weight="400", fill="#172b3a", line_height=22):
    spans = "".join(f'<tspan x="{x}" dy="{0 if index == 0 else line_height}">{html.escape(line)}</tspan>' for index, line in enumerate(lines))
    return f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{fill}">{spans}</text>'


def render(rows, sources, language):
    local = 0 if language == "en" else 1
    columns = [(0, 210), (210, 300), (510, 270), (780, 260), (1040, 250), (1290, 310)]
    width = 1600
    row_height = 140
    height = 175 + len(rows) * row_height + len(LANES) * 44 + 150
    title = "GitHub Actions · workflow phases" if language == "en" else "GitHub Actions · Pipeline-Phasen"
    description = "One row per workflow. Shared workflows are not duplicated for Dev and Prod." if language == "en" else "Eine Zeile je Pipeline. Gemeinsame Workflows werden für Dev und Prod nicht dupliziert."
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">',
           f'<title id="title">{title}</title><desc id="desc">{description}</desc>',
           f'<metadata>Generated by .github/scripts/workflow-map.py; source signature {signature(sources)}</metadata>',
           '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 Z" fill="#64748b"/></marker></defs>',
           '<rect width="100%" height="100%" fill="#ffffff"/>',
           '<g font-family="Arial, Helvetica, sans-serif">', text(24, 38, [title], 28, "700"),
           text(24, 68, [description], 17),
           text(24, 96, ["◆ Environment gate · dashed = conditional / optional · arrows = same workflow spans phases" if language == "en" else "◆ Environment-Gate · gestrichelt = bedingt / optional · Pfeile = Pipeline umfasst mehrere Phasen"], 16)]
    for index, (x, col_width) in enumerate(columns):
        if index < 2:
            label = ("Trigger", "Pipeline")[index]
            background, color = "#e2e8f0", "#172b3a"
        else:
            phase = list(PHASES.values())[index-2]
            label, background, color = phase[local], phase[2], phase[3]
        out.append(f'<rect x="{x}" y="120" width="{col_width}" height="{height-270}" fill="{background}"/>')
        out.append(text(x+14, 151, [label], 20, "700", color))
    y = 175
    for lane in LANES:
        members = [row for row in rows if row["lane"] == lane]
        if not members:
            continue
        out.append(f'<rect y="{y}" width="{width}" height="40" fill="#0b2538"/>')
        out.append(text(18, y+27, [LANES[lane][local]], 18, "700", "#ffffff"))
        y += 44
        for row in members:
            source = sources[row["file"]]
            out.append(f'<g aria-label="{html.escape(source["name"], quote=True)}"><title>{html.escape(row["file"])}</title>')
            out.append(f'<line x1="0" y1="{y+row_height-4}" x2="{width}" y2="{y+row_height-4}" stroke="#94a3b8" stroke-width="1"/>')
            out.append(text(14, y+27, wrap(trigger_lines(row["file"], sources, language), 23), 16, line_height=20))
            out.append(text(224, y+29, wrap([source["name"]], 26), 19, "700"))
            out.append(text(224, y+85, wrap([row["scope"][language]], 31), 14, fill="#475569", line_height=18))
            active = [i for i, key in enumerate(PHASES, 2) if key in row["phases"]]
            for left, right in zip(active, active[1:]):
                start = columns[left][0]+columns[left][1]-10
                end = columns[right][0]+10
                out.append(f'<line x1="{start}" y1="{y+67}" x2="{end}" y2="{y+67}" stroke="#64748b" stroke-width="2" marker-end="url(#arrow)"/>')
            for index, (key, phase) in enumerate(PHASES.items(), 2):
                x, col_width = columns[index]
                cell = row["phases"].get(key)
                if not cell:
                    continue
                lines = wrap(cell[language].splitlines(), (col_width-36)//8)
                if len(lines) > 5:
                    raise ValueError(f"Too much chart text: {row['file']} / {key} / {language}")
                dash = ' stroke-dasharray="7 4"' if cell.get("conditional") else ""
                out.append(f'<rect x="{x+10}" y="{y+8}" width="{col_width-20}" height="118" rx="9" fill="#ffffff" stroke="{phase[3]}" stroke-width="2"{dash}><title>jobs: {html.escape(", ".join(cell["jobs"]))}</title></rect>')
                out.append(text(x+22, y+35, lines, 16, line_height=21))
            out.append("</g>")
            y += row_height
    notes = [
        "Build-only Configurator Release artifacts feed Prod. Dev-skip artifacts cannot be promoted to Prod.",
        "Shared infrastructure workflows choose lzc-dev / lzc-prod; no separate copies. * = source path filter.",
        "Environment reviewers and branch rules are configured in GitHub. Job conditions still apply; not every cell runs.",
        "Phase blocks summarize jobs, not a complete dependency DAG. Tests/packaging and staging can run in parallel.",
    ] if language == "en" else [
        "Build-only-Artefakte aus Configurator Release gehen an Prod. Dev-skip-Artefakte sind dafür nicht zulässig.",
        "Gemeinsame Infrastruktur-Workflows wählen lzc-dev / lzc-prod; keine Kopien. * = Quellpfadfilter.",
        "Reviewer und Branchregeln werden in GitHub gesetzt. Job-Bedingungen gelten weiter; nicht jede Zelle läuft.",
        "Phasenblöcke fassen Jobs zusammen, kein vollständiger Abhängigkeitsgraph. Tests und Staging laufen teils parallel.",
    ]
    out.append(text(24, y+30, notes, 16, line_height=24))
    out.extend(["</g>", "</svg>"])
    return "\n".join(out)+"\n"


def inventory(rows, sources, language):
    lines = ["<!-- BEGIN GENERATED WORKFLOW INVENTORY -->", "| Pipeline | Trigger | " + ("Scope" if language == "en" else "Geltungsbereich") + " |", "| --- | --- | --- |"]
    for row in rows:
        name = row["file"]
        action = f"https://github.com/stackitcloud/stackit-landing-zone/actions/workflows/{name}"
        source = "source" if language == "en" else "Quelle"
        lines.append(f'| [{sources[name]["name"]}]({action}) · [{source}](../.github/workflows/{name}) | {"<br>".join(trigger_lines(name, sources, language))} | {row["scope"][language]} |')
    return "\n".join(lines)+"\n<!-- END GENERATED WORKFLOW INVENTORY -->"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail instead of writing stale outputs")
    args = parser.parse_args()
    sources = load_sources(ROOT)
    rows = json.loads((ROOT / "docs/workflow-map.json").read_text())["workflows"]
    validate(rows, sources)
    stale = []
    for language in ("en", "de"):
        suffix = "" if language == "en" else ".de"
        image = ROOT / f"docs/diagrams/generated/workflow-phases{suffix}.svg"
        rendered = render(rows, sources, language)
        ET.fromstring(rendered)
        if not image.exists() or image.read_text() != rendered:
            stale.append(str(image.relative_to(ROOT)))
            if not args.check:
                image.write_text(rendered)
        doc = ROOT / f"docs/workflows{suffix}.md"
        content = doc.read_text()
        begin = content.index("<!-- BEGIN GENERATED WORKFLOW INVENTORY -->")
        end = content.index("<!-- END GENERATED WORKFLOW INVENTORY -->", begin)+len("<!-- END GENERATED WORKFLOW INVENTORY -->")
        updated = content[:begin]+inventory(rows, sources, language)+content[end:]
        if updated != content:
            stale.append(str(doc.relative_to(ROOT)))
            if not args.check:
                doc.write_text(updated)
    if args.check and stale:
        raise SystemExit("Stale workflow documentation; run python3 .github/scripts/workflow-map.py: " + ", ".join(stale))
    print(f"Workflow map: {len(rows)} workflows, all jobs mapped, both languages " + ("current" if args.check else "generated"))


if __name__ == "__main__":
    main()
