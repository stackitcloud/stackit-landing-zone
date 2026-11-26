import { describe, expect, it } from "vitest";
import {
  type PublicationPreview,
  publicationPlatforms,
  publicationTargets,
} from "../apps/web/src/components/ApplicationPublication";
import { legacyAccessTemplate } from "./fixtures/application-access-transition";

describe("guided Application publication", () => {
  it("uses persisted configuration identity and retains ambiguity instead of picking the latest unrelated Apply", () => {
    const base = {
      configurationName: "Same name",
      finishedAt: "2026-11-01T00:00:00Z",
    };
    const items = [
      { ...base, id: "old", configurationId: "current" },
      { ...base, id: "latest", configurationId: "other" },
      { ...base, id: "legacy" },
      { ...base, id: "second", configurationId: "current" },
    ];
    expect(
      publicationPlatforms(items, "current").map((item) => item.id),
    ).toEqual(["old", "second"]);
    expect(publicationPlatforms(items, null)).toEqual([]);
    expect(publicationPlatforms(items, "document-local-id")).toEqual([]);
  });
  it("keeps compatible target choices and rejects different regions and scopes", () => {
    const target = {
      folder_id: "folder",
      region: "eu01" as const,
      corporate: true,
      network_area_id: null,
      firewall_next_hop_ip: null,
      ipv4_nameservers: null,
    };
    const preview: PublicationPreview = {
      document: {
        schema_version: 1,
        tenant_id: "tenant",
        revision: "revision",
        organization_id: "organization",
        targets: {
          first: target,
          second: { ...target, folder_id: "other" },
          otherRegion: { ...target, region: "eu02" },
          public: { ...target, corporate: false },
        },
      },
      source: {
        applyRunId: "apply",
        contractRevision: "revision",
        stateKey: "state",
        stateVersion: "1",
        documentSha256: "0".repeat(64),
      },
    };
    expect(
      publicationTargets(preview, legacyAccessTemplate).map(([key]) => key),
    ).toEqual(["first", "second"]);
    expect(publicationTargets(null, legacyAccessTemplate)).toEqual([]);
    expect(publicationTargets(preview, undefined)).toEqual([]);
  });
});
