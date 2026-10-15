import {
  areaLocations,
  folderDefaults,
  objectValue,
  type ProjectTemplateDraft,
  textValue,
  type Values,
} from "@lzc/domain";
import type { ReactNode } from "react";
import { t } from "../i18n";
import {
  type PlatformComponent,
  platformProjectComponents,
} from "./platform-components";
import { projectTemplateSummary } from "./project-template-summary";

function Project({
  name,
  detail,
  components = [],
}: {
  name: string;
  detail: string;
  components?: PlatformComponent[] | undefined;
}) {
  return (
    <div className="tree-project">
      <div className="tree-node">
        <span className="node-symbol" aria-hidden="true">
          □
        </span>
        <div>
          <small>
            {t("Projekt ·")} {detail}
          </small>
          <strong>{name}</strong>
        </div>
      </div>
      {components.length > 0 && (
        <ul
          className="project-components"
          aria-label={t("Komponenten in {{value0}}", { value0: name })}
        >
          {components.map((component) => (
            <li key={component.key}>
              <small>{t(component.type)}</small>
              <strong>{component.name || t("Unbenannte Komponente")}</strong>
            </li>
          ))}
        </ul>
      )}
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
          <small>{t("Ordner")}</small>
          <strong>{name || t("Unbenannter Ordner")}</strong>
        </div>
      </div>
      <div className="tree-children">{children}</div>
    </div>
  );
}
export function Topology({
  values,
  projectTemplates,
  selectedTemplateId,
  onSelectTemplate,
}: {
  values: Values;
  projectTemplates?: ProjectTemplateDraft[] | undefined;
  selectedTemplateId?: string | undefined;
  onSelectTemplate?: (id: string) => void;
}) {
  const projects = Object.entries(objectValue(values.landing_zones));
  const sandboxes = Array.isArray(values.sandboxes) ? values.sandboxes : [];
  const hubs = areaLocations(values);
  const components = platformProjectComponents(values);
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
              components={components.management}
            />,
          );
          for (const hub of hubs)
            nodes.push(
              <Project
                key={hub.path}
                name="Netzwerk-Hub"
                detail={`Konnektivität · ${hub.region} · ${hub.key}`}
                components={components[hub.path]}
              />,
            );
          if (values.devops != null)
            nodes.push(
              <Project
                key="devops"
                name={`${company}-pltfm-devops-prod`}
                detail="DevOps"
                components={components.devops}
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
                components={components[`k8s-${id}`]}
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
                {projectTemplates &&
                [
                  "landing_zones_corporate",
                  "landing_zones_public",
                  "sandboxes",
                ].includes(key)
                  ? t("Anwendungsprojekte entstehen erst durch Bestellungen.")
                  : t("Keine Projekte in dieser Konfiguration")}
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
      <figcaption>
        {projectTemplates
          ? t("Struktur deiner Plattform")
          : t("Struktur deiner Landing Zone")}
      </figcaption>
      <p className="muted topology-note">
        {t(
          "Geplante Organisationsstruktur · keine Abfrage bestehender Ressourcen",
        )}
      </p>
      <div className="tree-root">
        <span className="node-symbol" aria-hidden="true">
          ▦
        </span>
        <div>
          <small>{t("Organisation · Bezeichnung aus Konfiguration")}</small>
          <strong>
            {textValue(values.company_name) || t("Deine Organisation")}
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
      {projectTemplates && (
        <section
          className="template-preview"
          aria-label={t("Application Landing Zone Template-Entwürfe")}
        >
          <h3>{t("Application Landing Zone Template-Entwürfe")}</h3>
          <p className="muted">
            {t(
              "Vorlagen für spätere Bestellungen durch Application Owner. Diese Einträge sind keine Projekte im Plattform-Deployment.",
            )}
          </p>
          {projectTemplates.length ? (
            (["corporate", "public", "sandbox"] as const).map((kind) => {
              const templates = projectTemplates.filter(
                (template) => template.kind === kind,
              );
              const first = templates[0];
              if (!first) return null;
              const group = projectTemplateSummary(first, values);
              return (
                <section className="template-preview-group" key={kind}>
                  <h4>
                    {group.kind} · {group.folder} ({templates.length})
                  </h4>
                  {templates.map((template) => {
                    const summary = projectTemplateSummary(template, values);
                    const content = (
                      <>
                        <span className="node-symbol" aria-hidden="true">
                          ◇
                        </span>
                        <span className="template-node-content">
                          <small>
                            {summary.kind} · {template.region}
                          </small>
                          <strong>{summary.name}</strong>
                          <code>{template.key}</code>
                          <span className="node-detail">{summary.network}</span>
                        </span>
                      </>
                    );
                    return onSelectTemplate ? (
                      <button
                        type="button"
                        key={template.id}
                        className="tree-node template-node"
                        aria-pressed={selectedTemplateId === template.id}
                        aria-label={`${t("Template bearbeiten:")} ${summary.name} (${template.key})`}
                        aria-controls="project-template-details"
                        onClick={() => onSelectTemplate(template.id)}
                      >
                        {content}
                      </button>
                    ) : (
                      <div
                        className="tree-node template-node"
                        key={template.id}
                      >
                        {content}
                      </div>
                    );
                  })}
                </section>
              );
            })
          ) : (
            <p className="muted">
              {t("Noch keine Application Landing Zone Templates definiert.")}
            </p>
          )}
        </section>
      )}
    </figure>
  );
}
