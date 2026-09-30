# Configurator-Plattform

Dieser Root verwaltet CF-Organisation und technischen Org-Manager, PostgreSQL Flex samt Datenbank/Migrationsnutzer, Secrets Manager samt Provisionierungsnutzer, Artefakt-Bucket und AI Model Serving inklusive Auth-Token. Der STACKIT-Provider aktiviert Model Serving bei der Token-Erstellung.

Region, Foundation, Quota, DB-Plan und verifizierte Quell-CIDRs sind explizite Eingaben. Keine offene Standard-ACL. Der Datenbank-Owner ist für Migrationen vorgesehen, nicht als späterer App-Benutzer; App-Rollen/RLS und Secret-Policies werden in der Runtime-Schicht ergänzt.

Voraussetzung: erfolgreich angewendeter State-Bootstrap und Backend-Root mit aktivierter Versionierung. Die Pipeline übergibt dessen Backend-Zugang aus einer privaten temporären Output-Datei; normale OpenTofu-Ausgaben bleiben sichtbar. [IaC-Anleitung](../README.md).

Ein `sensitive`-Output maskiert nur die Anzeige. Provider-erzeugte Credentials liegen im verschlüsselten State. Nachgelagerte IaC erhält nur die benötigten Outputs; keine Anbindung der unbeschränkten Provisionierungsidentitäten an Kunden-Runner.

## Isolated plan runners

`6-plan-runners.tf` provisions a separate `lzc-dev-runners` CF organisation and
its manager. The initial reviewed plan contains exactly two creates and no changes
or deletes. This is Configurator infrastructure, not a customer Landing Zone apply.
The manager will be used by the trusted dispatcher and release pipeline only;
individual runner apps receive a short-lived per-job ticket, never this identity.
