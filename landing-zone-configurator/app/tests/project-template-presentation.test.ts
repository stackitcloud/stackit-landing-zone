import {
  areaLocations,
  compileCommonConfiguration,
  createEditorConfiguration,
  type ProjectTemplateDraft,
} from "@lzc/domain";
import { afterEach, expect, it } from "vitest";
import { projectTemplateSummary } from "../apps/web/src/components/project-template-summary.js";
import { i18n } from "../apps/web/src/i18n.js";

afterEach(async () => {
  await i18n.changeLanguage("en");
});

it.each(["de", "en"])(
  "summarizes actual template network and folder references in %s",
  async (language) => {
    await i18n.changeLanguage(language);
    const values = compileCommonConfiguration(
      createEditorConfiguration("hub-and-spoke", crypto.randomUUID()),
    );
    const template: ProjectTemplateDraft = {
      id: crypto.randomUUID(),
      key: "central",
      name: "Corporate",
      kind: "corporate",
      region: "eu01",
      settings: { network_enabled: true },
    };
    const area = areaLocations(values).find(
      (entry) => entry.key === "default" && entry.region === "eu01",
    );
    if (!area) throw new Error("Missing synthetic network area");
    const summary = projectTemplateSummary(template, values);
    expect(summary.folderKey).toBe("landing_zones_corporate");
    expect(summary.network).toContain(String(area.settings.name || area.key));
    expect(summary.network).toContain(
      language === "de" ? "Lokales Netz" : "Local network",
    );
    expect(
      projectTemplateSummary({ ...template, region: "eu02" }, values).network,
    ).toContain(language === "de" ? "SNA nicht gefunden" : "SNA not found");
    const publicSummary = projectTemplateSummary(
      { ...template, kind: "public" },
      values,
    );
    expect(publicSummary.folderKey).toBe("landing_zones_public");
    expect(publicSummary.network).toContain(
      language === "de"
        ? "Keine zentrale Netzanbindung"
        : "No central network connection",
    );
    expect(publicSummary.network).not.toContain(
      String(area.settings.name || area.key),
    );
    expect(
      projectTemplateSummary({ ...template, settings: {} }, values).network,
    ).toContain(
      language === "de" ? "Accelerator-Standard" : "accelerator default",
    );
    expect(
      projectTemplateSummary(template, {
        ...values,
        rm_folders: {
          landing_zones_corporate: { name: "Custom applications" },
        },
      }).folder,
    ).toBe("Custom applications");
    expect(
      projectTemplateSummary(template, { ...values, rm_folders: {} }).folder,
    ).toBe(
      language === "de"
        ? "Zielordner nicht definiert"
        : "Target folder not defined",
    );
  },
);
