# Plan-Runner

[English](README.md) | [Deutsch](README.de.md)

Ein kurzlebiger CF-Task pro Plan in einer eigenen Anwendung und CF-Organisation.
Der Task erhält nur eine kurzlebige Capability für einen gespeicherten Job, dessen ID und
den festen Broker-Origin. Es werden keine PostgreSQL-, Vault-, Model-Serving-, GitHub- oder
CF-Manager-Zugangsdaten gebunden. Die API ist der vertrauenswürdige Dispatcher/Credential-Broker.

Der Broker prüft Eigentümerschaft, Rolle, Credential-Version und Organisationszugriff erneut,
bevor er die unveränderlichen tfvars und den STACKIT-Schlüssel dieses Jobs einmalig zurückgibt.
OpenTofu läuft mit einer expliziten Umgebungs-Allowlist ohne Broker-Ticket. Quellcommit,
Provider-Lock und Engine werden in CI paketiert; benutzereigenes Terraform wird nicht ausgeführt.

`deploy/runner/run-plan.sh` enthält die direkten init-, validate-, plan- und show-Befehle.
Diese erste Implementierung unterstützt nur initiale Vorschauen mit leerem State. Es gibt
keinen apply-/destroy-Befehl oder -Endpunkt. Private Key, Logs, rohes JSON und binärer Plan bleiben
im kurzlebigen Container und werden entfernt; nur wertfreie Zählwerte verlassen ihn.
Diese Vorschauen können später nicht angewendet werden. Ein zukünftiges Apply benötigt einen neuen
Plan, ausdrückliche Freigabe und dauerhafte Bootstrap-State-Wiederherstellung, bevor es implementiert werden kann.

Der Task hat ein Engine-Zeitlimit von 18 Minuten; der gespeicherte Job läuft nach 25
Minuten ab. Die API-Wartung invalidiert abgelaufene Jobs und löscht abgeschlossene/abgebrochene
Runner-Apps. Fehlgeschlagener Dispatch wird nicht automatisch wiederholt. Ein Neustart zwischen
Datenbankeintrag und Dispatch hinterlässt einen sichtbaren Job, der abgebrochen werden kann oder abläuft.
Siehe [Ausführung und Abnahme](../../../docs/plan-execution.de.md).
