import {
  type InputType,
  type JsonValue,
  objectValue,
  regionalConnectivityType,
} from "@lzc/domain";
import { useId, useState } from "react";
import { useCatalogueOptions } from "./CloudCatalogues";
import { hints, labelFor } from "./feature-labels";

export function emptyValue(type: InputType): JsonValue {
  if (type === "string") return "";
  if (type === "number") return 0;
  if (type === "bool") return false;
  if (typeof type === "string") throw new Error("Ungeprüfter Eingabetyp");
  if (type[0] === "list" || type[0] === "set") return [];
  if (type[0] === "map") return {};
  if (type[0] !== "object") throw new Error("Ungeprüfter Eingabetyp");
  return Object.fromEntries(
    Object.entries(type[1])
      .filter(([key]) => !(type[2] ?? []).includes(key))
      .map(([key, child]) => [key, emptyValue(child)]),
  );
}
export function StructuredField({
  name,
  type,
  value,
  effective,
  optional = false,
  allowDisable = false,
  onChange,
  omit = [],
  title,
  disableValue = null,
  path = name,
  referenceKeys = [],
  networkAreaKeys = {},
  regionContext = "eu01",
}: {
  name: string;
  type: InputType;
  value: JsonValue | undefined;
  effective?: JsonValue | undefined;
  optional?: boolean;
  allowDisable?: boolean;
  onChange: (value: JsonValue | undefined) => void;
  omit?: string[];
  title?: string;
  disableValue?: JsonValue;
  path?: string;
  referenceKeys?: string[];
  networkAreaKeys?: Record<string, string[]>;
  regionContext?: string;
}) {
  const id = useId();
  const [newKey, setNewKey] = useState("");
  const [error, setError] = useState("");
  const label = title ?? labelFor(name);
  const simple = typeof type === "string";
  const missing = value === undefined || value === null;
  const standard =
    effective === undefined || effective === null
      ? "nicht aktiviert"
      : typeof effective === "boolean"
        ? effective
          ? "eingeschaltet"
          : "ausgeschaltet"
        : typeof effective === "object"
          ? Object.keys(effective).length === 0
            ? "keine Einträge"
            : "Voreinstellung des Accelerators"
          : String(effective);
  const cloudOptions = useCatalogueOptions(path, regionContext);
  const choices = cloudOptions
    ? cloudOptions.map((option) => option.value)
    : path.endsWith(".network_area_key")
      ? (networkAreaKeys[regionContext] ?? [])
      : path === "firewall_config.aliases[*].type"
        ? [
            "host",
            "network",
            "port",
            "url",
            "urltable",
            "urljson",
            "geoip",
            "asn",
            "networkgroup",
            "mac",
            "external",
          ]
        : path === "firewall_config.rules[*].action"
          ? ["pass", "block", "reject"]
          : path === "firewall_config.rules[*].direction"
            ? ["in", "out"]
            : path === "region" || path.endsWith(".region")
              ? ["eu01", "eu02"]
              : path.endsWith(".secrets_enforcement.mode")
                ? ["audit", "soft", "strict"]
                : name === "resource_type" && path.startsWith("audit_logs.")
                  ? ["organization", "folder", "project"]
                  : name === "routing_type" && path.includes(".vpn.")
                    ? ["POLICY_BASED", "ROUTE_BASED"]
                    : undefined;
  const keyChoices =
    path === "connectivity_regions"
      ? ["eu01", "eu02"]
      : path === "landing_zone_namespace_services"
        ? referenceKeys
        : undefined;
  const disabled =
    allowDisable && JSON.stringify(value) === JSON.stringify(disableValue);
  const controls = optional && (
    <div className="field-options">
      <button
        type="button"
        className="text-button"
        disabled={value === undefined}
        onClick={() => onChange(undefined)}
      >
        Accelerator-Standard verwenden
      </button>
      {!simple && allowDisable && (
        <button
          type="button"
          className="text-button"
          disabled={disabled}
          onClick={() => {
            if (
              !missing &&
              !window.confirm(
                `${label} deaktivieren? Zugehörige Konfigurationen werden entfernt. Abhängige Dienste anschließend prüfen.`,
              )
            )
              return;
            onChange(structuredClone(disableValue));
          }}
        >
          Deaktivieren
        </button>
      )}
    </div>
  );
  if (missing && optional)
    return (
      <div className="shared-field optional-field">
        <strong>{label}</strong>
        <p className="field-hint">
          {value === null && allowDisable
            ? "Deaktiviert"
            : `Standard: ${standard}`}
        </p>
        {cloudOptions && (
          <p className="field-hint">
            Aus dem geladenen STACKIT-Produktkatalog. Fehlende Bestandswerte
            werden nicht automatisch ersetzt.
          </p>
        )}
        {hints[name] && <p className="field-hint">{hints[name]}</p>}
        <button
          type="button"
          className="button secondary"
          onClick={() =>
            onChange(
              (simple || name === "rm_folders") && effective != null
                ? structuredClone(effective)
                : emptyValue(type),
            )
          }
        >
          {simple ? "Eigene Einstellung" : "Konfigurieren"}: {label}
        </button>
        {controls}
      </div>
    );
  if (simple)
    return (
      <div className="field shared-field">
        <label htmlFor={id}>{label}</label>
        {type === "bool" ? (
          <select
            id={id}
            value={String(value ?? false)}
            onChange={(event) => onChange(event.target.value === "true")}
          >
            <option value="true">Eingeschaltet</option>
            <option value="false">Ausgeschaltet</option>
          </select>
        ) : choices ? (
          <select
            id={id}
            value={String(value ?? "")}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="" disabled>
              Bitte auswählen
            </option>
            {typeof value === "string" &&
              value !== "" &&
              !choices.includes(value) && (
                <option value={value} disabled>
                  {value} (
                  {cloudOptions
                    ? "nicht im geladenen Katalog"
                    : "nicht unterstützt"}
                  )
                </option>
              )}
            {choices.map((choice) => (
              <option key={choice} value={choice}>
                {cloudOptions?.find((option) => option.value === choice)
                  ?.label ?? choice}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            type={type === "number" ? "number" : "text"}
            value={
              typeof value === "string" || typeof value === "number"
                ? value
                : ""
            }
            onChange={(event) =>
              onChange(
                type === "number"
                  ? Number(event.target.value)
                  : event.target.value,
              )
            }
          />
        )}
        {hints[name] && <p className="field-hint">{hints[name]}</p>}
        {controls}
      </div>
    );
  const childType =
    type[0] === "map" && type[1] === "dynamic"
      ? regionalConnectivityType()
      : type[1];
  const updateObject = (key: string, child: JsonValue | undefined) => {
    const next = { ...objectValue(value) };
    if (child === undefined) delete next[key];
    else next[key] = child;
    onChange(next);
  };
  return (
    <details className="feature-section" open={name === "identity"}>
      <summary>
        {label}
        {Array.isArray(value)
          ? ` · ${value.length}`
          : type[0] === "map"
            ? ` · ${Object.keys(objectValue(value)).length}`
            : ""}
      </summary>
      {hints[name] && <p className="field-hint">{hints[name]}</p>}
      {disabled && <p className="field-hint">Deaktiviert</p>}
      {controls}
      {type[0] === "object" ? (
        <div className="structured-grid">
          {Object.entries(type[1])
            .filter(([key]) => !omit.includes(key))
            .map(([key, fieldType]) => (
              <StructuredField
                key={key}
                name={key}
                path={`${path}.${key}`}
                referenceKeys={referenceKeys}
                networkAreaKeys={networkAreaKeys}
                regionContext={
                  typeof objectValue(value).region === "string"
                    ? String(objectValue(value).region)
                    : regionContext
                }
                type={fieldType}
                value={objectValue(value)[key]}
                effective={objectValue(effective)[key]}
                optional={(type[2] ?? []).includes(key)}
                onChange={(child) => updateObject(key, child)}
              />
            ))}
        </div>
      ) : type[0] === "map" ? (
        <>
          {Object.entries(objectValue(value)).map(([key, child]) => (
            <div className="collection-entry" key={key}>
              <StructuredField
                name={key}
                path={`${path}[*]`}
                referenceKeys={referenceKeys}
                networkAreaKeys={networkAreaKeys}
                regionContext={
                  path === "connectivity_regions" ? key : regionContext
                }
                title={key}
                type={childType as InputType}
                value={child}
                effective={objectValue(effective)[key]}
                omit={name === "rm_folders" ? ["description"] : []}
                onChange={(next) => updateObject(key, next)}
              />
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  if (
                    window.confirm(
                      `Eintrag „${key}“ entfernen? Abhängige Projekte und Dienste anschließend prüfen.`,
                    )
                  )
                    updateObject(key, undefined);
                }}
              >
                Eintrag entfernen: {key}
              </button>
            </div>
          ))}
          <div className="field">
            <label htmlFor={`${id}-key`}>Neue Kennung für {label}</label>
            {keyChoices ? (
              <select
                id={`${id}-key`}
                value={newKey}
                onChange={(event) => setNewKey(event.target.value)}
              >
                <option value="">Bitte auswählen</option>
                {keyChoices
                  .filter((key) => !Object.hasOwn(objectValue(value), key))
                  .map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
              </select>
            ) : (
              <input
                id={`${id}-key`}
                value={newKey}
                onChange={(event) => setNewKey(event.target.value)}
              />
            )}
          </div>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              if (
                (keyChoices !== undefined && !keyChoices.includes(newKey)) ||
                !/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/.test(newKey) ||
                ["constructor", "prototype", "__proto__"].includes(newKey)
              ) {
                setError("Bitte eine gültige, eindeutige Kennung angeben.");
                return;
              }
              if (Object.hasOwn(objectValue(value), newKey)) {
                setError("Die Kennung existiert bereits.");
                return;
              }
              updateObject(newKey, emptyValue(childType as InputType));
              setNewKey("");
              setError("");
            }}
          >
            Eintrag zu {label} hinzufügen
          </button>
          {error && <p role="alert">{error}</p>}
        </>
      ) : (
        <>
          {(Array.isArray(value) ? value : []).map((child, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: ordered literal lists use positional identity; every field value is controlled.
            <div className="collection-entry" key={`${id}-${index}`}>
              <StructuredField
                name={name}
                path={`${path}[*]`}
                referenceKeys={referenceKeys}
                networkAreaKeys={networkAreaKeys}
                regionContext={
                  typeof objectValue(value).region === "string"
                    ? String(objectValue(value).region)
                    : regionContext
                }
                title={`${label} ${index + 1}`}
                type={childType as InputType}
                value={child}
                onChange={(next) => {
                  const items = [...(value as JsonValue[])];
                  items[index] = next ?? null;
                  onChange(items);
                }}
              />
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  const items = [...(value as JsonValue[])];
                  items.splice(index, 1);
                  onChange(items);
                }}
              >
                Eintrag {index + 1} entfernen
              </button>
            </div>
          ))}
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              onChange([
                ...(Array.isArray(value) ? value : []),
                emptyValue(childType as InputType),
              ])
            }
          >
            Eintrag zu {label} hinzufügen
          </button>
        </>
      )}
    </details>
  );
}
