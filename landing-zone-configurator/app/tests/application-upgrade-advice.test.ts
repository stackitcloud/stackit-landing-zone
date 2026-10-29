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
      "Gemeinsame Firewall-Änderungen wirken auf alle abhängigen Applications. Abhängigkeitsprüfung und Plan-Freigabe sind vor Apply nötig. Danach den tatsächlich entstandenen Plattformvertrag und den Pfad veröffentlichen. Der Application Owner übernimmt ihn ausdrücklich. Die Vertragsbindung wechselt nicht automatisch.",
      "platform",
    ),
  ).toEqual([]);
});

it("rejects the observed automatic-contract answer even when shared impact and Plan gates are mentioned", () => {
  const failures = assistantApplicationUpgradeFailures(
    "Ein Plattform-Upgrade ändert die gemeinsame Firewall für alle abhängigen Applications. Abhängigkeitsprüfung und Plan-Freigabe sind nötig. Nach Apply gilt der neue genehmigte Plattformvertrag auch wenn die Application das Upgrade ablehnt.",
    "platform",
  );
  expect(failures).toContain("application_upgrade_missing_actual-contract");
  expect(failures).toContain("application_upgrade_missing_published-path");
  expect(failures).toContain("application_upgrade_missing_explicit-binding");
});
