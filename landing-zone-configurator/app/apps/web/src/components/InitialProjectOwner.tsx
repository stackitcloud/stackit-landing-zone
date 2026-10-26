import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useState,
} from "react";
import { z } from "zod";
import { t } from "../i18n";
import type { Session } from "./Account";

type Option = {
  id: string;
  email: string;
  name: string;
  kind: "human" | "prepared-service" | "checked-service" | "unchecked-service";
  preparationName?: string;
  warning?: "failed" | "other-organization" | "unchecked";
};
const Context = createContext<{ scope: string; options: Option[] }>({
  scope: "",
  options: [],
});
const identitySchema = z.object({
  verified: z.boolean(),
  identity: z.object({ email: z.email() }).nullable(),
});
const profilesSchema = z.object({
  profiles: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string(),
        keyId: z.string().min(1).optional(),
        serviceAccount: z
          .email()
          .refine((email) => email.endsWith("@sa.stackit.cloud")),
        state: z.enum(["stored", "pending"]),
        lastCheck: z
          .object({ status: z.string(), organizationId: z.string().optional() })
          .nullable()
          .optional(),
      }),
    )
    .max(200),
});

const preparationsSchema = z.object({
  preparations: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string(),
        credentialId: z.string().nullable(),
        manifest: z.object({
          source: z.object({ configurationId: z.string() }),
          organization: z.object({ id: z.string() }),
          credential: z.object({ id: z.string(), keyId: z.string().min(1) }),
        }),
      }),
    )
    .max(100),
});

export function InitialProjectOwnerOptions({
  session = null,
  organizationId,
  configurationId,
  children,
}: {
  session?: Session | null;
  organizationId: string;
  configurationId: string;
  children: ReactNode;
}) {
  const scope = JSON.stringify([
    session?.user.id,
    session?.tenant?.id,
    session?.tenant?.kind,
    session?.tenant?.roles,
    session?.csrfToken,
    session?.expiresAt,
    configurationId,
    organizationId,
  ]);
  const [loaded, setLoaded] = useState<{
    scope: string;
    options: Option[];
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const tenantId = session?.tenant?.id;
    if (
      !session?.user.id ||
      !tenantId ||
      Date.parse(session.expiresAt) <= Date.now() ||
      (session.tenant?.kind === "organisation" &&
        !session.tenant.roles?.includes("platform-engineer"))
    )
      return () => controller.abort();
    const get = async (path: string) => {
      const response = await fetch(path, {
        headers: { "x-lzc-tenant": tenantId },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("owner_context_unavailable");
      return response.json() as Promise<unknown>;
    };
    void Promise.allSettled([
      get("/api/v1/stackit/identity"),
      get("/api/v1/credentials"),
      get("/api/v1/preparations"),
    ]).then((results) => {
      if (controller.signal.aborted) return;
      const options: Option[] = [];
      const human =
        results[0]?.status === "fulfilled"
          ? identitySchema.safeParse(results[0].value)
          : null;
      if (human?.success && human.data.verified && human.data.identity)
        options.push({
          id: "verified-human",
          email: human.data.identity.email,
          name: "",
          kind: "human",
        });
      const profiles =
        results[1]?.status === "fulfilled"
          ? profilesSchema.safeParse(results[1].value)
          : null;
      const preparations =
        results[2]?.status === "fulfilled"
          ? preparationsSchema.safeParse(results[2].value)
          : null;
      const matchingPreparations = preparations?.success
        ? preparations.data.preparations.filter(
            (preparation) =>
              preparation.manifest.source.configurationId === configurationId &&
              preparation.manifest.organization.id === organizationId,
          )
        : [];
      if (profiles?.success)
        for (const profile of profiles.data.profiles) {
          // A saved preparation is provenance for this email choice, not proof
          // of a successful Apply or of current execution permissions.
          const bound = profile.keyId
            ? matchingPreparations.find(
                (preparation) =>
                  preparation.credentialId === profile.id &&
                  preparation.manifest.credential.id === profile.id &&
                  preparation.manifest.credential.keyId === profile.keyId,
              )
            : undefined;

          if (
            profile.state !== "stored" ||
            (!bound &&
              profile.lastCheck &&
              (profile.lastCheck.status !== "passed" ||
                profile.lastCheck.organizationId !== organizationId))
          )
            continue;
          options.push({
            id: `profile:${profile.id}`,
            email: profile.serviceAccount,
            name: profile.name,
            kind: bound
              ? "prepared-service"
              : profile.lastCheck
                ? "checked-service"
                : "unchecked-service",
            ...(bound
              ? {
                  preparationName: bound.name,
                  ...(!profile.lastCheck
                    ? { warning: "unchecked" as const }
                    : profile.lastCheck.status !== "passed"
                      ? { warning: "failed" as const }
                      : profile.lastCheck.organizationId !== organizationId
                        ? { warning: "other-organization" as const }
                        : {}),
                }
              : {}),
          });
        }
      const priority: Record<Option["kind"], number> = {
        human: 0,
        "prepared-service": 1,
        "checked-service": 2,
        "unchecked-service": 3,
      };
      options.sort(
        (a, b) =>
          priority[a.kind] - priority[b.kind] || a.name.localeCompare(b.name),
      );
      setLoaded({ scope, options });
    });
    return () => controller.abort();
  }, [scope, session, organizationId, configurationId]);
  return (
    <Context.Provider
      value={{ scope, options: loaded?.scope === scope ? loaded.options : [] }}
    >
      {children}
    </Context.Provider>
  );
}

export function InitialProjectOwner({
  value,
  onChange,
}: {
  value: string;
  onChange: (email: string) => void;
}) {
  const id = useId();
  const { scope, options } = useContext(Context);
  const [selection, setSelection] = useState<{
    scope: string;
    id: string;
  } | null>(null);
  const chosen =
    selection?.scope === scope
      ? options.find(
          (option) => option.id === selection.id && option.email === value,
        )
      : undefined;
  return (
    <>
      <label htmlFor={`${id}-source`}>
        {t("Quelle für den initialen Projekt-Owner")}
      </label>
      <select
        id={`${id}-source`}
        value={chosen?.id ?? "manual"}
        onChange={(event) => {
          const option = options.find(
            (option) => option.id === event.target.value,
          );
          setSelection(option ? { scope, id: option.id } : null);
          if (option) onChange(option.email);
        }}
      >
        <option value="manual">
          {t("Manuell eingeben / gespeicherten Wert behalten")}
        </option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.kind === "human"
              ? t("Aktuell verifizierter STACKIT-Benutzer")
              : option.kind === "prepared-service"
                ? t("Plattform-Zugangsprofil aus gespeicherter Vorbereitung")
                : option.kind === "checked-service"
                  ? t("Gespeichertes Zugangsprofil · Organisation geprüft")
                  : t(
                      "Gespeichertes Zugangsprofil · Organisation nicht geprüft",
                    )}
            {option.name ? ` · ${option.name}` : ""} · {option.email}
            {option.preparationName ? ` · ${option.preparationName}` : ""}
            {option.warning === "failed"
              ? ` · ${t("Letzte Zugangsprüfung nicht erfolgreich")}`
              : option.warning === "other-organization"
                ? ` · ${t("Letzte Zugangsprüfung betrifft eine andere Organisation")}`
                : option.warning === "unchecked"
                  ? ` · ${t("Aktuelle Zugangsprüfung nicht nachgewiesen")}`
                  : ""}
          </option>
        ))}
      </select>
      <label htmlFor={`${id}-email`}>
        {t("Initialer Projekt-Owner (zentraler Benutzer oder Service Account)")}
      </label>
      <input
        id={`${id}-email`}
        type="email"
        value={value}
        readOnly={!!chosen}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="field-hint">
        {t(
          "Die Auswahl übernimmt nur die angezeigte E-Mail in den Entwurf. Sie erteilt keine Rechte, wechselt kein Ausführungsprofil und wird bei späteren Konto- oder Profiländerungen nicht automatisch angepasst. Manuelle Eingabe bleibt möglich.",
        )}
      </p>
    </>
  );
}
