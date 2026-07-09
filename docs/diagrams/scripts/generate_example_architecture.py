#!/usr/bin/env python3

from __future__ import annotations

import argparse
import html
import hashlib
import json
import os
import re
import urllib.parse
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_EXAMPLES_ROOT = REPO_ROOT / "examples"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "docs" / "diagrams"
PROMPT_VERSION = "v1"
DEFAULT_ICON_ASSETS_DIR = REPO_ROOT / "docs" / "assets"
ICON_SIZE_PX = 36
NODE_LABEL_WIDTH_PX = 210
NODE_LABEL_HEIGHT_PX = 40


@dataclass
class ModuleBlock:
    name: str
    source: str | None
    body: str


@dataclass
class ChildItem:
    label: str
    semantic_class: str
    relation: str = "contains"


@dataclass
class ResourceInstance:
    resource_type: str
    resource_name: str
    body: str
    context: str


@dataclass
class SemanticOptions:
    provider: str
    mode: str
    grouping: str
    model: str
    base_url: str
    api_key_env: str
    lock_file: Path
    cache_file: Path
    threshold: float
    timeout_seconds: int


@dataclass
class DiagramTarget:
    main_tf_path: Path
    output_name: str
    source_note: str
    active_module_keys: set[str] | None = None
    connectivity_firewall_enabled: bool | None = None


class StackitSymbolCatalog:
    def __init__(self, assets_dir: Path):
        self.assets_dir = assets_dir
        self.symbols = self._load_symbols()

    def has(self, slug: str) -> bool:
        return slug in self.symbols

    def icon_html(self, slug: str, size: int = ICON_SIZE_PX) -> str | None:
        svg = self.symbols.get(slug)
        if not svg:
            return None
        symbol_encoded = urllib.parse.quote(svg)
        scale = ICON_VISUAL_SCALE_BY_SLUG.get(slug, 1.0)
        wrapper = (
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 72 72' width='72' height='72' "
            "preserveAspectRatio='xMidYMid meet'>"
            f"<g transform='translate(36 36) scale({scale}) translate(-36 -36)'>"
            f"<image href='data:image/svg+xml;utf8,{symbol_encoded}' x='0' y='0' width='72' height='72' "
            "preserveAspectRatio='xMidYMid meet'/></g></svg>"
        )
        encoded = urllib.parse.quote(wrapper)
        return (
            f"<img src='data:image/svg+xml;utf8,{encoded}' "
            f"width='{size}' height='{size}' style='vertical-align:middle;'/>"
        )

    def _load_symbols(self) -> dict[str, str]:
        if not self.assets_dir.exists() or not self.assets_dir.is_dir():
            return {}

        symbols: dict[str, str] = {}
        for icon_path in sorted(self.assets_dir.rglob("*.svg")):
            slug = icon_path.stem.strip()
            if not slug or slug in symbols:
                continue
            try:
                svg = icon_path.read_text(encoding="utf-8").strip()
            except OSError:
                continue
            if not svg.startswith("<svg"):
                continue
            symbols[slug] = re.sub(r"\s+", " ", svg)
        return symbols


@dataclass
class SemanticGroup:
    title: str
    members: list[str]
    confidence: float = 1.0


ICON_SLUG_BY_KEYWORD: dict[str, str] = {
    "organization": "organization",
    "folder hierarchy": "folder-hierarchy",
    "governance": "organization",
    "management": "management",
    "landing zones": "landing-zones",
    "landing zone": "landing-zones",
    "sandboxes": "sandboxes",
    "sandbox": "sandboxes",
    "connectivity": "network",
    "firewall": "firewall",
    "network": "network",
    "route": "network",
    "routing": "network",
    "public ip": "ip",
    "ip": "ip",
    "virtual machine": "virtual-machine",
    "server": "virtual-machine",
    "compute": "virtual-machine",
    "vm image": "custom-image",
    "image": "custom-image",
    "volume": "disk-volumes",
    "disk": "disk-volumes",
    "object storage": "object-storage",
    "bucket": "object-storage",
    "kubernetes": "kubernetes",
    "ske": "kubernetes",
    "secrets": "secrets-manager",
    "secrets manager": "secrets-manager",
    "service account": "service-account",
    "role assignment": "assume-role",
    "role assignments": "assume-role",
    "custom role": "assume-role",
    "rbac": "assume-role",
    "access": "assume-role",
    "identity": "service-account",
    "project": "organization",
    "folder": "folder-hierarchy",
    "git": "git",
    "observability": "observability",
    "platform logs": "logme",
    "logme": "logme",
}

ICON_SLUG_BY_SEMANTIC_CLASS: dict[str, str] = {
    "sem_foundation": "organization",
    "sem_access": "assume-role",
    "sem_network": "network",
    "sem_compute": "virtual-machine",
    "sem_kubernetes": "kubernetes",
    "sem_storage": "object-storage",
    "sem_secrets": "secrets-manager",
    "sem_identity": "service-account",
    "sem_observability": "observability",
    "sem_devops": "git",
    "sem_supporting": "workflows",
    "sem_other": "workflows",
}

ICON_VISUAL_SCALE_BY_SLUG: dict[str, float] = {
    # Compensate inner padding differences in source assets for a more uniform visual size.
    "secrets-manager": 1.12,
    "observability": 0.92,
    "logme": 0.92,
}

FALLBACK_ICON_BY_SEMANTIC_CLASS: dict[str, tuple[str, str]] = {
    "sem_foundation": ("F", "#2563eb"),
    "sem_access": ("A", "#d97706"),
    "sem_network": ("N", "#0891b2"),
    "sem_compute": ("C", "#ef4444"),
    "sem_kubernetes": ("K", "#7c3aed"),
    "sem_storage": ("S", "#16a34a"),
    "sem_secrets": ("X", "#e11d48"),
    "sem_identity": ("I", "#ca8a04"),
    "sem_observability": ("O", "#6366f1"),
    "sem_devops": ("D", "#ea580c"),
    "sem_supporting": ("U", "#6b7280"),
    "sem_other": ("?", "#6b7280"),
    "module_foundation": ("F", "#2f6feb"),
    "module_connectivity": ("N", "#00758f"),
    "module_projects": ("P", "#6f42c1"),
    "module_other": ("M", "#6b7280"),
}


class StackitAIClassifier:
    def __init__(self, options: SemanticOptions):
        self.options = options
        self.api_key = os.getenv(options.api_key_env, "").strip()
        self._warned_missing_api_key = False
        store_file = options.lock_file if options.mode in {"learn", "locked"} else options.cache_file
        self._store_file = store_file
        self._cache: dict[str, dict[str, Any]] = self._load_cache(store_file)
        self._dirty = False

    def enabled(self) -> bool:
        if self.options.mode in {"off", "locked"}:
            return False
        if self.options.provider != "stackit-ai":
            return False
        if not self.api_key:
            if not self._warned_missing_api_key:
                self._warned_missing_api_key = True
                print(
                    f"[semantic] {self.options.api_key_env} is not set. Falling back to deterministic labels.",
                )
            return False
        return True

    def classify(self, module_key: str, resource: ResourceInstance, fallback: ChildItem) -> ChildItem:
        cache_key = self._cache_key(module_key, resource, purpose="label")
        cached = self._cache.get(cache_key)
        if cached:
            try:
                parsed = self._validated_child_item(cached)
                if parsed:
                    return parsed
            except Exception:
                # Ignore malformed cache entries and continue with API classification.
                pass

        if self.options.mode == "locked":
            return fallback
        if not self.enabled():
            return fallback

        prompt = {
            "module": module_key,
            "resource_type": resource.resource_type,
            "resource_name": resource.resource_name,
            "resource_context": resource.context[:3500],
            "resource_body": resource.body[:5000],
            "fallback": {
                "label": fallback.label,
                "semantic_class": fallback.semantic_class,
                "relation": fallback.relation,
            },
            "allowed_semantic_classes": sorted(THEME_SEMANTIC_CLASS.values()),
            "allowed_relations": [
                "contains",
                "settings",
                "connects",
                "hosts",
                "secures",
                "auth",
                "observes",
                "enables",
                "supports",
                "organizes",
                "routes",
                "provides",
            ],
        }

        request_payload = {
            "model": self.options.model,
            "temperature": 0,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You classify Terraform resources for architecture diagrams. "
                        "Return strictly one JSON object with keys: label, semantic_class, relation, confidence. "
                        "Use only allowed semantic_class and relation values. "
                        "Confidence must be between 0 and 1."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(prompt, ensure_ascii=True),
                },
            ],
        }

        try:
            response = self._post_chat(request_payload)
            content = (
                response.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
            )
            parsed_json = self._parse_json_object(content)
            if not isinstance(parsed_json, dict):
                return fallback

            confidence = float(parsed_json.get("confidence", 0.0))
            if confidence < self.options.threshold:
                return fallback

            parsed_item = self._validated_child_item(parsed_json)
            if not parsed_item:
                return fallback

            self._cache[cache_key] = {
                "label": parsed_item.label,
                "semantic_class": parsed_item.semantic_class,
                "relation": parsed_item.relation,
                "confidence": confidence,
            }
            self._dirty = True
            return parsed_item
        except Exception:
            return fallback

    def group_children(self, module_key: str, children: list[ChildItem]) -> list[SemanticGroup]:
        if self.options.grouping != "ai" or len(children) < 3:
            return []

        cache_key = self._cache_key(module_key, None, purpose="group", children=children)
        cached = self._cache.get(cache_key)
        if cached:
            parsed = self._validated_groups(cached, children)
            if parsed:
                return parsed

        if self.options.mode == "locked":
            return []
        if not self.enabled():
            return []

        prompt = {
            "module": module_key,
            "prompt_version": PROMPT_VERSION,
            "children": [
                {
                    "label": child.label,
                    "semantic_class": child.semantic_class,
                    "relation": child.relation,
                }
                for child in children
            ],
            "rules": {
                "min_members_per_group": 2,
                "max_groups": 6,
                "member_uniqueness": "A child label can appear in at most one group",
            },
            "output_schema": {
                "groups": [
                    {
                        "title": "string",
                        "members": ["child label"],
                        "confidence": 0.0,
                    }
                ]
            },
        }

        request_payload = {
            "model": self.options.model,
            "temperature": 0,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You group architecture child elements into semantic blocks. "
                        "Return strictly one JSON object with key 'groups'. "
                        "Each group must contain title, members, confidence."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(prompt, ensure_ascii=True),
                },
            ],
        }

        try:
            response = self._post_chat(request_payload)
            content = (
                response.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
            )
            parsed_json = self._parse_json_object(content)
            if not isinstance(parsed_json, dict):
                return []

            groups = self._validated_groups(parsed_json, children)
            if not groups:
                return []

            self._cache[cache_key] = {
                "groups": [
                    {
                        "title": group.title,
                        "members": group.members,
                        "confidence": group.confidence,
                    }
                    for group in groups
                ]
            }
            self._dirty = True
            return groups
        except Exception:
            return []

    def persist_cache(self) -> None:
        if not self._dirty:
            return
        self._store_file.parent.mkdir(parents=True, exist_ok=True)
        self._store_file.write_text(
            json.dumps(self._cache, indent=2, sort_keys=True, ensure_ascii=True) + "\n",
            encoding="utf-8",
        )

    def _cache_key(
        self,
        module_key: str,
        resource: ResourceInstance | None,
        *,
        purpose: str,
        children: list[ChildItem] | None = None,
    ) -> str:
        if resource:
            digest_input = "\n".join(
                [
                    PROMPT_VERSION,
                    purpose,
                    self.options.model,
                    module_key,
                    resource.resource_type,
                    resource.resource_name,
                    resource.context,
                    resource.body,
                ]
            )
        else:
            child_data = [
                {"label": child.label, "semantic_class": child.semantic_class, "relation": child.relation}
                for child in (children or [])
            ]
            digest_input = "\n".join(
                [
                    PROMPT_VERSION,
                    purpose,
                    self.options.model,
                    module_key,
                    json.dumps(child_data, ensure_ascii=True, sort_keys=True),
                ]
            )
        return hashlib.sha256(digest_input.encode("utf-8")).hexdigest()

    def _post_chat(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._post_json(
            f"{self.options.base_url.rstrip('/')}/chat/completions",
            payload,
        )

    def _post_json(self, url: str, payload: dict[str, Any]) -> dict[str, Any]:
        req = urllib.request.Request(
            url=url,
            data=json.dumps(payload).encode("utf-8"),
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            },
        )
        with urllib.request.urlopen(req, timeout=self.options.timeout_seconds) as response:
            raw = response.read().decode("utf-8")
            parsed: Any = json.loads(raw)
            if not isinstance(parsed, dict):
                raise ValueError("Unexpected API response format.")
            return parsed

    def _parse_json_object(self, text: str) -> dict[str, Any] | None:
        stripped = text.strip()
        if not stripped:
            return None
        if stripped.startswith("```"):
            stripped = re.sub(r"^```(?:json)?", "", stripped).strip()
            stripped = re.sub(r"```$", "", stripped).strip()

        try:
            parsed = json.loads(stripped)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass

        object_match = re.search(r"\{.*\}", stripped, re.DOTALL)
        if not object_match:
            return None

        try:
            parsed = json.loads(object_match.group(0))
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            return None
        return None

    def _validated_child_item(self, payload: dict[str, Any]) -> ChildItem | None:
        label = str(payload.get("label", "")).strip()
        semantic_class = str(payload.get("semantic_class", "")).strip()
        relation = str(payload.get("relation", "")).strip()

        if not label:
            return None
        if semantic_class not in THEME_SEMANTIC_CLASS.values():
            return None
        if not relation:
            return None
        return ChildItem(label=label, semantic_class=semantic_class, relation=relation)

    def _validated_groups(self, payload: dict[str, Any], children: list[ChildItem]) -> list[SemanticGroup]:
        raw_groups = payload.get("groups")
        if not isinstance(raw_groups, list):
            return []

        available = {child.label for child in children}
        assigned: set[str] = set()
        parsed: list[SemanticGroup] = []

        for group in raw_groups[:6]:
            if not isinstance(group, dict):
                continue
            title = str(group.get("title", "")).strip()
            members = group.get("members", [])
            confidence = float(group.get("confidence", 0.0))

            if not title or confidence < self.options.threshold:
                continue
            if not isinstance(members, list):
                continue

            valid_members: list[str] = []
            for member in members:
                label = str(member).strip()
                if not label or label not in available or label in assigned:
                    continue
                valid_members.append(label)

            if len(valid_members) < 2:
                continue

            for label in valid_members:
                assigned.add(label)
            parsed.append(SemanticGroup(title=title, members=valid_members, confidence=confidence))

        return parsed

    def _load_cache(self, cache_file: Path) -> dict[str, dict[str, Any]]:
        if not cache_file.exists() or not cache_file.is_file():
            return {}
        try:
            parsed: Any = json.loads(cache_file.read_text(encoding="utf-8"))
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            return {}
        return {}


def _extract_module_blocks(content: str) -> list[ModuleBlock]:
    blocks: list[ModuleBlock] = []
    pattern = re.compile(r'module\s+"([^"]+)"\s*\{', re.MULTILINE)

    for match in pattern.finditer(content):
        module_name = match.group(1)
        body_start = match.end()
        depth = 1
        index = body_start

        while index < len(content) and depth > 0:
            if content[index] == "{":
                depth += 1
            elif content[index] == "}":
                depth -= 1
            index += 1

        body = content[body_start : index - 1]
        source_match = re.search(r'\bsource\s*=\s*"([^"]+)"', body)
        source = source_match.group(1).strip() if source_match else None
        blocks.append(ModuleBlock(name=module_name, source=source, body=body))

    return blocks


def _module_key(module: ModuleBlock) -> str:
    if module.source and "modules/" in module.source:
        return module.source.split("modules/")[-1].strip("/")
    return module.name


def _pretty_label(module_key: str) -> str:
    mapping = {
        "governance": "Governance",
        "management": "Management",
        "connectivity": "Connectivity",
        "connectivity-global": "Connectivity Global",
        "connectivity-regional": "Connectivity Regional",
        "devops": "DevOps",
        "landing-zone": "Landing Zones",
        "sandboxes": "Sandboxes",
    }
    return mapping.get(module_key, module_key.replace("-", " ").title())


def _node_id(module_key: str) -> str:
    return module_key.replace("-", "_")


def _child_node_id(module_key: str, child_label: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9]+", "_", child_label).strip("_").lower()
    return f"{_node_id(module_key)}__{normalized}"


def _category(module_key: str) -> str:
    if module_key == "governance":
        return "Resource Manager"
    if module_key in {"connectivity", "connectivity-global", "connectivity-regional"}:
        return "Connectivity"
    if module_key in {"management", "devops", "landing-zone", "sandboxes"}:
        return "Projects"
    return "Other"


def _module_semantic_class(module_key: str) -> str:
    category = _category(module_key)
    if category == "Resource Manager":
        return "module_foundation"
    if category == "Connectivity":
        return "module_connectivity"
    if category == "Projects":
        return "module_projects"
    return "module_other"


RESOURCE_LABELS: dict[str, str] = {
    "stackit_network_area": "Network Area",
    "stackit_network_area_route": "Static Routes",
    "stackit_network": "Network",
    "stackit_server": "Server",
    "stackit_image": "VM Image",
    "stackit_volume": "Block Volume",
    "stackit_public_ip": "Public IP",
    "stackit_objectstorage_bucket": "Object Storage",
    "stackit_objectstorage_credentials_group": "Object Storage Credentials Group",
    "stackit_objectstorage_credential": "Object Storage Credentials",
    "stackit_secretsmanager_instance": "Secrets Manager",
    "stackit_secretsmanager_user": "Secrets Manager User",
    "stackit_service_account": "Service Account",
    "stackit_service_account_key": "Service Account Key",
    "stackit_ske_cluster": "Kubernetes Cluster",
    "stackit_git": "Git",
    "stackit_logme_instance": "Platform Logs",
    "stackit_authorization_project_custom_role": "Custom Roles",
    "stackit_authorization_project_role_assignment": "Role Assignments",
    "stackit_resourcemanager_project": "Project",
    "stackit_resourcemanager_folder": "Folders",
}


def _resource_label(resource_type: str) -> str:
    mapped = RESOURCE_LABELS.get(resource_type)
    if mapped:
        return mapped
    suffix = resource_type.removeprefix("stackit_")
    return suffix.replace("_", " ").title()


def _default_relation_for_semantic_class(semantic_class: str) -> str:
    mapping = {
        "sem_access": "settings",
        "sem_network": "connects",
        "sem_compute": "hosts",
        "sem_kubernetes": "hosts",
        "sem_storage": "hosts",
        "sem_secrets": "secures",
        "sem_identity": "auth",
        "sem_observability": "observes",
        "sem_devops": "enables",
        "sem_supporting": "supports",
        "sem_foundation": "organizes",
        "sem_other": "contains",
    }
    return mapping.get(semantic_class, "contains")


def _type_fallback_child_item(resource_type: str) -> ChildItem:
    theme = _resource_theme(resource_type)
    semantic_class = _theme_class(theme)
    return ChildItem(
        label=_resource_label(resource_type),
        semantic_class=semantic_class,
        relation=_default_relation_for_semantic_class(semantic_class),
    )


def _heuristic_instance_child_item(module_key: str, resource: ResourceInstance) -> ChildItem:
    fallback = _type_fallback_child_item(resource.resource_type)
    haystack = " ".join([resource.resource_name, resource.context, resource.body]).lower()

    if "pfsense" in haystack or "firewall" in haystack:
        if resource.resource_type == "stackit_server":
            return ChildItem("🔥 Firewall Appliance", "sem_compute", "secures")
        if resource.resource_type == "stackit_image":
            return ChildItem("🔥 Firewall Image", "sem_compute", "supports")
        if resource.resource_type == "stackit_volume":
            return ChildItem("💾 Firewall Volume", "sem_storage", "supports")

    if resource.resource_type == "stackit_server":
        return ChildItem("🖥️ Virtual Machine", "sem_compute", "hosts")
    if resource.resource_type == "stackit_image":
        return ChildItem("🖼️ VM Image", "sem_compute", "supports")
    if resource.resource_type == "stackit_volume":
        return ChildItem("💾 Block Volume", "sem_storage", "supports")
    if resource.resource_type == "stackit_public_ip":
        return ChildItem("🔌 Public IP", "sem_network", "connects")
    if resource.resource_type == "stackit_network":
        return ChildItem("🌐 Network", "sem_network", "connects")
    if resource.resource_type == "stackit_network_interface":
        return ChildItem("🌐 Network Interface", "sem_network", "connects")
    if resource.resource_type == "stackit_network_area_route":
        return ChildItem("🧭 Route", "sem_network", "routes")
    if resource.resource_type == "stackit_routing_table":
        return ChildItem("🧭 Routing Table", "sem_network", "routes")
    if resource.resource_type == "stackit_routing_table_route":
        return ChildItem("🧭 Routing Rule", "sem_network", "routes")

    if module_key == "connectivity-regional" and resource.resource_type in {
        "stackit_server",
        "stackit_image",
        "stackit_volume",
    }:
        return ChildItem("🔥 Firewall", "sem_compute", "secures")

    return fallback


def _extract_preceding_comment_block(content: str, match_start: int) -> str:
    lines = content[:match_start].splitlines()
    comments: list[str] = []
    for line in reversed(lines):
        stripped = line.strip()
        if not stripped:
            if comments:
                break
            continue
        if stripped.startswith("#") or stripped.startswith("//"):
            comments.append(stripped.lstrip("#/ "))
            continue
        break
    comments.reverse()
    return "\n".join(comments)


def _extract_resource_instances_from_content(content: str) -> list[ResourceInstance]:
    instances: list[ResourceInstance] = []
    pattern = re.compile(r'resource\s+"([^"]+)"\s+"([^"]+)"\s*\{', re.MULTILINE)

    for match in pattern.finditer(content):
        resource_type = match.group(1)
        resource_name = match.group(2)
        body_start = match.end()
        depth = 1
        index = body_start
        while index < len(content) and depth > 0:
            if content[index] == "{":
                depth += 1
            elif content[index] == "}":
                depth -= 1
            index += 1

        body = content[body_start : index - 1]
        comment_context = _extract_preceding_comment_block(content, match.start())
        context = "\n".join(part for part in [comment_context, body] if part).strip()
        instances.append(
            ResourceInstance(
                resource_type=resource_type,
                resource_name=resource_name,
                body=body,
                context=context,
            )
        )

    return instances


def _is_firewall_resource_instance(resource: ResourceInstance) -> bool:
    haystack = " ".join([resource.resource_name, resource.context, resource.body]).lower()
    return "firewall" in haystack or "pfsense" in haystack


RESOURCE_THEMES: dict[str, str] = {
    "stackit_resourcemanager_folder": "Project & Folders",
    "stackit_resourcemanager_project": "Project & Folders",
    "stackit_authorization_project_custom_role": "Access & RBAC",
    "stackit_authorization_project_role_assignment": "Access & RBAC",
    "stackit_authorization_folder_role_assignment": "Access & RBAC",
    "stackit_authorization_organization_role_assignment": "Access & RBAC",
    "stackit_network_area": "Networking",
    "stackit_network_area_region": "Networking",
    "stackit_network_area_route": "Networking",
    "stackit_network": "Networking",
    "stackit_network_interface": "Networking",
    "stackit_public_ip": "Networking",
    "stackit_routing_table": "Networking",
    "stackit_routing_table_route": "Networking",
    "stackit_server": "Compute",
    "stackit_image": "Compute",
    "stackit_volume": "Compute",
    "stackit_ske_cluster": "Kubernetes",
    "stackit_objectstorage_bucket": "Storage",
    "stackit_objectstorage_credentials_group": "Storage",
    "stackit_objectstorage_credential": "Storage",
    "stackit_secretsmanager_instance": "Secrets",
    "stackit_secretsmanager_user": "Secrets",
    "stackit_service_account": "Identity",
    "stackit_service_account_key": "Identity",
    "stackit_git": "DevOps",
    "stackit_logme_instance": "Observability",
    "stackit_observability_instance": "Observability",
    "stackit_observability_credential": "Observability",
    "vault_kv_secret_v2": "Secrets",
    "time_rotating": "Supporting",
    "terraform_data": "Supporting",
}

THEME_ORDER = [
    "Project & Folders",
    "Access & RBAC",
    "Networking",
    "Compute",
    "Kubernetes",
    "Storage",
    "Secrets",
    "Identity",
    "Observability",
    "DevOps",
    "Supporting",
    "Other",
]


def _resource_theme(resource_type: str) -> str:
    return RESOURCE_THEMES.get(resource_type, "Other")


THEME_SEMANTIC_CLASS = {
    "Project & Folders": "sem_foundation",
    "Access & RBAC": "sem_access",
    "Networking": "sem_network",
    "Compute": "sem_compute",
    "Kubernetes": "sem_kubernetes",
    "Storage": "sem_storage",
    "Secrets": "sem_secrets",
    "Identity": "sem_identity",
    "Observability": "sem_observability",
    "DevOps": "sem_devops",
    "Supporting": "sem_supporting",
    "Other": "sem_other",
}

THEME_ICON = {
    "Project & Folders": "🗂️",
    "Access & RBAC": "🔐",
    "Networking": "🌐",
    "Compute": "🖥️",
    "Kubernetes": "☸️",
    "Storage": "🪣",
    "Secrets": "🗝️",
    "Identity": "👤",
    "Observability": "📈",
    "DevOps": "🛠️",
    "Supporting": "🧩",
    "Other": "◻️",
}


def _theme_class(theme: str) -> str:
    return THEME_SEMANTIC_CLASS.get(theme, "sem_other")


def _theme_label(theme: str) -> str:
    return f"{THEME_ICON.get(theme, '◻️')} {theme}"


def _select_icon_slug(label: str, semantic_class: str, catalog: StackitSymbolCatalog | None) -> str | None:
    if not catalog:
        return None
    lower_label = label.lower()
    for keyword, slug in ICON_SLUG_BY_KEYWORD.items():
        if keyword in lower_label and catalog.has(slug):
            return slug
    semantic_slug = ICON_SLUG_BY_SEMANTIC_CLASS.get(semantic_class)
    if semantic_slug and catalog.has(semantic_slug):
        return semantic_slug
    return None


def _strip_leading_emoji(label: str) -> str:
    return re.sub(r"^[^A-Za-z0-9]+\s*", "", label).strip()


def _label_with_stackit_icon(label: str, semantic_class: str, catalog: StackitSymbolCatalog | None) -> str:
    normalized_label = _strip_leading_emoji(label)
    slug = _select_icon_slug(label, semantic_class, catalog)
    icon_markup = catalog.icon_html(slug) if (catalog and slug) else None
    if not icon_markup:
        icon_markup = _fallback_icon_html(semantic_class, size=ICON_SIZE_PX)
    safe_label = html.escape(normalized_label)
    return (
        "<span style='display:inline-flex;align-items:center;gap:6px;"
        f"width:{NODE_LABEL_WIDTH_PX}px;height:{NODE_LABEL_HEIGHT_PX}px;"
        "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'>"
        f"{icon_markup}<span>{safe_label}</span></span>"
    )


def _fallback_icon_html(semantic_class: str, size: int = 18) -> str:
    symbol, color = FALLBACK_ICON_BY_SEMANTIC_CLASS.get(semantic_class, ("?", "#6b7280"))
    svg = (
        "<svg xmlns='http://www.w3.org/2000/svg' "
        "viewBox='0 0 24 24' width='24' height='24' aria-hidden='true'>"
        f"<rect x='2' y='2' width='20' height='20' rx='6' fill='{color}'/>"
        "<text x='12' y='16' text-anchor='middle' "
        "font-family='Arial,sans-serif' font-size='11' font-weight='700' fill='white'>"
        f"{symbol}</text></svg>"
    )
    encoded = urllib.parse.quote(svg)
    return (
        f"<img src='data:image/svg+xml;utf8,{encoded}' "
        f"width='{size}' height='{size}' style='vertical-align:middle;'/>"
    )


def _edge_relation_label(src: str, dst: str) -> str:
    if src == "governance":
        return "provisions"
    if src == "connectivity-global" and dst in {"connectivity-regional", "landing-zone"}:
        return "shares network"
    return "depends on"


def _module_source_path(example_main_tf: Path, module: ModuleBlock) -> Path | None:
    if not module.source or module.source.startswith("git::"):
        return None
    source = module.source
    if source.startswith("./") or source.startswith("../"):
        return (example_main_tf.parent / source).resolve()
    return None


def _extract_module_resource_types(module_dir: Path) -> set[str]:
    if not module_dir.exists() or not module_dir.is_dir():
        return set()

    resource_types: set[str] = set()
    pattern = re.compile(r'resource\s+"([^"]+)"\s+"([^"]+)"\s*\{', re.MULTILINE)

    for tf_file in sorted(module_dir.glob("*.tf")):
        content = tf_file.read_text(encoding="utf-8")
        for match in pattern.finditer(content):
            resource_types.add(match.group(1))

    return resource_types


def _extract_module_resource_instances(module_dir: Path) -> list[ResourceInstance]:
    if not module_dir.exists() or not module_dir.is_dir():
        return []

    instances: list[ResourceInstance] = []
    for tf_file in sorted(module_dir.glob("*.tf")):
        content = tf_file.read_text(encoding="utf-8")
        instances.extend(_extract_resource_instances_from_content(content))
    return instances


def _module_children(
    module_key: str,
    resource_types: set[str],
    resource_instances: list[ResourceInstance],
    detail_level: str,
    classifier: StackitAIClassifier,
) -> list[ChildItem]:
    if detail_level == "full":
        items: dict[tuple[str, str], ChildItem] = {}
        for resource in resource_instances:
            inferred = _heuristic_instance_child_item(module_key, resource)
            inferred = classifier.classify(module_key, resource, inferred)
            items[(inferred.label, inferred.semantic_class)] = inferred

        if not items:
            for resource_type in resource_types:
                fallback = _type_fallback_child_item(resource_type)
                items[(fallback.label, fallback.semantic_class)] = fallback

        return [items[key] for key in sorted(items.keys(), key=lambda item: item[0])]

    def has(*types: str) -> bool:
        return any(resource_type in resource_types for resource_type in types)

    items: list[ChildItem] = []

    if module_key == "governance":
        items.extend(
            [
                ChildItem("🗂️ Folder Hierarchy", "sem_foundation", "organizes"),
                ChildItem("🔐 Access & RBAC", "sem_access", "settings"),
            ]
        )
        return items

    if module_key == "connectivity-global":
        items.append(ChildItem("🌐 Network Area (Org Scope)", "sem_network", "provides"))
        if has("stackit_network_area_route"):
            items.append(ChildItem("🧭 Route Policies", "sem_network", "routes"))
        return items

    if module_key == "connectivity-regional":
        if has("stackit_network"):
            items.append(ChildItem("🌐 Project Network", "sem_network", "connects"))
        if has("stackit_server", "stackit_image", "stackit_volume"):
            items.append(ChildItem("🔥 Firewall", "sem_compute", "secures"))
        if has("stackit_network_area_route", "stackit_routing_table", "stackit_routing_table_route"):
            items.append(ChildItem("🧭 Routing Control", "sem_network", "routes"))
        if has("stackit_public_ip"):
            items.append(ChildItem("🔌 Public Connectivity", "sem_network", "connects"))
        if has("stackit_authorization_project_role_assignment"):
            items.append(ChildItem("🔐 Access & RBAC", "sem_access", "settings"))
        return items

    if module_key == "landing-zone":
        if has("stackit_network"):
            items.append(ChildItem("🌐 Project Network", "sem_network", "connects"))
        if has("stackit_ske_cluster"):
            items.append(ChildItem("☸️ Kubernetes", "sem_kubernetes", "hosts"))
        if has("stackit_server"):
            items.append(ChildItem("🖥️ Virtual Machines", "sem_compute", "hosts"))
        if has("stackit_objectstorage_bucket"):
            items.append(ChildItem("🪣 Object Storage", "sem_storage", "hosts"))
        if has("stackit_secretsmanager_instance"):
            items.append(ChildItem("🗝️ Secrets", "sem_secrets", "secures"))
        if has("stackit_service_account"):
            items.append(ChildItem("👤 Service Accounts", "sem_identity", "auth"))
        if has("stackit_authorization_project_role_assignment", "stackit_authorization_project_custom_role"):
            items.append(ChildItem("🔐 Access & RBAC", "sem_access", "settings"))
        if has("stackit_logme_instance", "stackit_observability_instance"):
            items.append(ChildItem("📈 Observability", "sem_observability", "observes"))
        return items

    if module_key == "management":
        if has("stackit_objectstorage_bucket"):
            items.append(ChildItem("🪣 Object Storage", "sem_storage", "hosts"))
        if has("stackit_secretsmanager_instance"):
            items.append(ChildItem("🗝️ Secrets", "sem_secrets", "secures"))
        if has("stackit_service_account"):
            items.append(ChildItem("👤 Service Accounts", "sem_identity", "auth"))
        if has("stackit_observability_instance", "stackit_logme_instance"):
            items.append(ChildItem("📈 Platform Observability", "sem_observability", "observes"))
        if has("stackit_authorization_project_role_assignment", "stackit_authorization_organization_role_assignment"):
            items.append(ChildItem("🔐 Access & RBAC", "sem_access", "settings"))
        return items

    if module_key == "devops":
        if has("stackit_git"):
            items.append(ChildItem("🛠️ Git", "sem_devops", "enables"))
        if has("stackit_authorization_project_role_assignment", "stackit_authorization_organization_role_assignment"):
            items.append(ChildItem("🔐 Access & RBAC", "sem_access", "settings"))
        return items

    if module_key == "sandboxes":
        items.append(ChildItem("🧪 Sandbox Projects", "sem_foundation", "contains"))
        if has("stackit_authorization_project_role_assignment"):
            items.append(ChildItem("🔐 Access & RBAC", "sem_access", "settings"))
        return items

    themes = {_resource_theme(resource_type) for resource_type in resource_types}

    # For the unified connectivity module, expose firewall explicitly when enabled.
    if module_key == "connectivity":
        if "Compute" in themes and any(_is_firewall_resource_instance(r) for r in resource_instances):
            themes.discard("Compute")

    order = {theme: index for index, theme in enumerate(THEME_ORDER)}
    sorted_themes = sorted(themes, key=lambda theme: order.get(theme, len(THEME_ORDER)))
    items = [
        ChildItem(
            label=_theme_label(theme),
            semantic_class=_theme_class(theme),
            relation=_default_relation_for_semantic_class(_theme_class(theme)),
        )
        for theme in sorted_themes
    ]

    if module_key == "connectivity" and any(_is_firewall_resource_instance(r) for r in resource_instances):
        items.append(ChildItem("🔥 Firewall", "sem_compute", "secures"))

    return items


def _build_mermaid(
    example_name: str,
    example_main_tf: Path,
    modules: list[ModuleBlock],
    detail_level: str,
    classifier: StackitAIClassifier,
    symbol_catalog: StackitSymbolCatalog | None,
    active_module_keys: set[str] | None = None,
    connectivity_firewall_enabled: bool | None = None,
) -> str:
    filtered_modules = [
        module
        for module in modules
        if active_module_keys is None or _module_key(module) in active_module_keys
    ]

    key_by_name = {module.name: _module_key(module) for module in filtered_modules}
    unique_keys = []
    seen: set[str] = set()
    for module in filtered_modules:
        key = _module_key(module)
        if key not in seen:
            seen.add(key)
            unique_keys.append(key)

    edges: set[tuple[str, str]] = set()
    for module in filtered_modules:
        dst = _module_key(module)
        refs = set(re.findall(r"module\.([a-zA-Z0-9_]+)", module.body))
        for ref in refs:
            src_key = key_by_name.get(ref)
            if src_key and src_key != dst:
                edges.add((src_key, dst))

    categories = ["Resource Manager", "Connectivity", "Projects", "Other"]
    module_children: dict[str, list[ChildItem]] = {}
    for module in filtered_modules:
        key = _module_key(module)
        if key in module_children:
            continue
        module_dir = _module_source_path(example_main_tf, module)
        resource_types = _extract_module_resource_types(module_dir) if module_dir else set()
        resource_instances = _extract_module_resource_instances(module_dir) if module_dir else []

        if key == "connectivity" and connectivity_firewall_enabled is False:
            resource_instances = [
                instance
                for instance in resource_instances
                if not _is_firewall_resource_instance(instance)
            ]
            resource_types = {instance.resource_type for instance in resource_instances}

        module_children[key] = _module_children(key, resource_types, resource_instances, detail_level, classifier)

    lines = [
        "```mermaid",
        "%%{init: {'securityLevel': 'loose', 'maxTextSize': 50000000, 'flowchart': {'htmlLabels': true}} }%%",
        "flowchart TB",
        f"  %% STACKIT architecture from {example_name}",
        "",
    ]
    class_assignments: list[tuple[str, str]] = []
    added_edges: set[str] = set()

    def add_edge(source: str, label: str, target: str, dotted: bool = False) -> None:
        connector = "-.->" if dotted else "-->"
        line = f"  {source} {connector}|{label}| {target}"
        if line not in added_edges:
            added_edges.add(line)
            lines.append(line)

    lines.append(f'  org["{_label_with_stackit_icon("Organization", "sem_foundation", symbol_catalog)}"]')
    lines.append(f'  folders["{_label_with_stackit_icon("Folder Hierarchy", "sem_foundation", symbol_catalog)}"]')
    lines.append(f'  shared_network_area["{_label_with_stackit_icon("Shared Network Area", "sem_network", symbol_catalog)}"]')
    class_assignments.extend(
        [
            ("org", "sem_foundation"),
            ("folders", "sem_foundation"),
            ("shared_network_area", "sem_network"),
        ]
    )
    lines.append("")

    for category in categories:
        keys = [key for key in unique_keys if _category(key) == category]
        if not keys:
            continue
        subgraph_id = f"category_{category.lower().replace(' ', '_')}"
        lines.append(f"  subgraph {subgraph_id}[\"{category}\"]")
        for key in keys:
            node = _node_id(key)
            label = _pretty_label(key)
            display_label = _label_with_stackit_icon(label, _module_semantic_class(key), symbol_catalog)
            lines.append(f"    {node}[\"{display_label}\"]")
            class_assignments.append((node, _module_semantic_class(key)))
        lines.append("  end")
        lines.append("")

    for src, dst in sorted(edges):
        relation = _edge_relation_label(src, dst)
        add_edge(_node_id(src), relation, _node_id(dst), dotted=False)

    if not edges:
        lines.append("  %% No explicit module dependencies detected")

    lines.append("")
    add_edge("org", "contains", "folders", dotted=False)
    add_edge("org", "scope", "shared_network_area", dotted=False)

    for key in unique_keys:
        node = _node_id(key)
        if key == "governance":
            add_edge("folders", "managed by", node, dotted=False)
        elif _category(key) in {"Connectivity", "Projects"}:
            add_edge("folders", "contains project", node, dotted=False)

    if "connectivity-global" in unique_keys:
        add_edge("connectivity_global", "creates", "shared_network_area", dotted=False)

    if "connectivity-regional" in unique_keys:
        add_edge("shared_network_area", "optional attachment", "connectivity_regional", dotted=True)
    if "landing-zone" in unique_keys:
        add_edge("shared_network_area", "optional attachment", "landing_zone", dotted=True)

    lines.append("")
    for key in unique_keys:
        children = module_children.get(key, [])
        if not children:
            continue
        parent_id = _node_id(key)
        detail_graph_id = f"{parent_id}_details"
        lines.append(f"  subgraph {detail_graph_id}[\"{_pretty_label(key)} details\"]")
        lines.append("    direction TB")

        groups = classifier.group_children(key, children) if detail_level == "full" else []
        grouped_labels = {label for group in groups for label in group.members}

        child_ids: list[str] = []
        for idx, group in enumerate(groups, start=1):
            group_node = f"{detail_graph_id}__grp_{idx}"
            lines.append(f"    subgraph {group_node}[\"{group.title}\"]")
            lines.append("      direction TB")
            for child in children:
                if child.label not in group.members:
                    continue
                child_id = _child_node_id(key, child.label)
                child_ids.append(child_id)
                child_label = _label_with_stackit_icon(child.label, child.semantic_class, symbol_catalog)
                lines.append(f"      {child_id}[\"{child_label}\"]")
                class_assignments.append((child_id, child.semantic_class))
            lines.append("    end")

        for child in children:
            if child.label in grouped_labels:
                continue
            child_id = _child_node_id(key, child.label)
            child_ids.append(child_id)
            child_label = _label_with_stackit_icon(child.label, child.semantic_class, symbol_catalog)
            lines.append(f"    {child_id}[\"{child_label}\"]")
            class_assignments.append((child_id, child.semantic_class))

        lines.append("  end")
        for child_node_id, child in zip(child_ids, children):
            add_edge(parent_id, child.relation, child_node_id, dotted=True)

    lines.append("")
    lines.append("  subgraph legend[\"Legend\"]")
    lines.append("    direction TB")
    lines.append(f"    lg_network[\"{_label_with_stackit_icon('Networking', 'sem_network', symbol_catalog)}\"]")
    lines.append(f"    lg_compute[\"{_label_with_stackit_icon('Compute', 'sem_compute', symbol_catalog)}\"]")
    lines.append(f"    lg_k8s[\"{_label_with_stackit_icon('Kubernetes', 'sem_kubernetes', symbol_catalog)}\"]")
    lines.append(f"    lg_storage[\"{_label_with_stackit_icon('Storage', 'sem_storage', symbol_catalog)}\"]")
    lines.append(f"    lg_access[\"{_label_with_stackit_icon('Access & RBAC', 'sem_access', symbol_catalog)}\"]")
    lines.append("  end")
    class_assignments.extend(
        [
            ("lg_network", "sem_network"),
            ("lg_compute", "sem_compute"),
            ("lg_k8s", "sem_kubernetes"),
            ("lg_storage", "sem_storage"),
            ("lg_access", "sem_access"),
        ]
    )

    lines.append("")
    lines.append("  classDef module_foundation fill:#e8f1ff,stroke:#2f6feb,stroke-width:2px,color:#102a43;")
    lines.append("  classDef module_connectivity fill:#e9fbff,stroke:#00758f,stroke-width:2px,color:#073642;")
    lines.append("  classDef module_projects fill:#f5f0ff,stroke:#6f42c1,stroke-width:2px,color:#2d1b4e;")
    lines.append("  classDef module_other fill:#f3f4f6,stroke:#6b7280,stroke-width:2px,color:#111827;")
    lines.append("  classDef sem_foundation fill:#edf5ff,stroke:#3b82f6,color:#0f172a;")
    lines.append("  classDef sem_access fill:#fef3c7,stroke:#d97706,color:#4a2f00;")
    lines.append("  classDef sem_network fill:#cffafe,stroke:#0891b2,color:#083344;")
    lines.append("  classDef sem_compute fill:#fee2e2,stroke:#ef4444,color:#7f1d1d;")
    lines.append("  classDef sem_kubernetes fill:#ede9fe,stroke:#7c3aed,color:#2e1065;")
    lines.append("  classDef sem_storage fill:#dcfce7,stroke:#16a34a,color:#14532d;")
    lines.append("  classDef sem_secrets fill:#ffe4e6,stroke:#e11d48,color:#4a0719;")
    lines.append("  classDef sem_identity fill:#fef9c3,stroke:#ca8a04,color:#422006;")
    lines.append("  classDef sem_observability fill:#e0e7ff,stroke:#6366f1,color:#1e1b4b;")
    lines.append("  classDef sem_devops fill:#ffedd5,stroke:#ea580c,color:#431407;")
    lines.append("  classDef sem_supporting fill:#f3f4f6,stroke:#6b7280,color:#111827;")
    lines.append("  classDef sem_other fill:#f9fafb,stroke:#9ca3af,color:#1f2937;")

    for node_id, semantic_class in class_assignments:
        lines.append(f"  class {node_id} {semantic_class};")

    lines.append("```")
    lines.append("")

    return "\n".join(lines)


def _discover_example_main_tf_files(examples_root: Path) -> list[Path]:
    if not examples_root.exists() or not examples_root.is_dir():
        raise FileNotFoundError(f"Examples root not found or not a directory: {examples_root}")

    paths = [
        path
        for path in examples_root.rglob("main.tf")
        if path.is_file() and ".terraform" not in path.parts
    ]
    return sorted(paths)


def _resolve_folder_targets(folder_or_file: Path) -> list[Path]:
    if folder_or_file.is_file():
        if folder_or_file.name != "main.tf":
            raise ValueError(f"Expected a main.tf file, got: {folder_or_file}")
        return [folder_or_file]

    if not folder_or_file.exists() or not folder_or_file.is_dir():
        raise FileNotFoundError(f"Folder not found or not a directory: {folder_or_file}")

    direct_main = folder_or_file / "main.tf"
    if direct_main.exists() and direct_main.is_file():
        return [direct_main]

    nested = [
        path
        for path in folder_or_file.rglob("main.tf")
        if path.is_file() and ".terraform" not in path.parts
    ]
    return sorted(nested)


def _module_enabled_from_tfvars(tfvars_content: str, key: str) -> bool:
    assignment_match = re.search(rf"(?m)^\s*{re.escape(key)}\s*=\s*(.+)$", tfvars_content)
    if not assignment_match:
        return False

    value_head = assignment_match.group(1).strip().rstrip(",")
    if value_head.startswith("null"):
        return False
    if key == "sandboxes" and value_head.startswith("[]"):
        return False
    if key == "landing_zones" and value_head.startswith("{}"):
        return False
    return True


def _active_module_keys_from_tfvars(tfvars_path: Path) -> set[str]:
    content = tfvars_path.read_text(encoding="utf-8")
    uncommented = "\n".join(
        line for line in content.splitlines() if not line.lstrip().startswith(("#", "//"))
    )

    active = {"governance", "management"}
    if _module_enabled_from_tfvars(uncommented, "connectivity"):
        active.add("connectivity")
    if _module_enabled_from_tfvars(uncommented, "devops"):
        active.add("devops")
    if _module_enabled_from_tfvars(uncommented, "sandboxes"):
        active.add("sandboxes")
    if _module_enabled_from_tfvars(uncommented, "landing_zones"):
        active.add("landing-zone")
    return active


def _connectivity_firewall_enabled_from_tfvars(tfvars_path: Path) -> bool:
    content = tfvars_path.read_text(encoding="utf-8")
    uncommented = "\n".join(
        line for line in content.splitlines() if not line.lstrip().startswith(("#", "//"))
    )

    assignment_match = re.search(r"(?m)^\s*firewall\s*=\s*(.+)$", uncommented)
    if not assignment_match:
        return False

    value_head = assignment_match.group(1).strip().rstrip(",")
    if value_head.startswith("null"):
        return False

    return True


def _discover_config_variant_targets(main_tf_path: Path, config_dir: Path) -> list[DiagramTarget]:
    if not main_tf_path.exists() or not main_tf_path.is_file():
        return []
    if not config_dir.exists() or not config_dir.is_dir():
        return []

    targets: list[DiagramTarget] = []
    for tfvars_path in sorted(config_dir.glob("*.tfvars")):
        active_keys = _active_module_keys_from_tfvars(tfvars_path)
        connectivity_firewall_enabled = _connectivity_firewall_enabled_from_tfvars(tfvars_path)
        source_note = (
            f"Generated from `{main_tf_path.relative_to(REPO_ROOT)}` "
            f"using variant `{tfvars_path.relative_to(REPO_ROOT)}`."
        )
        targets.append(
            DiagramTarget(
                main_tf_path=main_tf_path,
                output_name=tfvars_path.stem,
                source_note=source_note,
                active_module_keys=active_keys,
                connectivity_firewall_enabled=connectivity_firewall_enabled,
            )
        )
    return targets


def _targets_from_main_tf_paths(main_tf_paths: list[Path]) -> list[DiagramTarget]:
    targets: list[DiagramTarget] = []
    for main_tf_path in main_tf_paths:
        output_name = main_tf_path.parent.name
        source_note = f"Generated from `{main_tf_path.relative_to(REPO_ROOT)}`."
        targets.append(
            DiagramTarget(
                main_tf_path=main_tf_path,
                output_name=output_name,
                source_note=source_note,
            )
        )
    return targets


def generate(
    targets: list[DiagramTarget],
    output_dir: Path,
    detail_level: str,
    classifier: StackitAIClassifier,
    symbol_catalog: StackitSymbolCatalog | None,
) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    created: list[Path] = []

    for target in targets:
        if not target.main_tf_path.exists():
            raise FileNotFoundError(f"Example not found: {target.main_tf_path}")

        content = target.main_tf_path.read_text(encoding="utf-8")
        modules = _extract_module_blocks(content)
        diagram = _build_mermaid(
            target.output_name,
            target.main_tf_path,
            modules,
            detail_level,
            classifier,
            symbol_catalog,
            target.active_module_keys,
            target.connectivity_firewall_enabled,
        )

        output_file = output_dir / f"{target.output_name}-architecture.mmd.md"
        raw_output_file = output_dir / f"{target.output_name}-architecture.mmd"
        header = [
            f"# Architecture Diagram: {target.output_name}",
            "",
            target.source_note,
            "",
        ]
        output_file.write_text("\n".join(header) + diagram, encoding="utf-8")
        raw_output_file.write_text(
            "\n".join([line for line in diagram.splitlines() if line not in {"```mermaid", "```"}]) + "\n",
            encoding="utf-8",
        )
        created.append(output_file)
        created.append(raw_output_file)

    return created


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate Mermaid architecture diagrams from Terraform example module structure."
    )
    parser.add_argument(
        "--examples-root",
        default=str(DEFAULT_EXAMPLES_ROOT),
        help="Root folder scanned for example main.tf files (default: examples).",
    )
    parser.add_argument(
        "--example-folder",
        help="Optional specific folder (or main.tf file) to generate diagrams from.",
    )
    parser.add_argument(
        "--out-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help="Output directory for generated Mermaid markdown files.",
    )
    parser.add_argument(
        "--detail-level",
        choices=["theme", "full"],
        default="theme",
        help="Detail level for module internals: 'theme' for overview (default), 'full' for resource-level.",
    )
    parser.add_argument(
        "--stackit-icons",
        choices=["none", "architecture-symbols"],
        default="architecture-symbols",
        help="Use local STACKIT service icons in Mermaid labels when available.",
    )
    parser.add_argument(
        "--stackit-icons-assets-dir",
        default=str(DEFAULT_ICON_ASSETS_DIR),
        help="Directory containing local STACKIT service icon SVG files.",
    )
    parser.add_argument(
        "--semantic-provider",
        choices=["none", "stackit-ai"],
        default="none",
        help="Optional semantic enrichment provider for resource labels in full mode.",
    )
    parser.add_argument(
        "--semantic-mode",
        choices=["off", "learn", "locked"],
        default="learn",
        help="Semantic decision mode: off (no AI), learn (AI + persist), locked (no AI, lockfile only).",
    )
    parser.add_argument(
        "--semantic-grouping",
        choices=["none", "ai"],
        default="none",
        help="Optional AI grouping into semantic blocks inside module details.",
    )
    parser.add_argument(
        "--stackit-base-url",
        default="https://api.openai-compat.model-serving.eu01.onstackit.cloud/v1",
        help="Base URL for STACKIT OpenAI-compatible model serving.",
    )
    parser.add_argument(
        "--stackit-model",
        default="cortecs/Llama-3.3-70B-Instruct-FP8-Dynamic",
        help="Model ID used for semantic enrichment when --semantic-provider=stackit-ai.",
    )
    parser.add_argument(
        "--stackit-api-key-env",
        default="STACKIT_MODEL_API_KEY",
        help="Environment variable name containing the STACKIT model service API key.",
    )
    parser.add_argument(
        "--semantic-lock-file",
        default=str(REPO_ROOT / ".semantics" / "diagram.lock.json"),
        help="Path to semantic lockfile used in learn/locked modes.",
    )
    parser.add_argument(
        "--semantic-cache",
        default=str(REPO_ROOT / ".cache" / "semantic-labels.json"),
        help="Path to local semantic classification cache file.",
    )
    parser.add_argument(
        "--semantic-threshold",
        type=float,
        default=0.7,
        help="Minimum confidence (0-1) required to accept AI semantic labels.",
    )
    parser.add_argument(
        "--stackit-timeout-seconds",
        type=int,
        default=20,
        help="Timeout in seconds for STACKIT model API requests.",
    )
    args = parser.parse_args()

    if args.example_folder:
        targets = _targets_from_main_tf_paths(_resolve_folder_targets(Path(args.example_folder).resolve()))
    else:
        examples_root = Path(args.examples_root).resolve()
        if examples_root.exists():
            targets = _targets_from_main_tf_paths(_discover_example_main_tf_files(examples_root))
        else:
            default_examples_root = DEFAULT_EXAMPLES_ROOT.resolve()
            src_main_tf = REPO_ROOT / "src" / "main.tf"
            src_config_dir = REPO_ROOT / "src" / "config"
            if examples_root == default_examples_root and src_main_tf.exists() and src_config_dir.exists():
                print("[info] examples/ not found. Using src/config/*.tfvars variants.")
                targets = _discover_config_variant_targets(src_main_tf, src_config_dir)
            elif examples_root == default_examples_root and src_main_tf.exists():
                print(
                    "[info] examples/ not found. Falling back to src/main.tf for v1.0.0+ repository layout.",
                )
                targets = _targets_from_main_tf_paths([src_main_tf])
            else:
                raise FileNotFoundError(f"Examples root not found or not a directory: {examples_root}")

    if not targets:
        raise FileNotFoundError("No diagram targets found for generation.")

    output_dir = Path(args.out_dir).resolve()
    classifier = StackitAIClassifier(
        SemanticOptions(
            provider=args.semantic_provider,
            mode=args.semantic_mode,
            grouping=args.semantic_grouping,
            model=args.stackit_model,
            base_url=args.stackit_base_url,
            api_key_env=args.stackit_api_key_env,
            lock_file=Path(args.semantic_lock_file).resolve(),
            cache_file=Path(args.semantic_cache).resolve(),
            threshold=max(0.0, min(1.0, args.semantic_threshold)),
            timeout_seconds=max(1, args.stackit_timeout_seconds),
        )
    )
    symbol_catalog = None
    if args.stackit_icons == "architecture-symbols":
        symbol_catalog = StackitSymbolCatalog(
            assets_dir=Path(args.stackit_icons_assets_dir).resolve(),
        )

    created = generate(targets, output_dir, args.detail_level, classifier, symbol_catalog)
    classifier.persist_cache()
    print("Generated diagrams:")
    for path in created:
        try:
            display_path = path.relative_to(REPO_ROOT)
        except ValueError:
            display_path = path
        print(f"- {display_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())