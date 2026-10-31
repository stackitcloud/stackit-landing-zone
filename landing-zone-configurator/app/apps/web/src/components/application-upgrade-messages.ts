export const upgradeReasonMessages: Record<string, string> = {
  "execution-or-recovery-active":
    "Eine Ausführung oder die Klärung eines fehlgeschlagenen Apply ist noch offen. Schließe sie vor einem Upgrade ab.",
  "runner-ticket-active":
    "Eine Runner-Berechtigung ist noch aktiv. Warte auf ihren Ablauf, bevor du den Ausführungsstand änderst.",
  "guided-recovery-active":
    "Eine geführte State-Wiederherstellung ist noch aktiv. Schließe sie vor einem Upgrade ab.",
  "apply-grant-active":
    "Eine Apply-Freigabe ist noch aktiv. Kläre die bestehende Ausführung vor einem Upgrade.",
  "execution-claim-active":
    "Ein Runner hält noch eine Ausführungsberechtigung. Kläre die bestehende Ausführung vor einem Upgrade.",
  application_upgrade_plan_blocked:
    "Dieser Upgrade-Plan ist gesperrt. Prüfe die Hindernisse und erstelle anschließend einen neuen Plan.",
  application_upgrade_plan_stale:
    "Dieser Upgrade-Plan ist nicht mehr aktuell. Prüfe den neuesten gespeicherten Plan.",
  "parameter-confirmation-required":
    "Ein neuer Bestellparameter muss ausdrücklich beantwortet werden.",
  "parameters-not-compatible":
    "Die bisherigen Antworten passen noch nicht vollständig zur Zielversion.",
  "component-removal":
    "Das Upgrade würde eine bestehende Komponente entfernen und ist gesperrt.",
  "instance-identity-change":
    "Das Upgrade würde die Identität bestehender Ressourcen verändern und ist gesperrt.",
  "state-backend-migration":
    "Ein Wechsel des State-Backends ist hier nicht zulässig.",
  "template-family-changed":
    "Ein Wechsel der Template-Familie ist hier nicht zulässig.",
  "region-migration": "Ein Regionswechsel ist hier nicht zulässig.",
  "parent-container-migration":
    "Ein Wechsel des übergeordneten Containers ist hier nicht zulässig.",
  "network-area-migration":
    "Ein Wechsel der Network Area ist hier nicht zulässig.",
  "network-mode-migration":
    "Ein Wechsel zwischen Public und Corporate ist hier nicht zulässig.",
  "platform-target-unavailable": "Das Plattformziel ist nicht mehr verfügbar.",
  "target-version-retired":
    "Die Zielversion ist stillgelegt und kann nicht übernommen werden.",
  "target-not-qualified":
    "Die Zielversion ist noch nicht vollständig für die Ausführung qualifiziert.",
  "execution-source-change": "Die Ausführungsquelle ändert sich.",
  "platform-network-change": "Netzwerkvorgaben der Plattform ändern sich.",
  "network-change": "Die Netzwerkkonfiguration ändert sich.",
  "iam-change": "Projektrollen oder Automatisierungsrechte ändern sich.",
  "key-change": "Schlüssel oder Rotationseinstellungen ändern sich.",
  "service-change": "Die Dienstkonfiguration ändert sich.",
  "plan-service-change":
    "Ein Dienst wird angelegt oder geändert. Prüfe Leistungsstufe, Kapazität, Verfügbarkeit und Datenaufbewahrung im Plan; ein technisch möglicher Wechsel garantiert keinen Datenerhalt.",
  "unknown-setting-change":
    "Eine nicht freigegebene Konfigurationsänderung blockiert dieses Upgrade.",
};

upgradeReasonMessages["upgrade-target-not-qualified"] =
  upgradeReasonMessages["target-not-qualified"] ?? "";
upgradeReasonMessages["application-platform-execution-active"] =
  upgradeReasonMessages["execution-or-recovery-active"] ?? "";
