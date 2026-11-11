import { useState } from "react";
import { t } from "../i18n";
import type { Session } from "./Account";
import { Invitations } from "./Invitations";
import {
  type MemberRole,
  memberName,
  type WorkspaceMember,
} from "./MemberIdentity";
import { MembershipRoles } from "./MembershipRoles";
import { PeopleDialog } from "./PeopleDialog";

export function UserManagement({
  session,
  workspaceName,
  viewerId,
  members,
  canManage,
  busy,
  error,
  clearError,
  onSave,
  onRemove,
}: {
  session: Session;
  workspaceName: string;
  viewerId: string;
  members: WorkspaceMember[];
  canManage: boolean;
  busy: boolean;
  error: string;
  clearError: () => void;
  onSave: (
    id: string,
    roles: MemberRole[],
    manageMembers: boolean,
  ) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}) {
  const [tab, setTab] = useState<"members" | "invitations">("members");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitationCount, setInvitationCount] = useState(0);
  const [editing, setEditing] = useState<WorkspaceMember | null>(null);
  const [removing, setRemoving] = useState<WorkspaceMember | null>(null);
  const [roles, setRoles] = useState<MemberRole[]>([]);
  const [manage, setManage] = useState(false);
  const directory: WorkspaceMember[] =
    !canManage && members.length === 0
      ? [
          {
            userId: viewerId,
            login: session.user.login,
            roles: session.tenant?.roles ?? [],
            manageMembers: false,
          },
        ]
      : members;
  const managerCount = members.filter((member) => member.manageMembers).length;
  const needle = query.trim().toLocaleLowerCase();
  const shown = directory.filter(
    (member) =>
      `${memberName(member)} ${member.email ?? ""} ${member.login ?? ""}`
        .toLocaleLowerCase()
        .includes(needle) &&
      (filter === "all" ||
        (filter === "manager"
          ? member.manageMembers
          : member.roles.includes(filter as MemberRole))),
  );
  const lastManager = (member: WorkspaceMember) =>
    member.manageMembers && managerCount === 1;
  return (
    <section className="panel people-management">
      <div className="people-heading">
        <div>
          <h2>
            {t("Mitglieder in")} {workspaceName}
          </h2>
          <p>
            {t(
              "Verwalte Personen und ihren Zugriff auf diesen Arbeitsbereich.",
            )}
          </p>
        </div>
        {canManage && (
          <button
            className="button primary"
            type="button"
            disabled={busy}
            onClick={() => {
              setTab("invitations");
              setInviteOpen(true);
            }}
          >
            {t("Person einladen")}
          </button>
        )}
      </div>
      <div
        className="people-tabs"
        role="tablist"
        aria-label={t("Mitgliederverwaltung")}
      >
        <button
          id="people-members-tab"
          type="button"
          role="tab"
          aria-selected={tab === "members"}
          aria-controls="people-members-panel"
          tabIndex={tab === "members" ? 0 : -1}
          onClick={() => setTab("members")}
          onKeyDown={(event) => {
            if (canManage && ["ArrowRight", "ArrowLeft"].includes(event.key)) {
              event.preventDefault();
              setTab("invitations");
              document.getElementById("people-invitations-tab")?.focus();
            }
          }}
        >
          {t("Mitglieder")}{" "}
          {canManage && <span className="people-count">{members.length}</span>}
        </button>
        {canManage && (
          <button
            id="people-invitations-tab"
            type="button"
            role="tab"
            aria-selected={tab === "invitations"}
            aria-controls="people-invitations-panel"
            tabIndex={tab === "invitations" ? 0 : -1}
            onClick={() => setTab("invitations")}
            onKeyDown={(event) => {
              if (["ArrowRight", "ArrowLeft"].includes(event.key)) {
                event.preventDefault();
                setTab("members");
                document.getElementById("people-members-tab")?.focus();
              }
            }}
          >
            {t("Einladungen")}{" "}
            <span className="people-count">{invitationCount}</span>
          </button>
        )}
      </div>
      <div
        id="people-members-panel"
        role="tabpanel"
        aria-labelledby="people-members-tab"
        hidden={tab !== "members"}
      >
        {!canManage && (
          <p className="info-banner">
            {t(
              "Die Mitgliederverwaltung übernimmt ein dafür berechtigtes Mitglied deines Arbeitsbereichs.",
            )}
          </p>
        )}
        {canManage && (
          <div className="people-filters">
            <div className="field">
              <label htmlFor="people-search">{t("Mitglieder suchen")}</label>
              <input
                id="people-search"
                type="search"
                value={query}
                placeholder={t("Name oder E-Mail-Adresse")}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="people-role-filter">
                {t("Nach Rolle filtern")}
              </label>
              <select
                id="people-role-filter"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="all">{t("Alle Rollen")}</option>
                <option value="platform-engineer">
                  {t("Platform Engineer")}
                </option>
                <option value="application-owner">
                  {t("Application Owner")}
                </option>
                <option value="manager">{t("Mitgliederverwaltung")}</option>
              </select>
            </div>
          </div>
        )}
        <ul className="people-list" aria-label={t("Mitglieder")}>
          {shown.map((member) => (
            <li key={member.userId} className="people-row">
              <div className="people-identity">
                <span className="people-avatar" aria-hidden="true">
                  {memberName(member)
                    .replace(/^@/, "")
                    .slice(0, 1)
                    .toUpperCase()}
                </span>
                <div>
                  <h3>
                    {memberName(member)}{" "}
                    {member.userId === viewerId && (
                      <span className="people-badge">{t("Du")}</span>
                    )}
                  </h3>
                  {member.email && member.email !== memberName(member) && (
                    <p>{member.email}</p>
                  )}
                  <span className="people-status">{t("Aktiv")}</span>
                </div>
              </div>
              <div className="people-role-badges">
                {member.roles.map((role) => (
                  <span key={role} className="people-badge">
                    {role === "platform-engineer"
                      ? t("Platform Engineer")
                      : t("Application Owner")}
                  </span>
                ))}
                {member.manageMembers && (
                  <span className="people-badge people-badge-manager">
                    {t("Mitgliederverwaltung")}
                  </span>
                )}
              </div>
              {canManage && (
                <div className="people-row-actions">
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    aria-label={t("Rollen für {{value0}} bearbeiten", {
                      value0: memberName(member),
                    })}
                    onClick={() => {
                      clearError();
                      setRoles([...member.roles]);
                      setManage(member.manageMembers);
                      setEditing(member);
                    }}
                  >
                    {t("Rollen bearbeiten")}
                  </button>
                  <button
                    type="button"
                    className="button secondary people-danger"
                    disabled={busy || lastManager(member)}
                    title={
                      lastManager(member)
                        ? t(
                            "Mindestens ein Mitglied muss die Mitgliederverwaltung behalten.",
                          )
                        : undefined
                    }
                    aria-label={t("{{value0}} entfernen", {
                      value0: memberName(member),
                    })}
                    onClick={() => {
                      clearError();
                      setRemoving(member);
                    }}
                  >
                    {t("Entfernen")}
                  </button>
                  {lastManager(member) && (
                    <span className="hint">
                      {t("Letzte Person mit Mitgliederverwaltung")}
                    </span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        {canManage && shown.length === 0 && (
          <p>{t("Keine passenden Mitglieder gefunden.")}</p>
        )}
      </div>
      {canManage && (
        <div
          id="people-invitations-panel"
          role="tabpanel"
          aria-labelledby="people-invitations-tab"
          hidden={tab !== "invitations"}
        >
          <Invitations
            session={session}
            createOpen={inviteOpen}
            onCreateClose={() => setInviteOpen(false)}
            onCountChange={setInvitationCount}
            active={tab === "invitations"}
          />
        </div>
      )}
      {editing && (
        <PeopleDialog
          title={t("Rollen bearbeiten")}
          busy={busy}
          onClose={() => setEditing(null)}
        >
          <p className="people-dialog-person">{memberName(editing)}</p>
          {editing.email && editing.email !== memberName(editing) && (
            <p>{editing.email}</p>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void onSave(editing.userId, roles, manage).then((ok) => {
                if (ok) setEditing(null);
              });
            }}
          >
            <fieldset disabled={busy} className="people-form-fields">
              <MembershipRoles
                roles={roles}
                manageMembers={manage}
                onChange={setRoles}
                onManageChange={setManage}
                {...(editing.userId === viewerId
                  ? { selfRoles: editing.roles }
                  : {})}
              />
            </fieldset>
            {lastManager(editing) &&
              (!manage || !roles.includes("platform-engineer")) && (
                <p role="alert">
                  {t(
                    "Übertrage die Mitgliederverwaltung zuerst an ein anderes Mitglied.",
                  )}
                </p>
              )}
            {error && <p role="alert">{t(error)}</p>}
            <div className="people-dialog-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                {t("Abbrechen")}
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={
                  busy ||
                  roles.length === 0 ||
                  (lastManager(editing) &&
                    (!manage || !roles.includes("platform-engineer")))
                }
              >
                {t("Änderungen speichern")}
              </button>
            </div>
          </form>
        </PeopleDialog>
      )}
      {removing && (
        <PeopleDialog
          title={t("Mitglied entfernen")}
          busy={busy}
          onClose={() => setRemoving(null)}
        >
          <p>
            {t("{{value0}} aus „{{value1}}“ entfernen?", {
              value0: memberName(removing),
              value1: workspaceName,
            })}
          </p>
          {removing.email && removing.email !== memberName(removing) && (
            <p>{removing.email}</p>
          )}
          <p>
            {t(
              "Die Person verliert den Zugriff auf diesen Arbeitsbereich. Ihr Konto bleibt bestehen.",
            )}
          </p>
          {error && <p role="alert">{t(error)}</p>}
          <div className="people-dialog-actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => setRemoving(null)}
            >
              {t("Abbrechen")}
            </button>
            <button
              type="button"
              className="button primary people-destructive"
              disabled={busy}
              onClick={() =>
                void onRemove(removing.userId).then((ok) => {
                  if (ok) setRemoving(null);
                })
              }
            >
              {t("Mitglied entfernen")}
            </button>
          </div>
        </PeopleDialog>
      )}
    </section>
  );
}
