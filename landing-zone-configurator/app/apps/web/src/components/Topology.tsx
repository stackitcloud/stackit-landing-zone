import {
  folderDefaults,
  objectValue,
  textValue,
  type Values,
} from "@lzc/domain";
import type { ReactNode } from "react";

function Project({ name, detail }: { name: string; detail: string }) {
  return (
    <div className="tree-node">
      <span className="node-symbol" aria-hidden="true">
        □
      </span>
      <div>
        <small>Projekt · {detail}</small>
        <strong>{name}</strong>
      </div>
    </div>
  );
}
function Folder({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="tree-folder">
      <div className="tree-node folder-node">
        <span className="node-symbol" aria-hidden="true">
          ▱
        </span>
        <div>
          <small>Ordner</small>
          <strong>{name || "Unbenannter Ordner"}</strong>
        </div>
      </div>
      <div className="tree-children">{children}</div>
    </div>
  );
}
export function Topology({ values }: { values: Values }) {
  const projects = Object.entries(objectValue(values.landing_zones));
  const sandboxes = Array.isArray(values.sandboxes) ? values.sandboxes : [];
  const regionalHubs = objectValue(values.connectivity_regions);
  const hubs =
    values.connectivity_regions != null
      ? ["eu01", "eu02"].filter((region) => regionalHubs[region] != null)
      : values.connectivity
        ? [textValue(values.region)]
        : [];
  // An explicitly supplied rm_folders map replaces the root default; it is not merged by OpenTofu.
  const folders =
    values.rm_folders == null
      ? Object.fromEntries(
          Object.entries(folderDefaults).map(([key, name]) => [key, { name }]),
        )
      : objectValue(values.rm_folders);
  const company = textValue(values.company_code) || "<Unternehmenskürzel>";
  const tree = (
    <div className="tree-children">
      {Object.entries(folders).map(([key, raw]) => {
        const nodes: ReactNode[] = [];
        if (key === "platform") {
          nodes.push(
            <Project
              key="management"
              name={`${company}-pltfm-mgmt-prod`}
              detail="Management"
            />,
          );
          for (const region of hubs)
            nodes.push(
              <Project
                key={`hub-${region}`}
                name="Netzwerk-Hub"
                detail={`Konnektivität · ${region}`}
              />,
            );
          if (values.devops != null)
            nodes.push(
              <Project
                key="devops"
                name={`${company}-pltfm-devops-prod`}
                detail="DevOps"
              />,
            );
          for (const [id, cluster] of Object.entries(
            objectValue(values.platform_kubernetes),
          ))
            nodes.push(
              <Project
                key={`k8s-${id}`}
                name={`${company}-pltfm-k8s-${textValue(objectValue(cluster).region)}`}
                detail="Plattform-Kubernetes"
              />,
            );
        }
        if (
          key === "landing_zones_corporate" ||
          key === "landing_zones_public"
        ) {
          for (const [id, rawProject] of projects) {
            const p = objectValue(rawProject);
            // Root variable default is corporate=true; the standalone editor explicitly exports false.
            if ((p.corporate !== false) !== (key === "landing_zones_corporate"))
              continue;
            nodes.push(
              <Project
                key={id}
                name={`${company}-lz-${textValue(p.project_code)}-${textValue(p.env) || "dev"}`}
                detail={`Landing Zone · ${textValue(p.project_name) || id} · ${textValue(p.region) || textValue(values.region)}`}
              />,
            );
          }
        }
        if (key === "sandboxes")
          sandboxes.forEach((rawSandbox, index) => {
            const s = objectValue(rawSandbox);
            const identity = `${textValue(s.project_name)}-${index}`;
            nodes.push(
              <Project
                key={identity}
                name={`${company}-sbx-${textValue(s.project_name) || "Unbenannte Sandbox"}`}
                detail="Sandbox"
              />,
            );
          });
        return (
          <Folder key={key} name={textValue(objectValue(raw).name)}>
            {nodes.length ? (
              nodes
            ) : (
              <p className="muted empty-folder">
                Keine Projekte in dieser Konfiguration
              </p>
            )}
          </Folder>
        );
      })}
    </div>
  );
  const parent = textValue(values.rm_folder_parent_id);
  return (
    <figure className="topology">
      <figcaption>Struktur deiner Landing Zone</figcaption>
      <p className="muted topology-note">
        Geplante Organisationsstruktur · keine Abfrage bestehender Ressourcen
      </p>
      <div className="tree-root">
        <span className="node-symbol" aria-hidden="true">
          ▦
        </span>
        <div>
          <small>Organisation · Bezeichnung aus Konfiguration</small>
          <strong>
            {textValue(values.company_name) || "Deine Organisation"}
          </strong>
        </div>
      </div>
      {parent ? (
        <div className="tree-children">
          <Folder name={`Bestehender übergeordneter Ordner · ${parent}`}>
            {tree}
          </Folder>
        </div>
      ) : (
        tree
      )}
    </figure>
  );
}
