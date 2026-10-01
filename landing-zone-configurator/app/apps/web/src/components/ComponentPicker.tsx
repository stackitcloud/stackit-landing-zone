import { effectiveInput, inputDefinition, type Values } from "@lzc/domain";
import { type ReactNode, useState } from "react";
import { labelFor } from "./feature-labels";

// This is presentation state only. Opening the catalogue never edits an export.
export function ComponentPicker({
  names,
  values,
  render,
}: {
  names: string[];
  values: Values;
  render: (name: string) => ReactNode;
}) {
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const [editing, setEditing] = useState<string[]>([]);
  const enabled = (name: string) => {
    const value = effectiveInput(values, name);
    if (value == null) return false;
    const type = inputDefinition(name).type;
    return typeof type !== "string" &&
      (type[0] === "map" || type[0] === "list" || type[0] === "set")
      ? Object.keys(value).length > 0
      : true;
  };
  const visible = names.filter(
    (name) => enabled(name) || editing.includes(name),
  );
  const available = names.filter((name) => !visible.includes(name));
  return (
    <section aria-label="Optionale Komponenten">
      {visible.length === 0 && (
        <p className="muted">
          Hier sind noch keine optionalen Komponenten aktiviert.
        </p>
      )}
      {visible.map((name) => (
        <div key={name}>
          {render(name)}
          {!enabled(name) && (
            <button
              type="button"
              className="text-button"
              onClick={() =>
                setEditing(editing.filter((item) => item !== name))
              }
            >
              Konfiguration schließen: {labelFor(name)}
            </button>
          )}
        </div>
      ))}
      {available.length > 0 && (
        <button
          type="button"
          className="button secondary"
          aria-expanded={catalogueOpen}
          onClick={() => setCatalogueOpen(!catalogueOpen)}
        >
          Komponente hinzufügen
        </button>
      )}
      {catalogueOpen && available.length > 0 && (
        <section className="project-card" aria-label="Verfügbare Komponenten">
          <p>
            Wähle eine Komponente. Erst ihre Konfiguration verändert den
            Entwurf.
          </p>
          {available.map((name) => (
            <p key={name}>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setEditing([...editing, name]);
                  setCatalogueOpen(false);
                }}
              >
                Hinzufügen: {labelFor(name)}
              </button>
            </p>
          ))}
        </section>
      )}
    </section>
  );
}
