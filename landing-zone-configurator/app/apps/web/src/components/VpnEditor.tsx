import { type InputType, type JsonValue, objectValue } from "@lzc/domain";
import { useId, useState } from "react";
import { labelFor } from "./feature-labels";
import { emptyValue, StructuredField } from "./StructuredField";

const documentation =
  "https://docs.stackit.cloud/products/network/connectivity-hybrid-multi-cloud/vpn/";
function fields(type: InputType): Record<string, InputType> {
  return typeof type !== "string" && type[0] === "object" ? type[1] : {};
}
function changed(
  value: JsonValue | undefined,
  key: string,
  child: JsonValue | undefined,
): JsonValue {
  const next = { ...objectValue(value) };
  if (child === undefined) delete next[key];
  else next[key] = child;
  return next;
}

/** A view of the existing Accelerator contract; opening a step never changes values. */
export function VpnEditor({
  value,
  type,
  onChange,
  region = "eu01",
  effective,
}: {
  value: JsonValue | undefined;
  type: InputType;
  onChange: (value: JsonValue | undefined) => void;
  region?: string;
  effective?: JsonValue | undefined;
}) {
  const [step, setStep] = useState(0);
  const [newKey, setNewKey] = useState("");
  const [error, setError] = useState("");
  const id = useId();
  const current = objectValue(value);
  const defaults = objectValue(effective);
  const schema = fields(type);
  const connections = objectValue(current.connections);
  const connectionMap = schema.connections;
  const connectionType =
    typeof connectionMap !== "string" && connectionMap?.[0] === "map"
      ? connectionMap[1]
      : undefined;
  const routing = String(
    current.routing_type ?? defaults.routing_type ?? "ROUTE_BASED",
  );
  const set = (key: string, child: JsonValue | undefined) =>
    onChange(changed(value, key, child));
  const field = (name: string) =>
    schema[name] && (
      <StructuredField
        key={name}
        name={name}
        type={schema[name]}
        value={current[name]}
        effective={
          defaults[name] ??
          (name === "plan_id"
            ? "p100"
            : name === "routing_type"
              ? "ROUTE_BASED"
              : undefined)
        }
        optional={name !== "availability_zones"}
        path={`connectivity.vpn.${name}`}
        regionContext={region}
        onChange={(child) => set(name, child)}
        title={
          name === "availability_zones"
            ? "Verfügbarkeitszonen der beiden Tunnel"
            : labelFor(name)
        }
      />
    );
  const missing: string[] = [];
  const zones = objectValue(current.availability_zones);
  for (const tunnel of ["tunnel1", "tunnel2"]) {
    if (typeof zones[tunnel] !== "string" || !String(zones[tunnel]).trim())
      missing.push(`Verfügbarkeitszone für ${tunnel}`);
  }
  for (const [key, entry] of Object.entries(connections)) {
    const connection = objectValue(entry);
    for (const tunnel of ["tunnel1", "tunnel2"]) {
      const address = objectValue(connection[tunnel]).remote_address;
      if (typeof address !== "string" || !address.trim())
        missing.push(`${key}: Gegenstellenadresse für ${tunnel}`);
    }
    const required =
      routing === "POLICY_BASED"
        ? ["local_subnets", "remote_subnets"]
        : ["static_routes"];
    for (const name of required) {
      const entries = connection[name];
      if (
        !Array.isArray(entries) ||
        entries.length === 0 ||
        entries.some((item) => typeof item !== "string" || !item.trim())
      )
        missing.push(`${key}: ${labelFor(name)}`);
    }
  }
  const steps = [
    "Gateway",
    "Routing",
    "Verbindungen und Tunnel",
    "Zusammenfassung",
  ];
  if (value == null)
    return (
      <section className="notice">
        <h3>STACKIT VPN</h3>
        <p>Kein VPN-Gateway konfiguriert.</p>
        <button
          type="button"
          className="button secondary"
          onClick={() => onChange(emptyValue(type))}
        >
          STACKIT VPN hinzufügen
        </button>
      </section>
    );
  return (
    <section className="vpn-editor">
      <h3>STACKIT VPN · {region}</h3>
      <p>
        Der Accelerator erstellt je SNA dieser Region ein VPN-Gateway und
        übernimmt dieselben Verbindungen für alle diese Gateways. Eine Auswahl
        einzelner SNAs wird derzeit nicht unterstützt.
      </p>
      <p className="notice">
        Dieser Assistent erstellt die Konfiguration der STACKIT-Seite. Das
        entfernte VPN-Gerät muss separat eingerichtet werden. VPN-Deployments
        und die geschützte Anbindung der Pre-Shared Keys sind im gemeinsamen
        Editor noch nicht verfügbar.
      </p>
      <p>
        <a href={documentation} target="_blank" rel="noreferrer">
          STACKIT VPN-Dokumentation
        </a>
      </p>
      <nav aria-label="VPN-Konfigurationsschritte" className="field-options">
        {steps.map((label, index) => (
          <button
            key={label}
            type="button"
            className={step === index ? "button" : "button secondary"}
            aria-current={step === index ? "step" : undefined}
            onClick={() => setStep(index)}
          >
            {index + 1}. {label}
          </button>
        ))}
      </nav>
      {step === 0 && (
        <div>
          <h4>Gateway</h4>
          <p>
            Das Gateway ist der STACKIT-Endpunkt. Beide Tunnel erhalten eine
            Verfügbarkeitszone; ihre öffentlichen Adressen stehen erst nach
            einer Bereitstellung fest.
          </p>
          <a
            href={`${documentation}getting-started/gateway-create/`}
            target="_blank"
            rel="noreferrer"
          >
            STACKIT VPN-Gateway erstellen
          </a>
          {field("display_name")}
          {field("plan_id")}
          {field("availability_zones")}
          <p className="field-hint">
            Leistungsplan und Verfügbarkeitszonen müssen in der gewählten Region
            verfügbar sein. Diese Produktkataloge werden hier noch nicht live
            abgefragt.
          </p>
        </div>
      )}
      {step === 1 && (
        <div>
          <h4>Routing</h4>
          {field("routing_type")}
          <p>
            Das Routingverfahren eines bestehenden Gateways kann nicht
            nachträglich geändert werden. Ein Wechsel erfordert den Ersatz des
            Gateways; vor einer späteren Ausführung muss der Plan auf diese
            Auswirkung geprüft werden.
          </p>
          <p>
            {routing === "POLICY_BASED"
              ? "Policy-based: Pro Verbindung werden die lokalen und entfernten Netze angegeben, deren Verkehr über das VPN laufen soll."
              : "Route-based: Pro Verbindung werden die statischen Routen zu den entfernten Netzen konfiguriert."}
          </p>
          <p>
            BGP wird durch das aktuelle Accelerator-Modul nicht unterstützt.
            Diese VPN-Einstellungen ersetzen keine allgemeine
            SNA-Routing-Tabelle.
          </p>
          <a
            href={`${documentation}basics/gateway-and-connection-options/`}
            target="_blank"
            rel="noreferrer"
          >
            Gateway- und Verbindungsoptionen
          </a>
        </div>
      )}
      {step === 2 && (
        <div>
          <h4>Verbindungen und Tunnel</h4>
          <p>
            Eine Verbindung enthält zwei Tunnel zur Gegenstelle. Die Schlüssel
            werden später über eine geschützte Zugangsanbindung bereitgestellt
            und gehören nicht in diese Konfiguration.
          </p>
          {Object.entries(connections).map(([key, entry]) => {
            if (!connectionType) return null;
            const connection = objectValue(entry);
            const connectionDefaults = objectValue(
              objectValue(defaults.connections)[key],
            );
            const childSchema = fields(connectionType);
            const update = (name: string, child: JsonValue | undefined) =>
              set(
                "connections",
                changed(current.connections, key, changed(entry, name, child)),
              );
            const connectionField = (name: string) =>
              childSchema[name] && (
                <StructuredField
                  key={name}
                  name={name}
                  type={childSchema[name]}
                  value={connection[name]}
                  effective={
                    connectionDefaults[name] ??
                    (name === "enabled" ? true : undefined)
                  }
                  optional={name !== "tunnel1" && name !== "tunnel2"}
                  path={`connectivity.vpn.connections.${key}.${name}`}
                  onChange={(child) => update(name, child)}
                />
              );
            return (
              <section className="project-card" key={key}>
                <h4>Verbindung: {key}</h4>
                {connectionField("display_name")}
                {connectionField("enabled")}
                {routing === "POLICY_BASED" ? (
                  <>
                    {connectionField("local_subnets")}
                    {connectionField("remote_subnets")}
                  </>
                ) : (
                  connectionField("static_routes")
                )}
                <details>
                  <summary>
                    Weitere Routing-Einstellungen (vorhandene Werte bleiben
                    erhalten)
                  </summary>
                  {routing === "POLICY_BASED" ? (
                    connectionField("static_routes")
                  ) : (
                    <>
                      {connectionField("local_subnets")}
                      {connectionField("remote_subnets")}
                    </>
                  )}
                </details>
                {(["tunnel1", "tunnel2"] as const).map((tunnelName, index) => {
                  const tunnelType = childSchema[tunnelName];
                  if (!tunnelType) return null;
                  const tunnelSchema = fields(tunnelType);
                  const tunnel = objectValue(connection[tunnelName]);
                  const tunnelDefaults = objectValue(
                    connectionDefaults[tunnelName],
                  );
                  return (
                    <section key={tunnelName}>
                      <h5>Tunnel {index + 1}</h5>
                      <StructuredField
                        name="remote_address"
                        title="Öffentliche IP-Adresse der Gegenstelle"
                        type={tunnelSchema.remote_address ?? "string"}
                        value={tunnel.remote_address}
                        path={`connectivity.vpn.connections.${key}.${tunnelName}.remote_address`}
                        onChange={(child) =>
                          update(
                            tunnelName,
                            changed(
                              connection[tunnelName],
                              "remote_address",
                              child,
                            ),
                          )
                        }
                      />
                      <details>
                        <summary>Erweiterte Tunnel-Einstellungen</summary>
                        {["peering", "phase1", "phase2"].map(
                          (name) =>
                            tunnelSchema[name] && (
                              <StructuredField
                                key={name}
                                name={name}
                                type={tunnelSchema[name]}
                                value={tunnel[name]}
                                effective={tunnelDefaults[name]}
                                optional
                                path={`connectivity.vpn.connections.${key}.${tunnelName}.${name}`}
                                onChange={(child) =>
                                  update(
                                    tunnelName,
                                    changed(
                                      connection[tunnelName],
                                      name,
                                      child,
                                    ),
                                  )
                                }
                              />
                            ),
                        )}
                      </details>
                    </section>
                  );
                })}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    if (
                      window.confirm(
                        `VPN-Verbindung ${key} aus der Konfiguration entfernen?`,
                      )
                    )
                      set(
                        "connections",
                        changed(current.connections, key, undefined),
                      );
                  }}
                >
                  Verbindung entfernen
                </button>
              </section>
            );
          })}
          <div className="field">
            <label htmlFor={id}>Kennung der neuen VPN-Verbindung</label>
            <input
              id={id}
              value={newKey}
              onChange={(event) => setNewKey(event.target.value)}
              placeholder="standort-zentrale"
            />
          </div>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              const key = newKey.trim();
              if (
                !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(key) ||
                ["__proto__", "prototype", "constructor"].includes(key)
              ) {
                setError(
                  "Bitte eine Kennung mit Buchstaben, Zahlen, Bindestrichen oder Unterstrichen angeben.",
                );
                return;
              }
              if (Object.hasOwn(connections, key)) {
                setError("Diese Verbindungskennung ist bereits vorhanden.");
                return;
              }
              if (!connectionType) return;
              set(
                "connections",
                changed(current.connections, key, emptyValue(connectionType)),
              );
              setNewKey("");
              setError("");
            }}
          >
            VPN-Verbindung hinzufügen
          </button>
          {error && <p role="alert">{error}</p>}
          <p>
            <a
              href={`${documentation}getting-started/connection-create/`}
              target="_blank"
              rel="noreferrer"
            >
              Verbindung und Gegenstelle konfigurieren
            </a>
          </p>
        </div>
      )}
      {step === 3 && (
        <div>
          <h4>Zusammenfassung</h4>
          {missing.length > 0 && (
            <div className="notice">
              <strong>Noch auszufüllen</strong>
              <ul>
                {missing.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          <ul>
            <li>Region: {region}</li>
            <li>Routing: {routing}</li>
            <li>
              {Object.keys(connections).length} Verbindungen mit jeweils zwei
              Tunneln pro SNA
            </li>
            <li>STACKIT-Seite: Gateway und konfigurierte Verbindungen</li>
            <li>
              Noch erforderlich: geschützte Tunnel-Schlüssel, Einrichtung der
              Gegenstelle und Prüfung der Erreichbarkeit
            </li>
          </ul>
          <p>
            Diese Übersicht ist keine erfolgreiche Verbindungsprüfung. Ein
            Gateway ohne Verbindungen stellt noch keine VPN-Verbindung her.
          </p>
        </div>
      )}
      <div className="field-options">
        <button
          type="button"
          className="button secondary"
          disabled={step === 0}
          onClick={() => setStep(step - 1)}
        >
          Zurück
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={step === steps.length - 1}
          onClick={() => setStep(step + 1)}
        >
          Weiter
        </button>
      </div>
    </section>
  );
}
