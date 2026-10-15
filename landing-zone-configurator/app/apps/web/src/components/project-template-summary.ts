import {
  areaLocations,
  folderDefaults,
  objectValue,
  type ProjectTemplateDraft,
  textValue,
  type Values,
} from "@lzc/domain";
import { t } from "../i18n";

export function projectTemplateSummary(
  template: ProjectTemplateDraft,
  values: Values,
) {
  const folderKey =
    template.kind === "corporate"
      ? "landing_zones_corporate"
      : template.kind === "public"
        ? "landing_zones_public"
        : "sandboxes";
  const folders = objectValue(values.rm_folders);
  const folder =
    values.rm_folders == null
      ? folderDefaults[folderKey]
      : Object.hasOwn(folders, folderKey)
        ? textValue(objectValue(folders[folderKey]).name) ||
          t("Unbenannter Ordner")
        : t("Zielordner nicht definiert");
  const localNetwork =
    template.settings.network_enabled === true
      ? t("Lokales Netz")
      : template.settings.network_enabled === false
        ? t("Ohne lokales Netz")
        : t("Lokales Netz: Accelerator-Standard");
  const areaKey = textValue(template.settings.network_area_key) || "default";
  const area = areaLocations(values).find(
    (entry) => entry.region === template.region && entry.key === areaKey,
  );
  const network =
    template.kind === "corporate"
      ? `${t("Zentrale Netzwerkanbindung")}: ${area ? textValue(area.settings.name) || area.key : `${t("SNA nicht gefunden")}: ${areaKey}`} · ${localNetwork}`
      : template.kind === "public"
        ? `${t("Keine zentrale Netzanbindung")} · ${localNetwork}`
        : t("Eigenständige Sandbox");
  return {
    name: template.name || t("Unbenanntes Template"),
    kind:
      template.kind === "corporate"
        ? t("Corporate")
        : template.kind === "public"
          ? t("Public")
          : t("Sandbox"),
    folderKey,
    folder,
    network,
  };
}
