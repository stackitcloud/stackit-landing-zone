import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { t } from "../i18n";
import { workspaceKey } from "../workspace";
import type { Session } from "./Account";
import { type CloudCatalogue, catalogueField } from "./cloud-catalogue-fields";

type CatalogueSelection = {
  profileId: string;
  projectId: string;
  region: string;
};

function readSelection(key: string | null): CatalogueSelection | null {
  try {
    const raw = key && localStorage.getItem(`${key}:catalogue`);
    if (!raw || raw.length > 1024) return null;
    const value = JSON.parse(raw);
    if (
      typeof value.profileId !== "string" ||
      value.profileId.length > 36 ||
      typeof value.projectId !== "string" ||
      value.projectId.length > 64 ||
      !["eu01", "eu02"].includes(value.region)
    )
      return null;
    return {
      profileId: value.profileId,
      projectId: value.projectId,
      region: value.region,
    };
  } catch {
    return null;
  }
}

type CatalogueState = {
  data: CloudCatalogue | null;
  regions: Record<string, CloudCatalogue>;
  setData: (data: CloudCatalogue | null) => void;
};
const CatalogueContext = createContext<CatalogueState>({
  data: null,
  regions: {},
  setData: () => {},
});
export function CloudCatalogueProvider({ children }: { children: ReactNode }) {
  const [data, setCurrent] = useState<CloudCatalogue | null>(null);
  const [regions, setRegions] = useState<Record<string, CloudCatalogue>>({});
  const setData = useCallback((value: CloudCatalogue | null) => {
    setCurrent(value);
    setRegions((previous) =>
      value ? { ...previous, [value.region]: value } : {},
    );
  }, []);
  return (
    <CatalogueContext.Provider value={{ data, regions, setData }}>
      {children}
    </CatalogueContext.Provider>
  );
}
export function useCatalogueOptions(path: string, region: string) {
  const context = useContext(CatalogueContext);
  const data = context.regions[region] ?? context.data;
  const field = catalogueField(path);
  if (
    !field ||
    !data ||
    (!["gitFlavors", "projectRoles", "projectPermissions"].includes(field) &&
      data.region !== region)
  )
    return undefined;
  const part = data[field];
  return part?.status === "available" ? part.options : undefined;
}
export function useCatalogueRoleTemplates() {
  return useContext(CatalogueContext).data?.projectRoleTemplates ?? [];
}
export function CloudCataloguePanel({ session }: { session: Session | null }) {
  const { data, setData } = useContext(CatalogueContext);
  const [profiles, setProfiles] = useState<{ id: string; name: string }[]>([]);
  const [profileId, setProfileId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [region, setRegion] = useState("eu01");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"pending" | "manual" | "automatic">(
    "pending",
  );
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => () => activeRequest.current?.abort(), []);
  const [error, setError] = useState("");
  const [storageWarning, setStorageWarning] = useState("");
  function remember(selection: CatalogueSelection) {
    const key = workspaceKey(session);
    if (!key) return;
    try {
      localStorage.setItem(`${key}:catalogue`, JSON.stringify(selection));
      setStorageWarning("");
    } catch {
      setStorageWarning(
        "Die Katalogauswahl konnte in diesem Browser nicht gespeichert werden.",
      );
    }
  }
  useEffect(() => {
    activeRequest.current?.abort();
    setBusy(false);
    setData(null);
    setProfiles([]);
    setProfileId("");
    const saved = readSelection(workspaceKey(session));
    setProjectId(saved?.projectId ?? "");
    setRegion(saved?.region ?? "eu01");
    setError("");
    setStorageWarning("");
    setMode("pending");
    if (!session) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const statusResponse = await fetch("/auth/status", {
          signal: controller.signal,
        });
        if (!statusResponse.ok) throw new Error();
        const providers = await statusResponse.json();
        if (controller.signal.aborted) return;
        if (
          providers.primary === "stackit" ||
          session.tenant?.kind === "organisation"
        ) {
          setMode("automatic");
          setBusy(true);
          await Promise.all(
            ["eu01", "eu02"].map(async (region) => {
              const result = await fetch("/api/v1/cloud-catalogues/automatic", {
                method: "POST",
                signal: controller.signal,
                headers: {
                  "Content-Type": "application/json",
                  "x-lzc-csrf": session.csrfToken,
                  "x-lzc-tenant": session.tenant?.id ?? "",
                },
                body: JSON.stringify({ region }),
              });
              if (result.status === 404) {
                if (!controller.signal.aborted)
                  setError(
                    "Katalogzugang nicht verfügbar. Prüfe die gespeicherten Deployment-Zugänge im aktiven Arbeitsbereich.",
                  );
                return;
              }
              if (!result.ok) throw new Error();
              const catalogue = await result.json();
              if (!controller.signal.aborted) setData(catalogue);
            }),
          );
          return;
        }
        setMode("manual");
        const credentials = await fetch("/api/v1/credentials", {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const response = credentials;
        if (!response.ok) throw new Error();
        const body = (await response.json()) as {
          profiles: { id: string; name: string; state: string }[];
        };
        const stored = body.profiles.filter(
          (profile) => profile.state === "stored",
        );
        setProfiles(stored);
        setProfileId(
          stored.some((profile) => profile.id === saved?.profileId)
            ? (saved?.profileId ?? "")
            : "",
        );
      } catch {
        if (!controller.signal.aborted)
          setError(
            "Aktuelle STACKIT-Produktoptionen sind derzeit nicht verfügbar.",
          );
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    })();
    return () => controller.abort();
  }, [session?.user.id, session?.tenant?.id, setData, session]);
  if (!session || mode === "pending") return null;
  if (mode === "automatic") {
    const unavailable = data
      ? (
          [
            ["gitFlavors", "Git"],
            ["vpnPlans", "VPN"],
            ["kubernetesVersions", "Kubernetes"],
            ["machineTypes", "SKE-Maschinentypen"],
            ["availabilityZones", "SKE-Zonen"],
            ["volumeTypes", "SKE-Speichertypen"],
            ["machineImages", "SKE-Betriebssysteme"],
            ["observabilityPlans", "Observability"],
            ["bastionMachineTypes", "IaaS-Maschinentypen"],
            ["bastionImages", "Bastion-Images"],
            ["bastionAvailabilityZones", "IaaS-Zonen"],
            ["projectRoles", "Projektrollen"],
            ["projectPermissions", "Projektberechtigungen"],
          ] as const
        )
          .filter(([key]) => data[key]?.status === "unavailable")
          .map(([, label]) => label)
      : [];
    return (
      <p role="status" className="field-hint">
        {busy
          ? t("STACKIT-Produktkataloge werden geladen.")
          : error ||
            (data
              ? t("STACKIT-Produktkataloge geladen ({{value0}}).", {
                  value0: data.region,
                })
              : "")}
        {!busy &&
          data &&
          unavailable.length > 0 &&
          t(" Nicht verfügbar: {{value0}}.{{value1}}", {
            value0: unavailable.join(", "),
            value1:
              data.projectId === null
                ? " Kein zugängliches Referenzprojekt gefunden."
                : "",
          })}
      </p>
    );
  }
  if (session.tenant?.kind === "organisation")
    return (
      <p className="info-banner">
        {t(
          "STACKIT-Angebote können derzeit im persönlichen Arbeitsbereich geladen werden. Für diesen Organisationsarbeitsbereich muss zunächst die STACKIT-Zuordnung verifiziert werden.",
        )}
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
      <summary>{t("STACKIT-Produktoptionen laden")}</summary>
      <p className="field-hint">
        {t(
          "Lädt aktuelle Auswahlwerte mit deinem gespeicherten Zugang. Das Referenzprojekt wird für Git, Observability und IaaS verwendet; Optionen sind keine Zusage für Quoten oder Verfügbarkeit in später neu angelegten Projekten. Es werden keine Cloud-Ressourcen verändert.",
        )}
      </p>
      <div className="structured-grid">
        <label>
          {t("Katalogzugang")}
          <select
            disabled={busy}
            aria-label={t("Katalogzugang")}
            value={profileId}
            onChange={(event) => {
              setProfileId(event.target.value);
              remember({ profileId: event.target.value, projectId, region });
              setData(null);
            }}
          >
            <option value="">{t("Bitte auswählen")}</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Referenzprojekt-ID")}
          <input
            disabled={busy}
            value={projectId}
            placeholder={t("UUID eines vorhandenen STACKIT-Projekts")}
            onChange={(event) => {
              setProjectId(event.target.value);
              remember({ profileId, projectId: event.target.value, region });
              setData(null);
            }}
          />
        </label>
        <label>
          {t("Katalogregion")}
          <select
            disabled={busy}
            aria-label={t("Katalogregion")}
            value={region}
            onChange={(event) => {
              setRegion(event.target.value);
              remember({ profileId, projectId, region: event.target.value });
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
        {busy ? t("Wird geladen …") : t("Produktoptionen aktualisieren")}
      </button>
      {error && <p role="alert">{t(error)}</p>}
      {storageWarning && <p role="status">{storageWarning}</p>}
      {data && (
        <>
          <p role="status">
            {t("Produktoptionen für")} {data.region}{" "}
            {t("geladen. Bestehende Konfigurationswerte bleiben unverändert.")}
          </p>
          <ul>
            {(
              [
                ["gitFlavors", "STACKIT Git"],
                ["vpnPlans", "STACKIT VPN"],
                ["kubernetesVersions", "STACKIT Kubernetes Engine"],
                ["machineImages", "SKE-Knoten: Betriebssysteme"],
                ["observabilityPlans", "STACKIT Observability"],
                ["projectRoles", "STACKIT-Projektrollen"],
                ["projectPermissions", "STACKIT-Projektberechtigungen"],
                ["bastionMachineTypes", "Debug-Bastion: Maschinentypen"],
                ["bastionImages", "Debug-Bastion: öffentliche Images"],
                [
                  "bastionAvailabilityZones",
                  "Debug-Bastion: Verfügbarkeitszonen",
                ],
              ] as const
            ).map(([key, label]) => (
              <li key={key}>
                {t(label)}:{" "}
                {data[key]?.status === "available"
                  ? t("{{value0}} Auswahlwerte", {
                      value0: data[key]?.options.length,
                    })
                  : t("nicht verfügbar; manuelle Eingabe bleibt möglich")}
              </li>
            ))}
          </ul>
        </>
      )}
    </details>
  );
}
