<a id="audit-routing-and-archive-retention"></a>

# Audit-Routing und Archivaufbewahrung

[English](audit-logs.md) | [Deutsch](audit-logs.de.md)

Deutsche Lesefassung. Der Assistant liest ausschliesslich die englische Quelle.

<a id="purpose"></a>

## Zweck

Organisationsweite Control-Plane-Audit-Ereignisse fuer Untersuchungen erfassen
und mit bewusst gewaehltem Zugriff, Umfang und Aufbewahrung archivieren.

<a id="accelerator-contract"></a>

## Accelerator-Vertrag

Natives `audit_logs` ist optional; `null` ueberspringt seine
Management-Ressourcen. Das Modul leitet Audit-Ereignisse an ein OTLP-Logs-Ziel
und ein Object-Storage-Archiv weiter.
Felder sind unter anderem `retention_days`, `acl`, `s3_object_lock` und
`link_scopes` mit `resource_type/resource_id`.
Standardumfang ist organisationsweit; explizite Bereiche unterstuetzen
Organisation, Ordner oder Projekt. Mit aktiviertem Object Lock begrenzt der
native Vertrag die Aufbewahrung auf 1..365 Tage.
Abfrageaufbewahrung und Archivrichtlinie von Backups oder rechtlicher
Compliance-Zertifizierung unterscheiden.

<a id="dependencies"></a>

## Abhaengigkeiten

Management-Grundlagen, Organisationszugriff und extern bereitgestellte
Zugangsdaten. Verknuepfte Bereiche muessen zu autorisierten Ressourcen gehoeren.
Zentrale Observability und Audit Logging sind verschiedene optionale Services.

<a id="dialogue"></a>

## Dialog

Audit-Pflichten, Aufbewahrungszeit, organisationsweiten versus ausgewaehlten
Umfang, Leserzugriff und Aufbewahrungs-/Loeschbeschraenkungen erfragen.
Folgen von Object Lock vor einem Vorschlag beschreiben.
Ressourcenauswahl ueber autorisierte Schnittstellen aufloesen; Kunden niemals
auffordern, interne Scope-IDs oder rohe Audit-Logs einzufuegen.

<a id="examples"></a>

## Beispiele

Synthetisches Fragment: `audit_logs = { retention_days = 180,
s3_object_lock = true }`. Andere Felder nutzen native Defaults; dies ist
weder eine rechtliche Aufbewahrungsempfehlung noch die Aufforderung,
Audit automatisch zu aktivieren.

<a id="limits"></a>

## Grenzen

Object Lock kann Loeschung unabhaengig vom Ablauf von Configurator-Gespraechen
einschraenken. Audit-Router-Konfiguration beweist weder zugestellte Ereignisse
noch die Abdeckung aller Bereiche.
Umfang, Berechtigungen, Ingestion und Archivabruf benoetigen eigene Tests.
Native Editor-Vorschlaege unterstuetzen typisierte Audit-Einstellungen;
neue Instanzen benoetigen explizite Entscheidungen zu Aufbewahrung, ACL und
Object Lock, keine Zustimmung durch Beispiel/Default.

<a id="credentials"></a>

## Zugangsdaten

Archiv- und Ingestion-Zugangsdaten gehoeren in sichere Ausfuehrungsbindungen.
Niemals S3-Schluessel, OTLP-Tokens, Archivinhalte oder Compliance-Nachweise an
das Modell senden.

<a id="sources"></a>

## Quellen

Root- und Management-Vertraege pinnen Umfang und Aufbewahrungsverhalten.
Service-Limits und Implementierungsaenderungen erneut pruefen, statt
Quellen-Hashes stillschweigend aufzuwerten.
Externe Compliance und Aktualitaet des Providers werden hier nicht behauptet.
