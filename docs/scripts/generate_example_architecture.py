#!/usr/bin/env python3

from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_EXAMPLES_ROOT = REPO_ROOT / "examples"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "docs" / "diagrams"


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
    if module_key in {"connectivity-global", "connectivity-regional"}:
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
    "stackit_image": "Firewall Image",
    "stackit_volume": "Firewall Volume",
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


def _module_children(module_key: str, resource_types: set[str], detail_level: str) -> list[ChildItem]:
    if detail_level == "full":
        items: dict[tuple[str, str], ChildItem] = {}
        for resource_type in resource_types:
            theme = _resource_theme(resource_type)
            label = _resource_label(resource_type)
            semantic_class = _theme_class(theme)
            items[(label, semantic_class)] = ChildItem(label=label, semantic_class=semantic_class, relation="contains")
        return [items[key] for key in sorted(items.keys(), key=lambda item: item[0])]

    def has(*types: str) -> bool:
        return any(resource_type in resource_types for resource_type in types)

    def relation_for(semantic_class: str) -> str:
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
    order = {theme: index for index, theme in enumerate(THEME_ORDER)}
    sorted_themes = sorted(themes, key=lambda theme: order.get(theme, len(THEME_ORDER)))
    return [
        ChildItem(label=_theme_label(theme), semantic_class=_theme_class(theme), relation=relation_for(_theme_class(theme)))
        for theme in sorted_themes
    ]


def _build_mermaid(example_name: str, example_main_tf: Path, modules: list[ModuleBlock], detail_level: str) -> str:
    key_by_name = {module.name: _module_key(module) for module in modules}
    unique_keys = []
    seen: set[str] = set()
    for module in modules:
        key = _module_key(module)
        if key not in seen:
            seen.add(key)
            unique_keys.append(key)

    edges: set[tuple[str, str]] = set()
    for module in modules:
        dst = _module_key(module)
        refs = set(re.findall(r"module\.([a-zA-Z0-9_]+)", module.body))
        for ref in refs:
            src_key = key_by_name.get(ref)
            if src_key and src_key != dst:
                edges.add((src_key, dst))

    categories = ["Resource Manager", "Connectivity", "Projects", "Other"]
    module_children: dict[str, list[ChildItem]] = {}
    for module in modules:
        key = _module_key(module)
        if key in module_children:
            continue
        module_dir = _module_source_path(example_main_tf, module)
        resource_types = _extract_module_resource_types(module_dir) if module_dir else set()
        module_children[key] = _module_children(key, resource_types, detail_level)

    lines = [
        "```mermaid",
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

    lines.append('  org["🏢 Organization"]')
    lines.append('  folders["🗂️ Folder Hierarchy"]')
    lines.append('  shared_network_area["🌐 Shared Network Area"]')
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
        subgraph_id = category.lower().replace(" ", "_")
        lines.append(f"  subgraph {subgraph_id}[\"{category}\"]")
        for key in keys:
            node = _node_id(key)
            label = _pretty_label(key)
            lines.append(f"    {node}[\"{label}\"]")
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

        child_ids: list[str] = []
        for child in children:
            child_id = _child_node_id(key, child.label)
            child_ids.append(child_id)
            lines.append(f"    {child_id}[\"{child.label}\"]")
            class_assignments.append((child_id, child.semantic_class))

        lines.append("  end")
        for child_node_id, child in zip(child_ids, children):
            add_edge(parent_id, child.relation, child_node_id, dotted=True)

    lines.append("")
    lines.append("  subgraph legend[\"Legend\"]")
    lines.append("    direction TB")
    lines.append("    lg_network[\"🌐 Networking\"]")
    lines.append("    lg_compute[\"🖥️ Compute\"]")
    lines.append("    lg_k8s[\"☸️ Kubernetes\"]")
    lines.append("    lg_storage[\"🪣 Storage\"]")
    lines.append("    lg_access[\"🔐 Access & RBAC\"]")
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


def generate(example_paths: list[Path], output_dir: Path, detail_level: str) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    created: list[Path] = []

    for example_path in example_paths:
        if not example_path.exists():
            raise FileNotFoundError(f"Example not found: {example_path}")

        content = example_path.read_text(encoding="utf-8")
        modules = _extract_module_blocks(content)
        example_name = example_path.parent.name
        diagram = _build_mermaid(example_name, example_path, modules, detail_level)

        output_file = output_dir / f"{example_name}-architecture.mmd.md"
        raw_output_file = output_dir / f"{example_name}-architecture.mmd"
        header = [
            f"# Architecture Diagram: {example_name}",
            "",
            f"Generated from `{example_path.relative_to(REPO_ROOT)}`.",
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
    args = parser.parse_args()

    if args.example_folder:
        example_paths = _resolve_folder_targets(Path(args.example_folder).resolve())
    else:
        example_paths = _discover_example_main_tf_files(Path(args.examples_root).resolve())

    if not example_paths:
        raise FileNotFoundError("No main.tf files found for diagram generation.")

    output_dir = Path(args.out_dir).resolve()

    created = generate(example_paths, output_dir, args.detail_level)
    print("Generated diagrams:")
    for path in created:
        print(f"- {path.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())