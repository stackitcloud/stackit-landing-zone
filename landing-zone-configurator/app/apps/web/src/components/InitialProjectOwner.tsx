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
  kind: "human" | "checked-service" | "unchecked-service";
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
      if (profiles?.success)
        for (const profile of profiles.data.profiles) {
          if (
            profile.state !== "stored" ||
            (profile.lastCheck &&
              (profile.lastCheck.status !== "passed" ||
                profile.lastCheck.organizationId !== organizationId))
          )
            continue;
          options.push({
            id: `profile:${profile.id}`,
            email: profile.serviceAccount,
            name: profile.name,
            kind: profile.lastCheck ? "checked-service" : "unchecked-service",
          });
        }
      options.sort(
        (a, b) =>
          ({ human: 0, "checked-service": 1, "unchecked-service": 2 })[a.kind] -
            { human: 0, "checked-service": 1, "unchecked-service": 2 }[
              b.kind
            ] || a.name.localeCompare(b.name),
      );
      setLoaded({ scope, options });
    });
    return () => controller.abort();
  }, [scope, session, organizationId]);
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
              : option.kind === "checked-service"
                ? t("Gespeichertes Zugangsprofil · Organisation geprüft")
                : t("Gespeichertes Zugangsprofil · Organisation nicht geprüft")}
            {option.name ? ` · ${option.name}` : ""} · {option.email}
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
