import { applicationWorkloadPermissions } from "@lzc/domain";
import { t } from "../i18n";

const groups = [
  {
    name: "Virtuelle Maschinen",
    matches: (p: string) => p.startsWith("iaas.server."),
  },
  {
    name: "Volumes, Snapshots und Backups",
    matches: (p: string) =>
      /^iaas\.(volume|volume-performance-class|snapshot|backup)\./.test(p),
  },
  {
    name: "Netzwerk und Security Groups",
    matches: (p: string) =>
      /^iaas\.(network|nic|security-group|public-ip|virtual-ip|openstack-network|prefix-list)\./.test(
        p,
      ),
  },
  {
    name: "Images, SSH-Schlüssel und Projektinformationen",
    matches: (p: string) =>
      p.startsWith("iaas.") || p.startsWith("resource-manager."),
  },
  {
    name: "Object Storage",
    matches: (p: string) => p.startsWith("object-storage."),
  },
  { name: "Observability", matches: (p: string) => p.startsWith("argus.") },
  {
    name: "Secrets Manager",
    matches: (p: string) => p.startsWith("secrets-manager."),
  },
  { name: "Weitere Berechtigungen", matches: () => true },
];

export function ApplicationPermissionGroups({
  selected,
  search,
  available,
  onChange,
}: {
  selected: string[];
  search: string;
  available: string[] | undefined;
  onChange: (permissions: string[]) => void;
}) {
  const grouped = groups.map((group) => ({
    ...group,
    permissions: [] as string[],
  }));
  for (const permission of applicationWorkloadPermissions)
    grouped
      .find((group) => group.matches(permission))
      ?.permissions.push(permission);
  const query = search.trim().toLowerCase();
  const chosen = new Set(selected);
  const visibleGroups = grouped
    .map((group) => ({
      ...group,
      visible: group.permissions.filter(
        (permission) =>
          permission.includes(query) ||
          t(group.name).toLowerCase().includes(query),
      ),
    }))
    .filter((group) => group.visible.length);
  const update = (permissions: string[], checked: boolean) => {
    const next = new Set(selected);
    for (const permission of permissions)
      if (checked) next.add(permission);
      else next.delete(permission);
    onChange([...next].sort());
  };
  return (
    <div className="application-permission-groups">
      {!visibleGroups.length && <p>{t("Keine passenden Berechtigungen.")}</p>}
      {visibleGroups.map((group) => (
        <details key={group.name}>
          <summary>
            {t(group.name)} ·{" "}
            {t("{{selected}} von {{total}} ausgewählt", {
              selected: group.permissions.filter((p) => chosen.has(p)).length,
              total: group.permissions.length,
            })}
          </summary>
          <div className="permission-group-actions">
            <button
              type="button"
              disabled={group.visible.every((p) => chosen.has(p))}
              onClick={() => update(group.visible, true)}
            >
              {t("Alle angezeigten auswählen")}
            </button>
            <button
              type="button"
              disabled={group.visible.every((p) => !chosen.has(p))}
              onClick={() => update(group.visible, false)}
            >
              {t("Angezeigte abwählen")}
            </button>
          </div>
          <div className="application-permission-list">
            {group.visible.map((permission) => (
              <label key={permission} className="application-permission-choice">
                <input
                  type="checkbox"
                  checked={chosen.has(permission)}
                  onChange={(event) =>
                    update([permission], event.target.checked)
                  }
                />
                <span>
                  <code>{permission}</code>
                  {available && !available.includes(permission) && (
                    <> · {t("Im Live-Katalog nicht vorhanden")}</>
                  )}
                </span>
              </label>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
