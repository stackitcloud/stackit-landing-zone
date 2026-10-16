import {
  effectiveInput,
  type InputType,
  inputDefinition,
  type JsonValue,
  objectValue,
  regionalConnectivityType,
  textValue,
  type Values,
} from "@lzc/domain";
import { useState } from "react";
import { t } from "../i18n";
import { labelFor } from "./feature-labels";
import { StructuredField } from "./StructuredField";
import { VpnEditor } from "./VpnEditor";

export function NetworkEditor({
  values,
  onChange,
}: {
  values: Values;
  onChange: (name: string, value: JsonValue | undefined) => void;
}) {
  const [newRegion, setNewRegion] = useState("");
  const regional = objectValue(values.connectivity_regions);
  const single = values.connectivity != null;
  const standardRegion = textValue(values.region) || "eu01";
  const sections = [
    ...(single
      ? [
          {
            key: "standard",
            region: standardRegion,
            settings: objectValue(values.connectivity),
            legacy: true,
          },
        ]
      : []),
    ...Object.entries(regional).map(([region, settings]) => ({
      key: region,
      region,
      settings: objectValue(settings),
      legacy: false,
    })),
  ];
  const update = (key: string, legacy: boolean, value: Values | null) => {
    if (legacy) onChange("connectivity", value);
    else {
      const next = { ...regional };
      if (value === null) delete next[key];
      else next[key] = value;
      onChange(
        "connectivity_regions",
        Object.keys(next).length ? next : undefined,
      );
    }
  };
  return (
    <section aria-label={t("Connectivity nach Region")}>
      <p>
        {t(
          "Jede Region enthält ihre STACKIT Network Areas (SNAs) und die zugehörigen Connectivity-Dienste. Gleiche SNA-Kennungen verbinden Regionen nicht automatisch.",
        )}
      </p>
      {sections.map(({ key, region, settings, legacy }) => (
        <RegionConnectivity
          key={key}
          region={region}
          settings={settings}
          legacy={legacy}
          effective={objectValue(
            effectiveInput({ connectivity: settings }, "connectivity"),
          )}
          onChange={(next) => update(key, legacy, next)}
        />
      ))}
      {single ? (
        <p className="field-hint">
          {t(
            "Diese Konfiguration nutzt die Standardregion aus den Grundlagen. Weitere Regionen benötigen eine ausdrückliche Migration auf regionale Accelerator-Module. Ein automatischer Wechsel könnte bestehende Ressourcenzuordnungen ändern und wird deshalb nicht durchgeführt.",
          )}
        </p>
      ) : (
        <div className="project-card">
          <label htmlFor="connectivity-new-region">
            {t("Weitere Connectivity-Region")}
          </label>
          <select
            id="connectivity-new-region"
            value={newRegion}
            onChange={(event) => setNewRegion(event.target.value)}
          >
            <option value="">{t("Region wählen")}</option>
            {["eu01", "eu02"]
              .filter((region) => !Object.hasOwn(regional, region))
              .map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
          </select>
          <button
            type="button"
            className="button secondary"
            disabled={!newRegion || Object.hasOwn(regional, newRegion)}
            onClick={() => {
              onChange("connectivity_regions", {
                ...regional,
                [newRegion]: {},
              });
              setNewRegion("");
            }}
          >
            {t("Region hinzufügen")}
          </button>
          <p className="field-hint">
            {t(
              "Im regionalen Modell müssen Landing-Zone-Projekte ihre Region ausdrücklich angeben. Eine Region kann zunächst ohne SNA vorbereitet werden.",
            )}
          </p>
        </div>
      )}
      <details className="feature-section">
        <summary>{t("Routing-Tabellen und Routen")}</summary>
        <p>
          {t(
            "Der Accelerator erzeugt je SNA eine WAN-Routing-Tabelle mit Systemrouten und einer Standardroute ins Internet. Corporate-Projekte mit Firewall erhalten eine eigene Tabelle mit Standardroute zur Firewall-LAN-IP bzw. HA-VIP.",
          )}
        </p>
        <p>
          {t(
            "Frei definierbare zusätzliche Tabellen sind kein aktuelles Root-Feature. Statische VPN-Routen werden je VPN-Verbindung konfiguriert. Inter-Region-Verbindungen entstehen nicht automatisch.",
          )}
        </p>
      </details>
    </section>
  );
}

function RegionConnectivity({
  region,
  settings,
  legacy,
  effective,
  onChange,
}: {
  region: string;
  settings: Values;
  legacy: boolean;
  effective?: Values | undefined;
  onChange: (value: Values | null) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string[]>([]);
  const type = legacy
    ? inputDefinition("connectivity").type
    : regionalConnectivityType();
  if (typeof type === "string" || type[0] !== "object")
    throw new Error("Invalid connectivity contract");
  const patch = (name: string, value: JsonValue | undefined) => {
    const next = { ...settings };
    if (value === undefined) delete next[name];
    else next[name] = value;
    onChange(next);
  };
  const areaKeys =
    settings.network_area != null
      ? ["default"]
      : Object.keys(objectValue(settings.network_areas));
  const field = (name: string, optional = true) => (
    <StructuredField
      key={name}
      name={name}
      path={`connectivity.${name}`}
      type={type[1][name] as InputType}
      value={settings[name]}
      effective={effective?.[name]}
      optional={optional}
      allowDisable={name === "firewall"}
      regionContext={region}
      networkAreaKeys={{ [region]: areaKeys }}
      onChange={(value) => patch(name, value)}
    />
  );
  const options = [
    "dns_zones",
    ...(legacy && settings.firewall != null
      ? ["firewall", ...(settings.firewalls != null ? ["firewalls"] : [])]
      : ["firewalls"]),
    "vpn",
  ];
  const active = (name: string) =>
    settings[name] != null &&
    (name === "vpn" ||
      name === "firewall" ||
      Object.keys(objectValue(settings[name])).length > 0);
  const available = options.filter(
    (name) => !active(name) && !editing.includes(name),
  );
  return (
    <section
      className="project-card"
      aria-label={t("Connectivity {{value0}}", { value0: region })}
    >
      <h3>
        {t("Region")} {region}
      </h3>
      <p>
        {areaKeys.length} {t("STACKIT Network Areas (SNAs)")}
        {legacy ? " · Standardregion" : ""}
      </p>
      {settings.network_area != null ? (
        <>
          {field("network_area", false)}
          <button
            type="button"
            className="button secondary"
            disabled={settings.network_areas != null}
            onClick={() => {
              if (settings.network_areas != null) return;
              const next: Values = {
                ...settings,
                network_areas: { default: settings.network_area as JsonValue },
              };
              delete next.network_area;
              onChange(next);
            }}
          >
            {t("Mehrere Netzwerkbereiche verwalten")}
          </button>
          {settings.network_areas != null && (
            <>
              <p role="alert">
                {t(
                  "Einzelkonfiguration und SNA-Liste sind gleichzeitig gesetzt. Bitte die gewünschte Variante beibehalten und die andere ausdrücklich entfernen.",
                )}
              </p>
              {field("network_areas")}
            </>
          )}
        </>
      ) : (
        field("network_areas")
      )}
      {options
        .filter((name) => active(name) || editing.includes(name))
        .map((name) => (
          <div key={name}>
            {name === "vpn" ? (
              <VpnEditor
                value={settings.vpn}
                type={type[1].vpn as InputType}
                effective={effective?.vpn}
                region={region}
                onChange={(value) => patch("vpn", value)}
              />
            ) : (
              field(name)
            )}
            {!active(name) && (
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  setEditing(editing.filter((item) => item !== name))
                }
              >
                {t("Konfiguration schließen:")} {labelFor(name)}
              </button>
            )}
          </div>
        ))}
      {available.length > 0 && (
        <button
          type="button"
          className="button secondary"
          aria-expanded={adding}
          onClick={() => setAdding(!adding)}
        >
          {t("Komponente hinzufügen in")} {region}
        </button>
      )}
      {adding && (
        <section
          aria-label={t("Verfügbare Connectivity-Komponenten {{value0}}", {
            value0: region,
          })}
        >
          {available.map((name) => (
            <p key={name}>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setEditing([...editing, name]);
                  setAdding(false);
                }}
              >
                {t("Hinzufügen:")} {labelFor(name)}
              </button>
            </p>
          ))}
        </section>
      )}
      <details className="feature-section">
        <summary>{t("Erweiterte Connectivity-Einstellungen")}</summary>
        {field("naming_pattern")}
      </details>
      <button
        type="button"
        className="text-button"
        onClick={() => {
          if (
            window.confirm(
              t(
                "Connectivity {{value0}} aus der Konfiguration entfernen? Zugehörige SNAs und Dienste würden bei einem späteren Apply entfernt. Referenzierte SNAs müssen zuerst umgeordnet werden.",
                { value0: region },
              ),
            )
          )
            onChange(null);
        }}
      >
        {t("Connectivity")} {region} entfernen
      </button>
    </section>
  );
}
