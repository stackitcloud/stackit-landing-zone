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
import { t } from "../i18n";
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
};

export function templateObservabilityConfigurable(
  template: ProjectTemplateDraft,
): boolean {
  return (
    template.parameterPolicy?.fields["observability.enabled"]?.source ===
      "input" || read(template.settings, "observability.enabled") === true
  );
}

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
      <label htmlFor={id}>{t(label)}</label>
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
        {t("Ein Wert pro Zeile; beim Verlassen des Felds übernehmen.")}
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
      <fieldset className="parameter-options">
        <legend>{t(label)}</legend>
        <div className="parameter-choice-list">
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
              <span>{choice}</span>
            </label>
          ))}
        </div>
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
      <label htmlFor={id}>{t(label)}</label>
      {type === "boolean" ? (
        <select
          id={id}
          value={value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "true")}
        >
          {value === undefined && (
            <option value="">{t("Bitte auswählen")}</option>
          )}
          <option value="true">{t("Eingeschaltet")}</option>
          <option value="false">{t("Ausgeschaltet")}</option>
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
                ? t("Bitte auswählen")
                : t("{{value0}} (nicht freigegeben)", {
                    value0: String(value),
                  })}
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
    <fieldset className="parameter-options">
      <legend>{t(label)}</legend>
      <div className="parameter-choice-list">
        {[
          ...options,
          ...value
            .filter((choice) => !available.has(choice))
            .map((choice) => ({
              value: choice,
              label: t("{{value0}} (nicht im geladenen Katalog)", {
                value0: choice,
              }),
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
            <span>{t(option.label)}</span>
          </label>
        ))}
      </div>
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
  const [roleSearch, setRoleSearch] = useState("");
  const [selectedRolesOnly, setSelectedRolesOnly] = useState(false);
  const catalogue = useCatalogueOptions(
    "landing_zones[*].observability.plan_name",
    template.region,
  );
  const projectRoles = useCatalogueOptions(
    "role_assignments[*].role",
    template.region,
  );
  const fields = templateParameterFields.filter(
    (field) =>
      field.path !== "observability.plan_name" ||
      templateObservabilityConfigurable(template),
  );
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
        {t(
          "Sandbox-Einstellungen bleiben vorerst fest vorgegeben. Ihre Parameter müssen gesondert gegen das Sandbox-Modul qualifiziert werden.",
        )}
      </p>
    );
  return (
    <section
      className="template-parameters"
      aria-label={t("Eingaben und Verknüpfungen: {{value0}}", {
        value0: template.name,
      })}
    >
      <h4>{t("Eingaben und Verknüpfungen")}</h4>
      <p>
        {t(
          "Lege fest, was vorgegeben ist und was ein Application Owner bei der Bestellung auswählen darf. Alle weiteren Einstellungen, Region und SNA bleiben fest. Organisation und verantwortliche Person stammen später aus dem verifizierten Kontext.",
        )}
      </p>
      {!template.parameterPolicy && (
        <p className="info-banner">
          {t(
            "Bestehender Entwurf: Alle Werte bleiben fest, bis du eine Eingabe ausdrücklich freigibst.",
          )}
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
          ].sort((leftRole, rightRole) => leftRole.localeCompare(rightRole));
          const visibleRoles = roleOptions.filter(
            (role) =>
              role.toLowerCase().includes(roleSearch.trim().toLowerCase()) &&
              (!selectedRolesOnly || assigned.includes(role)),
          );
          return (
            <details key={field.path} className="parameter-card">
              <summary>
                {t(field.label)} ·{" "}
                {rule.source === "context"
                  ? t("Aus verifiziertem Kontext")
                  : t("Fest vorgegeben")}
              </summary>
              <div className="field">
                <label htmlFor={`${template.id}-roles-source`}>
                  {t("Wertquelle:")} {t(field.label)}
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
                  <option value="fixed">{t("Fest vorgegeben")}</option>
                  <option value="context">
                    {t("Aus verifiziertem Kontext")}
                  </option>
                </select>
              </div>
              {rule.source === "context" && (
                <>
                  <div className="field">
                    <label htmlFor={`${template.id}-roles-variable`}>
                      {t("Instanziierungsvariable")}
                    </label>
                    <select
                      id={`${template.id}-roles-variable`}
                      value={rule.variable}
                      disabled
                    >
                      <option value="verified-project-owner">
                        {t(
                          "Projektverantwortliche Person (verifizierte STACKIT-Identität)",
                        )}
                      </option>
                    </select>
                  </div>
                  <fieldset className="role-options">
                    <legend>
                      {t("Rollen für die projektverantwortliche Person")}
                    </legend>
                    <div className="role-filters">
                      <div className="field">
                        <label htmlFor={`${template.id}-role-search`}>
                          {t("Projektrollen durchsuchen")}
                        </label>
                        <input
                          id={`${template.id}-role-search`}
                          type="search"
                          value={roleSearch}
                          onChange={(event) =>
                            setRoleSearch(event.target.value)
                          }
                        />
                      </div>
                      <label className="parameter-choice">
                        <input
                          type="checkbox"
                          checked={selectedRolesOnly}
                          onChange={(event) =>
                            setSelectedRolesOnly(event.target.checked)
                          }
                        />
                        {t("Nur ausgewählte Rollen")}
                      </label>
                    </div>
                    <p className="field-hint" role="status">
                      {assigned.length} {t("ausgewählt ·")}{" "}
                      {visibleRoles.length} von {roleOptions.length}{" "}
                      {t("Rollen")}
                    </p>
                    <div className="role-list">
                      {visibleRoles.map((role) => (
                        <label key={role} className="parameter-choice">
                          <input
                            type="checkbox"
                            checked={assigned.includes(role)}
                            disabled={
                              !assigned.includes(role) && assigned.length >= 100
                            }
                            onChange={(event) =>
                              setPolicy(field.path, {
                                ...rule,
                                roles: event.target.checked
                                  ? [...assigned, role]
                                  : assigned.filter((value) => value !== role),
                              })
                            }
                          />
                          <span>{role}</span>
                        </label>
                      ))}
                    </div>
                    {!visibleRoles.length && roleOptions.length > 0 && (
                      <p className="field-hint">
                        {t("Keine Rollen für diesen Filter.")}
                      </p>
                    )}
                  </fieldset>
                  {!roleOptions.length && (
                    <p className="field-hint">
                      {t(
                        "Kein Rollenkatalog geladen und keine eigene Projektrolle definiert.",
                      )}
                    </p>
                  )}
                  <p className="field-hint">
                    {t(
                      "Die Identität wird bei der Instanziierung geprüft. Ein GitHub-Login ist keine STACKIT-Identität. Rollen aus dem Referenzprojekt benötigen im Zielprojekt eine entsprechende Rollendefinition.",
                    )}
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
              {t(field.label)} ·{" "}
              {rule.source === "fixed"
                ? t("Fest vorgegeben")
                : rule.source === "input"
                  ? t("Bei Bestellung auswählbar")
                  : t("Automatisch verknüpft")}
            </summary>
            <div className="field">
              <label htmlFor={`${template.id}-${field.path}-source`}>
                {t("Wertquelle:")} {t(field.label)}
              </label>
              <select
                id={`${template.id}-${field.path}-source`}
                value={rule.source}
                onChange={(event) => {
                  const source = event.target.value;
                  setInputs({});
                  if (source === "fixed")
                    setPolicy(field.path, { source: "fixed" });
                  else
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
                <option value="fixed">{t("Fest vorgegeben")}</option>
                {(field.sources as readonly string[]).includes("input") && (
                  <option value="input">
                    {t("Bei Bestellung auswählbar")}
                  </option>
                )}
              </select>
            </div>
            {rule.source === "fixed" && (
              <ValueInput
                label={t("Fester Wert: {{value0}}", { value0: t(field.label) })}
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
                    label={t("Erlaubte Werte: {{value0}}", {
                      value0: t(field.label),
                    })}
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
                  {t("Pflichtangabe bei Bestellung")}
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
                  {t("Vorauswahl anbieten")}
                </label>
                {rule.default !== undefined && (
                  <ValueInput
                    label={t("Vorauswahl: {{value0}}", {
                      value0: t(field.label),
                    })}
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
                    {t("Erklärung für Besteller:")} {t(field.label)}
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
            {field.path === "env" && (
              <p className="field-hint">
                {t(
                  "Stage wird bei Anlage ausgewählt. Sie beeinflusst Ressourcennamen; spätere Änderungen benötigen einen gesondert geprüften Update-Vorgang.",
                )}
              </p>
            )}
          </details>
        );
      })}
      <details className="parameter-preview">
        <summary>{t("Bestellung testen")}</summary>
        <p>
          {t(
            "Lokale Vorschau des späteren Bestellformulars. Es werden keine Ressourcen erstellt und keine Cloud-Zugriffe ausgeführt. Veröffentlichung und Bestellungen für Application Landing Zones folgen separat.",
          )}
        </p>
        {fields
          .filter((field) => policy.fields[field.path]?.source === "input")
          .map((field) => {
            const rule = policy.fields[field.path];
            if (rule?.source !== "input") return null;
            return (
              <div key={field.path}>
                <ValueInput
                  label={t("Bestellung: {{value0}}", {
                    value0: t(field.label),
                  })}
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
          {t("Testeingaben zurücksetzen")}
        </button>
        {!preview.valid ? (
          <p role="alert">{preview.error}</p>
        ) : (
          <>
            <h5>{t("Wirksame Werte und Herkunft")}</h5>
            <dl>
              {fields.map((field) => (
                <div key={field.path}>
                  <dt>{t(field.label)}</dt>
                  <dd>
                    {preview.result.contextBindings.some(
                      (binding) =>
                        binding.path === field.path &&
                        binding.status === "unresolved",
                    )
                      ? t(
                          "Projektverantwortliche Person wird bei der Instanziierung zugeordnet",
                        )
                      : preview.result.bindings.some(
                            (b) => b.path === field.path,
                          )
                        ? t("Wird aus der Ressourcenverknüpfung ermittelt")
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
                {t(message)}
              </p>
            ))}
          </>
        )}
      </details>
    </section>
  );
}
