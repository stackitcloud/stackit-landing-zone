import {
  applicationProjectPermissionNames,
  applicationProjectPermissions,
} from "@lzc/domain";
import { t } from "../i18n";

const baseGroups = [
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
  const labels: Record<string, string> = {
    ske: "Kubernetes (SKE)",
    iam: "IAM und Zugriffsverwaltung",
    "service-account": "Service Accounts",
    "resource-manager": "Projektverwaltung",
    dns: "DNS",
    git: "Git",
    logs: "Logs",
    kafka: "Kafka",
    mongodbflex: "MongoDB Flex",
    "postgres-flex": "PostgreSQL Flex",
    "sqlserver-flex": "SQL Server Flex",
    redis: "Redis",
    alb: "Application Load Balancer",
    opensearch: "OpenSearch",
    airflow: "Airflow",
    kms: "Schlüsselverwaltung (KMS)",
  };
  const all = [
    ...new Set([
      ...applicationProjectPermissionNames,
      ...(available ?? []),
      ...selected,
    ]),
  ].sort();
  const otherServices = [
    ...new Set(
      all
        .filter((p) => !baseGroups.some((g) => g.matches(p)))
        .map((p) => p.split(".")[0] ?? p),
    ),
  ];
  const groups = [
    ...baseGroups,
    ...otherServices.map((service) => ({
      name: labels[service] ?? service,
      matches: (p: string) => p.startsWith(`${service}.`),
    })),
  ];
  const descriptions = new Map(
    applicationProjectPermissions.map((p) => [p.name, p.description]),
  );
  const grouped = groups.map((group) => ({
    ...group,
    permissions: [] as string[],
  }));
  for (const permission of all)
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
          permission.toLowerCase().includes(query) ||
          descriptions.get(permission)?.toLowerCase().includes(query) ||
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
                  aria-label={permission}
                  aria-description={descriptions.get(permission)}
                  checked={chosen.has(permission)}
                  onChange={(event) =>
                    update([permission], event.target.checked)
                  }
                />
                <span>
                  <code>{permission}</code>
                  {descriptions.get(permission) && (
                    <span className="field-hint">
                      {" "}
                      · {descriptions.get(permission)}
                    </span>
                  )}
                  {!applicationProjectPermissionNames.includes(permission) &&
                    !available?.includes(permission) && (
                      <> · {t("Im Projektkatalog nicht bestätigt")}</>
                    )}
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
