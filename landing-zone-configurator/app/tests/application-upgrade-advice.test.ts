import { expect, it } from "vitest";
import { assistantApplicationUpgradeFailures } from "../scripts/assistant-scenarios.js";

it("requires the real upgrade and approval boundaries instead of a generic explanation", () => {
  expect(
    assistantApplicationUpgradeFailures(
      "Ein Upgrade ist möglich. Nichts ausgeführt.",
      "template",
    ),
  ).toContain("application_upgrade_missing_destructive-block");
  expect(
    assistantApplicationUpgradeFailures(
      "Der Platform Owner veröffentlicht den Pfad. Antworten und State bleiben erhalten. Neuer Plan, separate Apply-Freigabe. Löschungen und Ersetzungen werden blockiert.",
      "template",
    ),
  ).toEqual([]);
});
it("requires actual contract and shared dependency impact for platform advice", () => {
  expect(
    assistantApplicationUpgradeFailures(
      "Deine alte Firewall bleibt erhalten.",
      "platform",
    ),
  ).toContain("application_upgrade_missing_dependency-check");
  expect(
    assistantApplicationUpgradeFailures(
      "Gemeinsame Firewall-Änderungen wirken auf alle abhängigen Applications. Abhängigkeitsprüfung und Plan-Freigabe sind vor Apply nötig. Danach den tatsächlich entstandenen Plattformvertrag freigeben.",
      "platform",
    ),
  ).toEqual([]);
});
