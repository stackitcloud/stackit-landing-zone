#!/usr/bin/env python3

from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Iterable
from urllib.error import URLError, HTTPError
from urllib.request import Request, urlopen


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_API_URL = "https://pim.api.stackit.cloud/v1/skus"
API_TIMEOUT_SECONDS = 45
API_RETRIES = 3


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


def extract_live_flavors(payload: dict) -> tuple[set[str], set[str]]:
    server_flavors: set[str] = set()
    git_flavors: set[str] = set()

    if "services" in payload:
        items = payload.get("services", [])
        for item in items:
            if not isinstance(item, dict):
                continue

            product = str(item.get("product") or "")
            deprecated = str(item.get("deprecated") or "")
            if deprecated.lower() == "yes":
                continue

            attributes = item.get("attributes")
            if not isinstance(attributes, dict):
                attributes = {}

            if product == "Server":
                flavor = attributes.get("flavor")
                if isinstance(flavor, str) and flavor.strip():
                    server_flavors.add(flavor.strip())

            if product == "Git":
                name = str(item.get("name") or "")
                match = re.match(r"^Git-(\d+)-", name)
                if match:
                    git_flavors.add(f"git-{match.group(1)}")

    elif "data" in payload:
        items = payload.get("data", [])
        for item in items:
            if not isinstance(item, dict):
                continue

            product = str(item.get("productName") or "")
            deprecated = str(item.get("deprecated") or "")
            if deprecated.lower() == "yes":
                continue

            attributes = item.get("productSpecificAttributes")
            if not isinstance(attributes, dict):
                attributes = {}

            if product == "Server":
                flavor = attributes.get("flavor")
                if isinstance(flavor, str) and flavor.strip():
                    server_flavors.add(flavor.strip())

            if product == "Git":
                name = str(item.get("name") or "")
                match = re.match(r"^Git-(\d+)-", name)
                if match:
                    git_flavors.add(f"git-{match.group(1)}")
    else:
        raise RuntimeError("Unsupported SKU API response format: expected 'services' or 'data'.")

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
    assignment_git_re = re.compile(r"\bgit_flavor\s*=\s*\"([^\"]+)\"")
    block_start_re = re.compile(r'^\s*variable\s+"(firewall_flavor|git_flavor)"\s*{\s*$')
    default_re = re.compile(r'\bdefault\s*=\s*"([^\"]+)"')

    for path in iter_tf_files(root):
        rel_path = path.relative_to(root)
        in_var_block: str | None = None

        with path.open("r", encoding="utf-8") as handle:
            for line_number, line in enumerate(handle, start=1):
                code = line.split("#", 1)[0].split("//", 1)[0]

                start_match = block_start_re.match(code)
                if start_match:
                    in_var_block = start_match.group(1)

                for match in assignment_server_re.finditer(code):
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
        payload = fetch_json(api_url)
        allowed_server, allowed_git = extract_live_flavors(payload)
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