#!/usr/bin/env python3

from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Iterable
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from urllib.error import URLError, HTTPError
from urllib.request import Request, urlopen


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_API_URL = "https://pim.api.stackit.cloud/v2/skus"
API_TIMEOUT_SECONDS = 45
API_RETRIES = 3
DEFAULT_PAGE_SIZE = 100


def normalize_text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value).strip().lower()


def fetch_json(url: str) -> dict:
    last_error: Exception | None = None
    headers = {"User-Agent": "stackit-landing-zone-flavor-validator/1.0"}

    for attempt in range(1, API_RETRIES + 1):
        try:
            request = Request(url, headers=headers)
            with urlopen(request, timeout=API_TIMEOUT_SECONDS) as response:
                if response.status != 200:
                    raise RuntimeError(f"Unexpected HTTP status {response.status} from {url}")
                payload = response.read().decode("utf-8")
                return json.loads(payload)
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, RuntimeError) as error:
            last_error = error
            if attempt < API_RETRIES:
                time.sleep(attempt)

    raise RuntimeError(f"Failed to fetch STACKIT SKUs from {url}: {last_error}")


def with_query_params(url: str, updates: dict[str, str]) -> str:
    parsed = urlparse(url)
    params = dict(parse_qsl(parsed.query, keep_blank_values=True))
    params.update(updates)
    new_query = urlencode(params, doseq=True)
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, new_query, parsed.fragment))


def fetch_all_v2_skus(url: str) -> list[dict]:
    items: list[dict] = []
    cursor: str | None = None

    while True:
        query_updates = {"pageSize": str(DEFAULT_PAGE_SIZE)}
        if "language" not in dict(parse_qsl(urlparse(url).query, keep_blank_values=True)):
            query_updates["language"] = "en"
        if cursor:
            query_updates["cursor"] = cursor

        page_url = with_query_params(url, query_updates)
        payload = fetch_json(page_url)
        data = payload.get("data")
        if not isinstance(data, list):
            raise RuntimeError("Unsupported v2 SKU response format: expected 'data' list.")

        items.extend(item for item in data if isinstance(item, dict))
        meta = payload.get("meta") if isinstance(payload.get("meta"), dict) else {}
        next_cursor = meta.get("nextCursor") if isinstance(meta, dict) else None
        cursor = str(next_cursor) if next_cursor else None
        if not cursor:
            break

    return items


def fetch_flavor_skus(url: str) -> list[dict]:
    params = dict(parse_qsl(urlparse(url).query, keep_blank_values=True))
    product_param = params.get("productName")

    # If productName is already pinned in the URL, respect it.
    if product_param:
        return fetch_all_v2_skus(url)

    # Flavor validation only needs Server and Git SKUs.
    server_url = with_query_params(url, {"productName": "Server"})
    git_url = with_query_params(url, {"productName": "Git"})

    by_id: dict[str, dict] = {}
    for item in fetch_all_v2_skus(server_url) + fetch_all_v2_skus(git_url):
        item_id = str(item.get("id") or "")
        if item_id:
            by_id[item_id] = item
        else:
            # Fallback for unexpected entries without an id.
            by_id[str(len(by_id))] = item

    return list(by_id.values())


def is_deprecated(item: dict) -> bool:
    deprecated_markers = {"yes", "true", "1", "deprecated"}

    deprecated = normalize_text(item.get("deprecated"))
    if deprecated in deprecated_markers:
        return True

    # Some payloads use the misspelled field, keep compatibility.
    depreciated = normalize_text(item.get("depreciated"))
    if depreciated in deprecated_markers:
        return True

    status = normalize_text(item.get("status"))
    if "deprecat" in status:
        return True

    return False


def extract_live_flavors(items: list[dict]) -> tuple[set[str], set[str]]:
    server_flavors: set[str] = set()
    git_flavors: set[str] = set()

    for item in items:
        if is_deprecated(item):
            continue

        product = str(item.get("productName") or item.get("product") or "")
        attributes = item.get("productSpecificAttributes")
        if not isinstance(attributes, dict):
            attributes = item.get("attributes") if isinstance(item.get("attributes"), dict) else {}

        if product == "Server":
            flavor = attributes.get("flavor")
            if isinstance(flavor, str) and flavor.strip():
                server_flavors.add(flavor.strip())

        if product == "Git":
            flavor = attributes.get("flavor")
            if isinstance(flavor, str) and re.match(r"^git-\d+$", flavor.strip()):
                git_flavors.add(flavor.strip())
            else:
                # Keep compatibility with name-based extraction.
                name = str(item.get("name") or "")
                match = re.match(r"^Git-(\d+)-", name)
                if match:
                    git_flavors.add(f"git-{match.group(1)}")

    if not server_flavors:
        raise RuntimeError("No live server flavors found in SKU API response.")
    if not git_flavors:
        raise RuntimeError("No live git flavors found in SKU API response.")

    return server_flavors, git_flavors


def iter_tf_files(root: Path) -> Iterable[Path]:
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix not in {".tf", ".tfvars"}:
            continue
        if ".terraform" in path.parts:
            continue
        yield path


def collect_used_flavors(root: Path) -> tuple[list[tuple[str, str]], list[tuple[str, str]]]:
    used_server: list[tuple[str, str]] = []
    used_git: list[tuple[str, str]] = []

    assignment_server_re = re.compile(r"\b(?:machine_type|firewall_flavor)\s*=\s*\"([^\"]+)\"")
    assignment_firewall_flavor_re = re.compile(r"\bflavor\s*=\s*\"([^\"]+)\"")
    assignment_git_re = re.compile(r"\bgit_flavor\s*=\s*\"([^\"]+)\"")
    block_start_re = re.compile(r'^\s*variable\s+"(firewall_flavor|git_flavor)"\s*{\s*$')
    default_re = re.compile(r'\bdefault\s*=\s*"([^\"]+)"')
    firewall_block_depth = 0

    for path in iter_tf_files(root):
        rel_path = path.relative_to(root)
        in_var_block: str | None = None

        with path.open("r", encoding="utf-8") as handle:
            for line_number, line in enumerate(handle, start=1):
                code = line.split("#", 1)[0].split("//", 1)[0]
                stripped = code.strip()

                start_match = block_start_re.match(code)
                if start_match:
                    in_var_block = start_match.group(1)

                # Track tfvars/module blocks that define firewall flavor as nested key: firewall { flavor = "c1.2" }
                if re.match(r"^\s*firewall\s*=\s*\{", code):
                    firewall_block_depth = 1
                elif firewall_block_depth > 0:
                    firewall_block_depth += code.count("{")
                    firewall_block_depth -= code.count("}")
                    if firewall_block_depth < 0:
                        firewall_block_depth = 0

                for match in assignment_server_re.finditer(code):
                    used_server.append((match.group(1), f"{rel_path}:{line_number}"))

                if firewall_block_depth > 0:
                    for match in assignment_firewall_flavor_re.finditer(code):
                        used_server.append((match.group(1), f"{rel_path}:{line_number}"))

                for match in assignment_git_re.finditer(code):
                    used_git.append((match.group(1), f"{rel_path}:{line_number}"))

                if in_var_block:
                    default_match = default_re.search(code)
                    if default_match:
                        value = default_match.group(1)
                        if in_var_block == "firewall_flavor":
                            used_server.append((value, f"{rel_path}:{line_number}"))
                        elif in_var_block == "git_flavor":
                            used_git.append((value, f"{rel_path}:{line_number}"))

                if in_var_block and "}" in code:
                    in_var_block = None

    return used_server, used_git


def validate(used: list[tuple[str, str]], allowed: set[str], kind: str) -> list[str]:
    errors: list[str] = []
    for value, location in used:
        if value not in allowed:
            errors.append(
                f"{kind} flavor '{value}' at {location} is not available in live STACKIT SKU API"
            )
    return errors


def main() -> int:
    api_url = os.environ.get("STACKIT_PIM_SKUS_URL", DEFAULT_API_URL)

    try:
        skus = fetch_flavor_skus(api_url)
        allowed_server, allowed_git = extract_live_flavors(skus)
        used_server, used_git = collect_used_flavors(REPO_ROOT)

        errors = []
        errors.extend(validate(used_server, allowed_server, "server"))
        errors.extend(validate(used_git, allowed_git, "git"))

        if errors:
            print("Live flavor validation failed:")
            for error in errors:
                print(f"- {error}")

            print("\nAllowed server flavor count:", len(allowed_server))
            print("Allowed git flavor count:", len(allowed_git))
            return 1

        print("Live flavor validation succeeded.")
        print("Validated server flavors:", len(used_server))
        print("Validated git flavors:", len(used_git))
        print("Allowed server flavors:", len(allowed_server))
        print("Allowed git flavors:", len(allowed_git))
        return 0
    except Exception as error:
        print(f"Live flavor validation error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())