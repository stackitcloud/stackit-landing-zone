import { t } from "../i18n";
import type { MemberRole } from "./MemberIdentity";

export function MembershipRoles({
  roles,
  manageMembers,
  onChange,
  onManageChange,
  selfRoles,
}: {
  roles: MemberRole[];
  manageMembers: boolean;
  onChange: (roles: MemberRole[]) => void;
  onManageChange: (manage: boolean) => void;
  selfRoles?: MemberRole[];
}) {
  const engineer = roles.includes("platform-engineer");
  const update = (role: MemberRole, selected: boolean) => {
    onChange(
      selected ? [...roles, role] : roles.filter((value) => value !== role),
    );
    if (role === "platform-engineer" && !selected) onManageChange(false);
  };
  return (
    <fieldset className="people-role-options">
      <legend>{t("Rollen und Berechtigungen")}</legend>
      <label className="people-choice">
        <input
          type="checkbox"
          checked={roles.includes("application-owner")}
          disabled={!!selfRoles && !selfRoles.includes("application-owner")}
          onChange={(e) => update("application-owner", e.target.checked)}
        />
        <span>
          <strong>{t("Application Owner")}</strong>
          <span>{t("Application Landing Zones bestellen und verwalten.")}</span>
        </span>
      </label>
      <label className="people-choice">
        <input
          type="checkbox"
          checked={engineer}
          disabled={!!selfRoles && !selfRoles.includes("platform-engineer")}
          onChange={(e) => update("platform-engineer", e.target.checked)}
        />
        <span>
          <strong>{t("Platform Engineer")}</strong>
          <span>
            {t("Plattform konfigurieren und Application Templates verwalten.")}
          </span>
        </span>
      </label>
      <label className="people-choice">
        <input
          type="checkbox"
          checked={manageMembers}
          disabled={!engineer}
          onChange={(e) => onManageChange(e.target.checked)}
        />
        <span>
          <strong>{t("Mitglieder verwalten")}</strong>
          <span>
            {t("Mitglieder einladen, Rollen ändern und Zugriff entziehen.")}
          </span>
        </span>
      </label>
      {selfRoles && (
        <p className="hint">
          {t("Eigene Berechtigungen kann nur ein anderes Mitglied erweitern.")}
        </p>
      )}
    </fieldset>
  );
}
