import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { t } from "../i18n";
import type { Session } from "./Account";

export const applicationGroupsSchema = z.object({
  groups: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        isDefault: z.boolean(),
        memberIds: z.array(z.uuid()).max(10000),
      }),
    )
    .max(100),
  members: z
    .array(
      z.object({
        userId: z.uuid(),
        login: z.string().nullable(),
        email: z.email().nullable().default(null),
        roles: z.array(z.string()),
      }),
    )
    .max(1000),
});

const errors: Record<string, string> = {
  application_group_in_use:
    "Dieser Gruppe sind noch Templates zugeordnet. Entferne zuerst deren Gruppenfreigaben.",
  application_access_denied:
    "Du darfst die Gruppen dieses Arbeitsbereichs nicht verwalten.",
  invalid_request_origin_or_csrf:
    "Die Sitzung wurde geändert. Lade die Seite neu.",
  invalid_application_request: "Bitte prüfe Gruppenname und Mitglieder.",
};

export function ApplicationGroups({
  session,
  tenantId,
}: {
  session: Session;
  tenantId: string;
}) {
  const [enabled, setEnabled] = useState(false);
  const [data, setData] = useState<z.infer<typeof applicationGroupsSchema>>({
    groups: [],
    members: [],
  });
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const request = useCallback(
    async (
      path: string,
      method = "GET",
      body?: unknown,
      signal?: AbortSignal,
    ) => {
      const response = await fetch(`/api/v1/applications/${path}`, {
        method,
        ...(signal ? { signal } : {}),
        headers: {
          "content-type": "application/json",
          "x-lzc-csrf": session.csrfToken,
          "x-lzc-tenant": tenantId,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) {
        const result = z
          .object({ error: z.string() })
          .safeParse(await response.json().catch(() => null));
        throw new Error(
          result.success && Object.hasOwn(errors, result.data.error)
            ? errors[result.data.error]
            : "Die Gruppenänderung konnte nicht ausgeführt werden.",
        );
      }
      return response.json() as Promise<unknown>;
    },
    [session.csrfToken, tenantId],
  );
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const capabilities = z
        .object({ groupAccessEnabled: z.boolean().default(false) })
        .parse(await request("templates", "GET", undefined, signal));
      if (signal?.aborted) return;
      setEnabled(capabilities.groupAccessEnabled);
      if (!capabilities.groupAccessEnabled) return;
      const next = applicationGroupsSchema.parse(
        await request("groups", "GET", undefined, signal),
      );
      if (!signal?.aborted) setData(next);
    },
    [request],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch(() => {
      if (!controller.signal.aborted)
        setError("Die Gruppenverwaltung ist derzeit nicht verfügbar.");
    });
    return () => controller.abort();
  }, [load]);

  async function mutate(path: string, method: string, body: unknown) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = z
        .object({ id: z.uuid() })
        .parse(await request(path, method, body));
      await load();
      if (method === "DELETE") {
        setGroupId("");
        setMemberIds([]);
      } else if (path === "groups") {
        setGroupId(result.id);
        setName("");
        setMemberIds([]);
      }
      setConfirmed(false);
      setNotice(
        method === "DELETE"
          ? "Gruppe gelöscht."
          : "Gruppenänderung gespeichert.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Gruppenänderung fehlgeschlagen.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!enabled) return null;
  const selected = data.groups.find((group) => group.id === groupId);
  return (
    <section className="panel" aria-label={t("Gruppenverwaltung")}>
      <h2>{t("Gruppen")}</h2>
      {error && <p role="alert">{t(error)}</p>}
      {notice && <p role="status">{t(notice)}</p>}
      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          void mutate("groups", "POST", { name: name.trim() });
        }}
      >
        <div className="field">
          <label htmlFor="application-group-name">{t("Gruppenname")}</label>
          <input
            id="application-group-name"
            value={name}
            maxLength={80}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </div>
        <div className="field">
          <button
            type="submit"
            className="button"
            disabled={busy || !name.trim()}
          >
            {t("Gruppe anlegen")}
          </button>
        </div>
      </form>
      <div className="field">
        <label htmlFor="application-group-members">{t("Gruppe")}</label>
        <select
          id="application-group-members"
          value={groupId}
          disabled={busy}
          onChange={(event) => {
            setGroupId(event.target.value);
            setMemberIds(
              data.groups.find((group) => group.id === event.target.value)
                ?.memberIds ?? [],
            );
            setConfirmed(false);
            setError("");
            setNotice("");
          }}
        >
          <option value="">{t("Gruppe wählen")}</option>
          {data.groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
              {group.isDefault ? ` · ${t("Automatisch verwaltet")}` : ""}
            </option>
          ))}
        </select>
      </div>
      {selected && (
        <fieldset>
          <legend>{t("Gruppenmitglieder")}</legend>
          {selected.isDefault && <p>{t("Automatisch verwaltet")}</p>}
          {data.members.map((member) => (
            <label
              className="toggle-label"
              key={member.userId}
              style={{ overflowWrap: "anywhere" }}
            >
              <input
                type="checkbox"
                checked={(selected.isDefault
                  ? selected.memberIds
                  : memberIds
                ).includes(member.userId)}
                disabled={busy || selected.isDefault}
                onChange={(event) => {
                  setMemberIds((previous) =>
                    event.target.checked
                      ? [...previous, member.userId]
                      : previous.filter((id) => id !== member.userId),
                  );
                  setConfirmed(false);
                }}
              />
              {member.email ?? member.login ?? t("Benutzer")}
            </label>
          ))}
          {!selected.isDefault && (
            <>
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                {t("Gruppenmitgliedschaften geprüft")}
              </label>
              <button
                type="button"
                className="button"
                disabled={busy || !confirmed}
                onClick={() =>
                  void mutate(`groups/${selected.id}/members`, "POST", {
                    memberIds,
                    confirmMembershipChange: true,
                  })
                }
              >
                {t("Mitgliedschaften speichern")}
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      t(
                        "Diese Gruppe löschen? Ihre Mitglieder bleiben im Arbeitsbereich.",
                      ),
                    )
                  )
                    void mutate(`groups/${selected.id}`, "DELETE", {
                      confirmDeletion: true,
                    });
                }}
              >
                {t("Gruppe löschen")}
              </button>
            </>
          )}
        </fieldset>
      )}
    </section>
  );
}
