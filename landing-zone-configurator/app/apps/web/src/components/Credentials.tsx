import { useEffect, useRef, useState } from "react";
import type { Session } from "./Account";
import { type AccessCheck, CheckSummary, checkMessages } from "./CheckSummary";
import { Field } from "./Field";

type Profile = {
  id: string;
  name: string;
  serviceAccount: string;
  keyId: string;
  state: "pending" | "stored";
  lastCheck?: AccessCheck | null;
};
const messages: Record<string, string> = {
  ...checkMessages,
  authentication_required: "Bitte melde dich erneut mit GitHub an.",
  invalid_service_account_key:
    "Die Datei muss einen gültigen STACKIT-Service-Account-Schlüssel mit privatem RSA-Schlüssel enthalten. Prüfe Format und Ablaufdatum.",
  invalid_credential_request:
    "Bitte prüfe Profilname, Organisations-ID und Schlüsseldatei.",
  credential_role_required:
    "Zum Anlegen benötigst du die Rolle Administrator oder Deployer.",
  credential_limit_reached:
    "Du kannst höchstens 20 persönliche Profile speichern. Entferne zuerst nicht mehr benötigte Profile.",
  credential_not_found:
    "Das Profil wurde bereits entfernt oder ist nicht zugänglich.",
  invalid_request_origin_or_csrf:
    "Deine Sitzung ist nicht mehr aktuell. Bitte lade die Seite neu.",
};
export function Credentials({ session }: { session: Session | null }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [organizations, setOrganizations] = useState<Record<string, string>>(
    {},
  );
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const active = useRef(false);
  async function checked(response: Response) {
    if (!response.ok) {
      const value = await response.json().catch(() => ({}));
      throw new Error(
        messages[value.error] ??
          "Die Aktion konnte nicht bestätigt werden. Aktualisiere die Liste. Unvollständige Profile kannst du löschen und neu anlegen.",
      );
    }
    return response;
  }
  async function refresh(signal?: AbortSignal) {
    const response = await checked(
      await fetch("/api/v1/credentials", {
        credentials: "same-origin",
        ...(signal ? { signal } : {}),
      }),
    );
    setProfiles((await response.json()).profiles);
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh only uses a fixed endpoint and state setter.
  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    void refresh(controller.signal).catch(() => {
      if (!controller.signal.aborted)
        setError("Profile konnten nicht geladen werden. Bitte aktualisieren.");
    });
    return () => controller.abort();
    // The component is remounted on identity/navigation changes; no key state survives.
  }, [session]);
  async function perform(action: () => Promise<void>) {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Aktion fehlgeschlagen.",
      );
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  async function save() {
    if (!session) return;
    const selected = file.current?.files?.[0];
    if (!selected || selected.size > 24576 || !name.trim()) {
      setError(
        "Gib einen Profilnamen an und wähle eine JSON-Schlüsseldatei mit höchstens 24 KiB.",
      );
      return;
    }
    await perform(async () => {
      try {
        let key: unknown;
        try {
          key = JSON.parse(await selected.text());
        } catch {
          throw new Error("Die ausgewählte Datei enthält kein gültiges JSON.");
        }
        await checked(
          await fetch("/api/v1/credentials", {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json",
              "X-LZC-CSRF": session.csrfToken,
            },
            body: JSON.stringify({ name: name.trim(), serviceAccountKey: key }),
          }),
        );
        setName("");
        setNotice(
          "Der Zugang ist gespeichert. STACKIT-Berechtigungen wurden noch nicht geprüft.",
        );
        await refresh();
      } finally {
        if (file.current) file.current.value = "";
      }
    });
  }
  return (
    <section className="panel">
      <h2>Persönliche Deployment-Zugänge</h2>
      <p>
        Hinterlege den STACKIT-Service-Account für deine späteren Deployments.
        Nur du kannst diese Profile in deinem Arbeitsbereich verwalten.
      </p>
      {!session ? (
        <div className="info-banner">
          <p>Melde dich oben mit GitHub an, um eigene Zugänge zu verwalten.</p>
        </div>
      ) : (
        <>
          <p>
            Die Schlüsseldatei wird im Secrets Manager abgelegt. Sie wird weder
            im Git-Repository gespeichert noch wieder angezeigt. GitHub-Login
            und STACKIT-Deployment verwenden getrennte Zugänge.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <Field
              id="credential-name"
              label="Profilname"
              value={name}
              onChange={setName}
              hint="Zum Wiederfinden, z. B. Entwicklung · Team Plattform. Das Profil legt noch kein Deployment-Ziel fest."
            />
            <div className="field">
              <label htmlFor="credential-file">
                Service-Account-Schlüssel (JSON)
              </label>
              <input
                id="credential-file"
                type="file"
                accept=".json,application/json"
                ref={file}
                required
                disabled={busy}
                aria-describedby="credential-file-hint"
              />
              <p id="credential-file-hint" className="field-hint">
                Verwende die heruntergeladene STACKIT-Schlüsseldatei mit
                enthaltenem privatem RSA-Schlüssel. Bestehende Projekte und
                Berechtigungen werden dadurch nicht verändert.
              </p>
            </div>
            <button
              type="submit"
              className="button primary"
              disabled={busy || !name.trim()}
            >
              Zugang sicher speichern
            </button>
          </form>
          <h3>Deine gespeicherten Zugänge</h3>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => void perform(() => refresh())}
          >
            Zugänge aktualisieren
          </button>
          {!profiles.length && <p>Noch keine persönlichen Zugänge geladen.</p>}
          {profiles.map((profile) => (
            <article className="project-form" key={profile.id}>
              <h3>{profile.name}</h3>
              <p className="credential-account">{profile.serviceAccount}</p>
              <p>
                {profile.state === "stored"
                  ? profile.lastCheck
                    ? "Sicher gespeichert · letzte Prüfung siehe unten"
                    : "Sicher gespeichert · Berechtigungen noch nicht geprüft"
                  : "Speicherung unvollständig · bitte löschen und neu anlegen"}
              </p>
              {profile.lastCheck && <CheckSummary check={profile.lastCheck} />}
              {profile.state === "stored" && (
                <>
                  <Field
                    id={`organization-${profile.id}`}
                    label="Zielorganisation (UUID)"
                    value={
                      organizations[profile.id] ??
                      profile.lastCheck?.organizationId ??
                      ""
                    }
                    onChange={(value) =>
                      setOrganizations((previous) => ({
                        ...previous,
                        [profile.id]: value,
                      }))
                    }
                    hint="Die Organisations-ID findest du im STACKIT Portal oder in deiner Konfiguration. Diese Prüfung verändert keine Cloud-Ressourcen."
                  />
                  <button
                    type="button"
                    className="button secondary"
                    disabled={
                      busy ||
                      !(
                        organizations[profile.id] ??
                        profile.lastCheck?.organizationId
                      )
                    }
                    onClick={() =>
                      void perform(async () => {
                        const response = await checked(
                          await fetch(
                            `/api/v1/credentials/${profile.id}/check`,
                            {
                              method: "POST",
                              credentials: "same-origin",
                              headers: {
                                "Content-Type": "application/json",
                                "X-LZC-CSRF": session.csrfToken,
                              },
                              body: JSON.stringify({
                                organizationId:
                                  organizations[profile.id] ??
                                  profile.lastCheck?.organizationId,
                              }),
                            },
                          ),
                        );
                        const result = await response.json();
                        setNotice(
                          result.check.status === "passed"
                            ? "Anmeldung und Organisationszugriff geprüft. Schreibrechte für ein Deployment sind damit noch nicht bestätigt."
                            : "Prüfung abgeschlossen. Bitte beachte das Ergebnis am Profil.",
                        );
                        await refresh();
                      })
                    }
                  >
                    Zugang prüfen
                  </button>
                </>
              )}
              <button
                type="button"
                className="text-button danger"
                disabled={busy}
                onClick={() => {
                  if (
                    !window.confirm(
                      `Zugang „${profile.name}“ aus dem Configurator löschen? Der Schlüssel wird in STACKIT selbst nicht widerrufen.`,
                    )
                  )
                    return;
                  void perform(async () => {
                    await checked(
                      await fetch(`/api/v1/credentials/${profile.id}`, {
                        method: "DELETE",
                        credentials: "same-origin",
                        headers: { "X-LZC-CSRF": session.csrfToken },
                      }),
                    );
                    setNotice(
                      "Zugang aus dem Configurator entfernt. Zum Widerrufen des STACKIT-Schlüssels nutze die Service-Account-Verwaltung im Portal.",
                    );
                    await refresh();
                  });
                }}
              >
                Zugang löschen<span className="sr-only">: {profile.name}</span>
              </button>
            </article>
          ))}
          <p className="field-error" role="alert">
            {error}
          </p>
          <p role="status">{notice}</p>
        </>
      )}
    </section>
  );
}
