import { objectValue, textValue, type Values } from "@lzc/domain";

export function Topology({ values }: { values: Values }) {
  const projects = Object.entries(objectValue(values.landing_zones));
  const sandboxes = Array.isArray(values.sandboxes) ? values.sandboxes : [];
  const regionalHubs = objectValue(values.connectivity_regions);
  const hubs = Object.keys(regionalHubs).length
    ? Object.keys(regionalHubs)
    : values.connectivity
      ? [textValue(values.region)]
      : [];
  return (
    <figure className="topology">
      <figcaption>Struktur deiner Landing Zone</figcaption>
      <p className="muted topology-note">
        Organisationsstruktur · keine Netzwerk- oder Ressourcenplanung
      </p>
      <div className="tree-root">
        <span className="node-symbol" aria-hidden="true">
          ▦
        </span>
        <div>
          <small>Organisation</small>
          <strong>
            {textValue(values.company_name) || "Deine Organisation"}
          </strong>
        </div>
      </div>
      <div className="tree-children">
        {hubs.map((region) => (
          <div className="tree-node" key={region}>
            <span className="node-symbol" aria-hidden="true">
              ◇
            </span>
            <div>
              <small>Konnektivität · {region}</small>
              <strong>Netzwerk-Hub</strong>
            </div>
          </div>
        ))}
        {projects.map(([key, raw]) => {
          const p = objectValue(raw);
          return (
            <div className="tree-node" key={key}>
              <span className="node-symbol" aria-hidden="true">
                □
              </span>
              <div>
                <small>Landing Zone · {textValue(p.env) || "dev"}</small>
                <strong>
                  {textValue(p.project_name) || "Unbenanntes Projekt"}
                </strong>
                <span className="node-detail">
                  {textValue(p.region) ||
                    textValue(values.region) ||
                    "Region aus Vorlage"}
                </span>
              </div>
            </div>
          );
        })}
        {sandboxes.map((raw, index) => {
          const s = objectValue(raw);
          // Catalogue entries have no persistent ID; name plus position identifies the read-only diagram node.
          const key = `${textValue(s.project_name)}-${index}`;
          return (
            <div className="tree-node sandbox-node" key={key}>
              <span className="node-symbol" aria-hidden="true">
                ⊞
              </span>
              <div>
                <small>Sandbox</small>
                <strong>
                  {textValue(s.project_name) || "Unbenannte Sandbox"}
                </strong>
              </div>
            </div>
          );
        })}
      </div>
    </figure>
  );
}
