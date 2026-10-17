<a id="configurator-platform"></a>

# Configurator-Plattform

[English](README.md) | [Deutsch](README.de.md)

Dieser Root verwaltet CF-Organisation und technischen Org-Manager, PostgreSQL Flex samt Datenbank/Migrationsnutzer, Secrets Manager samt Provisionierungsnutzer, Artefakt-Bucket und AI Model Serving inklusive Auth-Token. Der STACKIT-Provider aktiviert Model Serving bei der Token-Erstellung.

Region, Foundation, Quota, DB-Plan und verifizierte Quell-CIDRs sind explizite Eingaben. Keine offene Standard-ACL. Der Datenbank-Owner ist für Migrationen vorgesehen, nicht als späterer App-Benutzer; App-Rollen/RLS und Secret-Policies werden in der Runtime-Schicht ergänzt.

Voraussetzung: erfolgreich angewendeter State-Bootstrap und Backend-Root mit aktivierter Versionierung. Die Pipeline übergibt dessen Backend-Zugang aus einer privaten temporären Output-Datei; normale OpenTofu-Ausgaben bleiben sichtbar. [IaC-Anleitung](../README.de.md).

Ein `sensitive`-Output maskiert nur die Anzeige. Provider-erzeugte Credentials liegen im verschlüsselten State. Nachgelagerte IaC erhält nur die benötigten Outputs; keine Anbindung der unbeschränkten Provisionierungsidentitäten an Kunden-Runner.

<a id="isolated-plan-runners"></a>

## Isolierte Plan-Runner

`6-plan-runners.tf` provisioniert eine separate CF-Organisation `lzc-dev-runners` und
deren Manager. Der initiale geprüfte Plan enthält genau zwei Neuanlagen und keine Änderungen
oder Löschungen. Dies ist Configurator-Infrastruktur, kein Kunden-Landing-Zone-Apply.
Der Manager wird ausschließlich vom vertrauenswürdigen Dispatcher und der Release-Pipeline verwendet;
einzelne Runner-Apps erhalten ein kurzlebiges Ticket pro Job, niemals diese Identität.
