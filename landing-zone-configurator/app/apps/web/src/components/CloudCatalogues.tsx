import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Session } from "./Account";
import { type CloudCatalogue, catalogueField } from "./cloud-catalogue-fields";

type CatalogueState = {
  data: CloudCatalogue | null;
  setData: (data: CloudCatalogue | null) => void;
};
const CatalogueContext = createContext<CatalogueState>({
  data: null,
  setData: () => {},
});
export function CloudCatalogueProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<CloudCatalogue | null>(null);
  return (
    <CatalogueContext.Provider value={{ data, setData }}>
      {children}
    </CatalogueContext.Provider>
  );
}
export function useCatalogueOptions(path: string, region: string) {
  const { data } = useContext(CatalogueContext);
  const field = catalogueField(path);
  if (!field || !data || (field !== "gitFlavors" && data.region !== region))
    return undefined;
  const part = data[field];
  return part.status === "available" ? part.options : undefined;
}
export function CloudCataloguePanel({ session }: { session: Session | null }) {
  const { data, setData } = useContext(CatalogueContext);
  const [profiles, setProfiles] = useState<{ id: string; name: string }[]>([]);
  const [profileId, setProfileId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [region, setRegion] = useState("eu01");
  const [busy, setBusy] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => () => activeRequest.current?.abort(), []);
  const [error, setError] = useState("");
  useEffect(() => {
    activeRequest.current?.abort();
    setBusy(false);
    setData(null);
    setProfiles([]);
    setProfileId("");
    setProjectId("");
    if (!session) return;
    const controller = new AbortController();
    void fetch("/api/v1/credentials", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const body = (await response.json()) as {
          profiles: { id: string; name: string; state: string }[];
        };
        setProfiles(
          body.profiles.filter((profile) => profile.state === "stored"),
        );
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Gespeicherte Zugänge konnten nicht geladen werden.");
      });
    return () => controller.abort();
  }, [session?.user.id, session?.tenant?.id, setData, session]);
  if (!session)
    return (
      <p className="field-hint">
        Nach der Anmeldung können Produktoptionen mit einem eigenen
        STACKIT-Zugang geladen werden.
      </p>
    );
  async function load() {
    if (!session) return;
    const controller = new AbortController();
    activeRequest.current?.abort();
    activeRequest.current = controller;
    setBusy(true);
    setError("");
    setData(null);
    try {
      const response = await fetch("/api/v1/cloud-catalogues", {
        signal: controller.signal,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-lzc-csrf": session.csrfToken,
        },
        body: JSON.stringify({ profileId, projectId, region }),
      });
      if (!response.ok) throw new Error();
      const result = (await response.json()) as CloudCatalogue;
      if (!controller.signal.aborted) setData(result);
    } catch {
      if (!controller.signal.aborted)
        setError(
          "Produktoptionen konnten nicht geladen werden. Zugang, Projektberechtigungen und Erreichbarkeit prüfen.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <details className="feature-section">
      <summary>STACKIT-Produktoptionen laden</summary>
      <p className="field-hint">
        Lädt aktuelle Auswahlwerte mit deinem gespeicherten Zugang. Das
        Referenzprojekt wird nur für die Git-Leistungsklassen verwendet;
        Optionen sind keine Zusage für Quoten oder Verfügbarkeit in später neu
        angelegten Projekten. Es werden keine Cloud-Ressourcen verändert.
      </p>
      <div className="structured-grid">
        <label>
          Katalogzugang
          <select
            disabled={busy}
            aria-label="Katalogzugang"
            value={profileId}
            onChange={(event) => {
              setProfileId(event.target.value);
              setData(null);
            }}
          >
            <option value="">Bitte auswählen</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Referenzprojekt-ID
          <input
            disabled={busy}
            value={projectId}
            placeholder="UUID eines vorhandenen STACKIT-Projekts"
            onChange={(event) => {
              setProjectId(event.target.value);
              setData(null);
            }}
          />
        </label>
        <label>
          Katalogregion
          <select
            disabled={busy}
            aria-label="Katalogregion"
            value={region}
            onChange={(event) => {
              setRegion(event.target.value);
              setData(null);
            }}
          >
            <option value="eu01">eu01</option>
            <option value="eu02">eu02</option>
          </select>
        </label>
      </div>
      <button
        type="button"
        className="button secondary"
        disabled={
          busy ||
          !profileId ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            projectId,
          )
        }
        onClick={() => void load()}
      >
        {busy ? "Wird geladen …" : "Produktoptionen aktualisieren"}
      </button>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <p role="status">
            Produktoptionen für {data.region} geladen. Bestehende
            Konfigurationswerte bleiben unverändert.
          </p>
          <ul>
            {(
              [
                ["gitFlavors", "STACKIT Git"],
                ["vpnPlans", "STACKIT VPN"],
                ["kubernetesVersions", "STACKIT Kubernetes Engine"],
              ] as const
            ).map(([key, label]) => (
              <li key={key}>
                {label}:{" "}
                {data[key].status === "available"
                  ? `${data[key].options.length} Auswahlwerte`
                  : "nicht verfügbar; manuelle Eingabe bleibt möglich"}
              </li>
            ))}
          </ul>
        </>
      )}
    </details>
  );
}
