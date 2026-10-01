import {
  type JsonValue,
  objectValue,
  type ProjectTemplateDraft,
  type TemplateParameterPolicy,
  templateParameterFields,
  templateParameterPreview,
  type Values,
} from "@lzc/domain";
import { useEffect, useId, useState } from "react";
import { useCatalogueOptions } from "./CloudCatalogues";

function read(settings: Values, path: string): JsonValue | undefined {
  const parts = path.split(".");
  return parts.length === 1
    ? settings[path]
    : objectValue(settings[parts[0] ?? path])[parts[1] ?? ""];
}
function write(settings: Values, path: string, value: JsonValue): Values {
  const parts = path.split(".");
  return parts.length === 1
    ? { ...settings, [path]: value }
    : {
        ...settings,
        [parts[0] ?? path]: {
          ...objectValue(settings[parts[0] ?? path]),
          [parts[1] ?? ""]: value,
        },
      };
}
function displayValue(value: JsonValue | undefined): string {
  if (typeof value === "boolean")
    return value ? "Eingeschaltet" : "Ausgeschaltet";
  if (Array.isArray(value))
    return value.length
      ? value
          .map((item) =>
            typeof item === "object" && item !== null
              ? `${objectValue(item).role}: ${objectValue(item).subject}`
              : String(item),
          )
          .join(", ")
      : "Keine Einträge";
  return value == null ? "Standard" : String(value);
}
const defaults: Record<string, JsonValue> = {
  env: "dev",
  secretsmanager_enabled: true,
  "observability.enabled": false,
  "observability.plan_name": "Observability-Starter-EU01",
  "observability.acl": [],
};
function ListInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const id = useId();
  const serialized = value.join("\n");
  const [text, setText] = useState(serialized);
  useEffect(() => setText(serialized), [serialized]);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        rows={3}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() =>
          onChange([
            ...new Set(
              text
                .split(/[\n,]/)
                .map((v) => v.trim())
                .filter(Boolean),
            ),
          ])
        }
      />
      <p className="field-hint">
        Ein Wert pro Zeile; beim Verlassen des Felds übernehmen.
      </p>
    </div>
  );
}
function ValueInput({
  label,
  type,
  value,
  choices,
  onChange,
}: {
  label: string;
  type: string;
  value: JsonValue | undefined;
  choices?: string[] | undefined;
  onChange: (value: JsonValue) => void;
}) {
  const id = useId();
  if (type === "string-list" && choices?.length)
    return (
      <fieldset>
        <legend>{label}</legend>
        {choices.map((choice) => (
          <label key={choice} className="parameter-choice">
            <input
              type="checkbox"
              checked={Array.isArray(value) && value.includes(choice)}
              onChange={(event) => {
                const selected = Array.isArray(value)
                  ? value.filter((v): v is string => typeof v === "string")
                  : [];
                onChange(
                  event.target.checked
                    ? [...selected, choice]
                    : selected.filter((v) => v !== choice),
                );
              }}
            />
            {choice}
          </label>
        ))}
      </fieldset>
    );
  if (type === "string-list")
    return (
      <ListInput
        label={label}
        value={
          Array.isArray(value)
            ? value.filter((v): v is string => typeof v === "string")
            : []
        }
        onChange={onChange}
      />
    );
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {type === "boolean" ? (
        <select
          id={id}
          value={value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "true")}
        >
          {value === undefined && <option value="">Bitte auswählen</option>}
          <option value="true">Eingeschaltet</option>
          <option value="false">Ausgeschaltet</option>
        </select>
      ) : choices?.length ? (
        <select
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        >
          {!choices.includes(String(value)) && (
            <option value={typeof value === "string" ? value : ""}>
              {value === undefined
                ? "Bitte auswählen"
                : `${String(value)} (nicht freigegeben)`}
            </option>
          )}
          {choices.map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

function AllowedValues({
  path,
  region,
  label,
  value,
  onChange,
}: {
  path: string;
  region: string;
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const options = useCatalogueOptions(path, region);
  if (!options)
    return <ListInput label={label} value={value} onChange={onChange} />;
  const available = new Set(options.map((option) => option.value));
  return (
    <fieldset>
      <legend>{label}</legend>
      {[
        ...options,
        ...value
          .filter((choice) => !available.has(choice))
          .map((choice) => ({
            value: choice,
            label: `${choice} (nicht im geladenen Katalog)`,
          })),
      ].map((option) => (
        <label key={option.value} className="parameter-choice">
          <input
            type="checkbox"
            checked={value.includes(option.value)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...value, option.value]
                  : value.filter((choice) => choice !== option.value),
              )
            }
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

export function TemplateParameters({
  template,
  onChange,
}: {
  template: ProjectTemplateDraft;
  onChange: (patch: {
    settings?: Values;
    parameterPolicy?: TemplateParameterPolicy;
  }) => void;
}) {
  const [inputs, setInputs] = useState<Record<string, JsonValue>>({});
  const catalogue = useCatalogueOptions(
    "landing_zones[*].observability.plan_name",
    template.region,
  );
  const projectRoles = useCatalogueOptions(
    "role_assignments[*].role",
    template.region,
  );
  const fields = templateParameterFields;
  const policy: TemplateParameterPolicy = template.parameterPolicy ?? {
    schema_version: 1,
    fields: {},
  };
  const setPolicy = (
    path: string,
    rule: TemplateParameterPolicy["fields"][string],
  ) =>
    onChange({
      parameterPolicy: {
        ...policy,
        fields: { ...policy.fields, [path]: rule },
      },
    });
  const preview = templateParameterPreview(template, inputs);
  if (template.kind === "sandbox")
    return (
      <p className="info-banner">
        Sandbox-Einstellungen bleiben vorerst fest vorgegeben. Ihre Parameter
        müssen gesondert gegen das Sandbox-Modul qualifiziert werden.
      </p>
    );
  return (
    <section
      className="template-parameters"
      aria-label={`Eingaben und Verknüpfungen: ${template.name}`}
    >
      <h4>Eingaben und Verknüpfungen</h4>
      <p>
        Lege fest, was vorgegeben ist und was ein Application Owner bei der
        Bestellung auswählen darf. Alle weiteren Einstellungen, Region und SNA
        bleiben fest. Organisation und verantwortliche Person stammen später aus
        dem verifizierten Kontext.
      </p>
      {!template.parameterPolicy && (
        <p className="info-banner">
          Bestehender Entwurf: Alle Werte bleiben fest, bis du eine Eingabe
          ausdrücklich freigibst.
        </p>
      )}
      {fields.map((field) => {
        const rule = policy.fields[field.path] ?? { source: "fixed" as const };
        if (field.path === "role_assignments") {
          const assigned = rule.source === "context" ? rule.roles : [];
          const customRoles = Array.isArray(template.settings.custom_roles)
            ? template.settings.custom_roles
                .map((role) => String(objectValue(role).name ?? ""))
                .filter(Boolean)
            : [];
          const roleOptions = [
            ...new Set([
              ...(projectRoles?.map((role) => role.value) ?? []),
              ...customRoles,
              ...assigned,
            ]),
          ];
          return (
            <details key={field.path} className="parameter-card">
              <summary>
                {field.label} ·{" "}
                {rule.source === "context"
                  ? "Aus verifiziertem Kontext"
                  : "Fest vorgegeben"}
              </summary>
              <div className="field">
                <label htmlFor={`${template.id}-roles-source`}>
                  Wertquelle: {field.label}
                </label>
                <select
                  id={`${template.id}-roles-source`}
                  value={rule.source}
                  onChange={(event) =>
                    setPolicy(
                      field.path,
                      event.target.value === "context"
                        ? {
                            source: "context",
                            variable: "verified-project-owner",
                            roles: [],
                          }
                        : { source: "fixed" },
                    )
                  }
                >
                  <option value="fixed">Fest vorgegeben</option>
                  <option value="context">Aus verifiziertem Kontext</option>
                </select>
              </div>
              {rule.source === "context" && (
                <>
                  <div className="field">
                    <label htmlFor={`${template.id}-roles-variable`}>
                      Instanziierungsvariable
                    </label>
                    <select
                      id={`${template.id}-roles-variable`}
                      value={rule.variable}
                      disabled
                    >
                      <option value="verified-project-owner">
                        Projektverantwortliche Person (verifizierte
                        STACKIT-Identität)
                      </option>
                    </select>
                  </div>
                  <fieldset>
                    <legend>
                      Rollen für die projektverantwortliche Person
                    </legend>
                    {roleOptions.map((role) => (
                      <label key={role} className="parameter-choice">
                        <input
                          type="checkbox"
                          checked={assigned.includes(role)}
                          onChange={(event) =>
                            setPolicy(field.path, {
                              ...rule,
                              roles: event.target.checked
                                ? [...assigned, role]
                                : assigned.filter((value) => value !== role),
                            })
                          }
                        />
                        {role}
                      </label>
                    ))}
                  </fieldset>
                  {!roleOptions.length && (
                    <p className="field-hint">
                      Kein Rollenkatalog geladen und keine eigene Projektrolle
                      definiert.
                    </p>
                  )}
                  <p className="field-hint">
                    Die Identität wird bei der Instanziierung geprüft. Ein
                    GitHub-Login ist keine STACKIT-Identität. Rollen aus dem
                    Referenzprojekt benötigen im Zielprojekt eine entsprechende
                    Rollendefinition.
                  </p>
                </>
              )}
            </details>
          );
        }
        const current = (read(template.settings, field.path) ??
          defaults[field.path]) as string | boolean | string[];
        return (
          <details key={field.path} className="parameter-card">
            <summary>
              {field.label} ·{" "}
              {rule.source === "fixed"
                ? "Fest vorgegeben"
                : rule.source === "input"
                  ? "Bei Bestellung auswählbar"
                  : "Automatisch verknüpft"}
            </summary>
            <div className="field">
              <label htmlFor={`${template.id}-${field.path}-source`}>
                Wertquelle: {field.label}
              </label>
              <select
                id={`${template.id}-${field.path}-source`}
                value={rule.source}
                onChange={(event) => {
                  const source = event.target.value;
                  setInputs({});
                  if (source === "fixed")
                    setPolicy(field.path, { source: "fixed" });
                  else if (source === "binding") {
                    if (
                      Array.isArray(current) &&
                      current.length &&
                      !window.confirm(
                        "Die feste ACL durch eine Projektnetz-Verknüpfung ersetzen? Diese Verknüpfung ist noch nicht zur Ausführung freigegeben.",
                      )
                    )
                      return;
                    onChange({
                      settings: write(template.settings, field.path, []),
                      parameterPolicy: {
                        ...policy,
                        fields: {
                          ...policy.fields,
                          [field.path]: {
                            source: "binding",
                            binding: "own-project-network",
                          },
                        },
                      },
                    });
                  } else
                    setPolicy(field.path, {
                      source: "input",
                      required: true,
                      ...(field.type === "string-list" &&
                      Array.isArray(current) &&
                      !current.length
                        ? {}
                        : { default: current }),
                      ...(field.type === "string-list"
                        ? { choices: Array.isArray(current) ? current : [] }
                        : field.type === "string"
                          ? {
                              choices:
                                field.path === "env"
                                  ? [
                                      ...new Set([
                                        "dev",
                                        "test",
                                        "prod",
                                        String(current),
                                      ]),
                                    ]
                                  : field.path === "observability.plan_name" &&
                                      catalogue?.length
                                    ? [
                                        ...new Set([
                                          ...catalogue.map(
                                            (option) => option.value,
                                          ),
                                          String(current),
                                        ]),
                                      ]
                                    : [String(current)],
                            }
                          : {}),
                    });
                }}
              >
                <option value="fixed">Fest vorgegeben</option>
                {(field.sources as readonly string[]).includes("input") && (
                  <option value="input">Bei Bestellung auswählbar</option>
                )}
                {(field.sources as readonly string[]).includes("binding") && (
                  <option
                    value="binding"
                    disabled={template.kind !== "corporate"}
                  >
                    Eigenes Projektnetz (noch nicht ausführbar)
                  </option>
                )}
              </select>
              {field.path === "observability.acl" &&
                template.kind === "public" && (
                  <p className="field-hint">
                    Public-Vorlagen erzeugen kein eigenes Projektnetz. Diese
                    Bindung benötigt ein Corporate-Netz und einen nachgewiesenen
                    öffentlichen Egress.
                  </p>
                )}
            </div>
            {rule.source === "fixed" && (
              <ValueInput
                label={`Fester Wert: ${field.label}`}
                type={field.type}
                value={current}
                choices={
                  field.path === "observability.plan_name"
                    ? catalogue?.map((o) => o.value)
                    : undefined
                }
                onChange={(value) =>
                  onChange({
                    settings: write(template.settings, field.path, value),
                  })
                }
              />
            )}
            {rule.source === "input" && (
              <>
                {field.type !== "boolean" && (
                  <AllowedValues
                    path={field.path}
                    region={template.region}
                    label={`Erlaubte Werte: ${field.label}`}
                    value={rule.choices ?? []}
                    onChange={(choices) => {
                      const next = { ...rule, choices };
                      if (
                        next.default !== undefined &&
                        !(Array.isArray(next.default)
                          ? next.default.every((item) => choices.includes(item))
                          : choices.includes(String(next.default)))
                      )
                        delete next.default;
                      setPolicy(field.path, next);
                    }}
                  />
                )}
                <label>
                  <input
                    type="checkbox"
                    checked={rule.required}
                    disabled={
                      field.type === "string-list" && !rule.choices?.length
                    }
                    onChange={(e) =>
                      setPolicy(field.path, {
                        ...rule,
                        required: e.target.checked,
                      })
                    }
                  />{" "}
                  Pflichtangabe bei Bestellung
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={rule.default !== undefined}
                    disabled={
                      field.type === "string-list" && !rule.choices?.length
                    }
                    onChange={(e) => {
                      const next = { ...rule };
                      if (e.target.checked)
                        next.default =
                          field.type === "string"
                            ? (rule.choices?.[0] ?? current)
                            : field.type === "string-list"
                              ? rule.choices?.filter(
                                  (choice) =>
                                    Array.isArray(current) &&
                                    current.includes(choice),
                                ).length
                                ? rule.choices.filter(
                                    (choice) =>
                                      Array.isArray(current) &&
                                      current.includes(choice),
                                  )
                                : (rule.choices?.slice(0, 1) ?? [])
                              : current;
                      else delete next.default;
                      setPolicy(field.path, next);
                    }}
                  />{" "}
                  Vorauswahl anbieten
                </label>
                {rule.default !== undefined && (
                  <ValueInput
                    label={`Vorauswahl: ${field.label}`}
                    type={field.type}
                    value={rule.default}
                    choices={rule.choices}
                    onChange={(value) =>
                      setPolicy(field.path, {
                        ...rule,
                        default: value as string | boolean | string[],
                      })
                    }
                  />
                )}
                <div className="field">
                  <label htmlFor={`${template.id}-${field.path}-hint`}>
                    Erklärung für Besteller: {field.label}
                  </label>
                  <input
                    id={`${template.id}-${field.path}-hint`}
                    value={rule.description ?? ""}
                    onChange={(e) =>
                      setPolicy(field.path, {
                        ...rule,
                        description: e.target.value,
                      })
                    }
                  />
                </div>
              </>
            )}
            {rule.source === "binding" && (
              <p className="validation-box">
                Referenz auf das eigene Projektnetz dieser Instanz. Die Adresse
                steht erst bei der Bereitstellung fest. STACKIT Observability
                filtert öffentliche Quelladressen; die Zuordnung zum wirksamen
                Egress ist noch nicht qualifiziert. Veröffentlichung und
                Ausführung dieser Verknüpfung bleiben gesperrt.
              </p>
            )}
            {field.path === "env" && (
              <p className="field-hint">
                Stage wird bei Anlage ausgewählt. Sie beeinflusst
                Ressourcennamen; spätere Änderungen benötigen einen gesondert
                geprüften Update-Vorgang.
              </p>
            )}
            {field.path === "observability.acl" && (
              <p className="field-hint">
                Eine leere feste ACL begrenzt den Zugriff nicht. Für eine
                Bestellauswahl gültige CIDRs in die erlaubten Werte aufnehmen.
                Keine automatische Freigabe bei einer fehlenden
                Netzwerkreferenz.
              </p>
            )}
          </details>
        );
      })}
      <details className="parameter-preview">
        <summary>Bestellung testen</summary>
        <p>
          Lokale Vorschau des späteren Bestellformulars. Es werden keine
          Ressourcen erstellt und keine Cloud-Zugriffe ausgeführt.
          Veröffentlichung und Application-Self-Service folgen separat.
        </p>
        {fields
          .filter((field) => policy.fields[field.path]?.source === "input")
          .map((field) => {
            const rule = policy.fields[field.path];
            if (rule?.source !== "input") return null;
            return (
              <div key={field.path}>
                <ValueInput
                  label={`Bestellung: ${field.label}`}
                  type={field.type}
                  value={inputs[field.path] ?? rule.default}
                  choices={rule.choices}
                  onChange={(value) =>
                    setInputs({ ...inputs, [field.path]: value })
                  }
                />
                <p className="field-hint">{rule.description}</p>
              </div>
            );
          })}
        <button
          type="button"
          className="text-button"
          onClick={() => setInputs({})}
        >
          Testeingaben zurücksetzen
        </button>
        {!preview.valid ? (
          <p role="alert">{preview.error}</p>
        ) : (
          <>
            <h5>Wirksame Werte und Herkunft</h5>
            <dl>
              {fields.map((field) => (
                <div key={field.path}>
                  <dt>{field.label}</dt>
                  <dd>
                    {preview.result.contextBindings.some(
                      (binding) =>
                        binding.path === field.path &&
                        binding.status === "unresolved",
                    )
                      ? "Projektverantwortliche Person wird bei der Instanziierung zugeordnet"
                      : preview.result.bindings.some(
                            (b) => b.path === field.path,
                          )
                        ? "Wird aus der Ressourcenverknüpfung ermittelt"
                        : displayValue(
                            read(preview.result.settings, field.path),
                          )}{" "}
                    · {preview.result.provenance[field.path]?.description}
                  </dd>
                </div>
              ))}
            </dl>
            {preview.result.qualificationBlockers.map((message) => (
              <p className="validation-box" key={message}>
                {message}
              </p>
            ))}
          </>
        )}
      </details>
    </section>
  );
}
