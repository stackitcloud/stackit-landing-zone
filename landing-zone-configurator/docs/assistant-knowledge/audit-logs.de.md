# Audit-Routing und Archivaufbewahrung

[English](audit-logs.md) | [Deutsch](audit-logs.de.md)

Technische Observability-Credentials authentifizieren Ingestion/Abfragen, nicht den Grafana-SSO-Login. Die geprüfte Feldübersicht erklärt den zentralen Zielwechsel und unterscheidet bereits angebundene Bestellungen von fehlenden Projekt-Links.

## Zweck

Control-Plane-Audit-Ereignisse mit bewusst gewähltem Umfang, Zugriff und
Aufbewahrung erfassen.

## Accelerator-Vertrag

`audit_logs=null` überspringt Routing und Aufbewahrung, nicht den bestehenden
Archiv-Bucket. Die Ziele sind S3 und genau eine abfragbare Ablage. Mit zentraler Observability
wird deren OTLP-Ziel verwendet und das vorhandene Grafana Audit Logs Dashboard
befüllt. Eine separate Logs-Instanz samt Tokens und Ziel entfällt. Ohne Observability
bleibt STACKIT Logs die abfragbare Ablage. Ein technischer Zugang genügt, kein
Grafana-Admin. Der Tarif muss Logs unterstützen; Monitoring, Frontend und
MetricsEndpoint reichen nicht. Die Router-Netze ergänzen die Observability-ACL;
bestehende Client-Einträge bleiben erhalten. Observability hat eigene Aufbewahrung
und Kosten; `retention_days` steuert S3 und nur ohne Observability zusätzlich Logs.
`audit_logs.acl` gilt für den Logs-Fallback, `observability.acl` für Observability.
Bestehende Dev-Plattformen werden per geprüftem Plattform-Plan/Apply direkt umgestellt:
Die separate Logs-Instanz mit Historie, Tokens und altem Ziel wird entfernt.
S3, Router, Links und Projekte bleiben erhalten. Bereits angebundene Application-
Projekte brauchen kein Bestellungs-Upgrade. Alte Logs werden nicht rückwirkend
kopiert; nach Apply ein neues Ereignis im Dashboard prüfen. Zustellung kann
verzögert sein; zunächst die letzten 24 Stunden und alle Filter wählen. Felder:
`retention_days`, `acl`, `s3_object_lock`, `managed_resources`, `link_scopes`
mit `resource_type/resource_id`. Object Lock verwendet standardmäßig `true`,
auch bei verschachteltem `null`; die Aufbewahrung beträgt standardmäßig 180 Tage.
Ausdrückliches `false` verzichtet vor der Archiverstellung darauf. Mit Lock gelten
1–365 Tage und GOVERNANCE-Modus: kein umkehrbarer Schalter und keine
Compliance-Zertifizierung.

Ein Organisations-Link erfasst NUR Organisationsereignisse; Ordner und Projekte
erben ihn nicht. `managed_resources` bleibt aus Kompatibilitätsgründen
standardmäßig `false`. Ausdrückliches `true` ergänzt Links für alle vom Accelerator
verwalteten Ordner und Projekte, einschließlich neuer Application-Bestellungen
über den veröffentlichten Plattformvertrag. Bestehende Bestellungen benötigen
einen freigegebenen Plattform-Upgrade-Pfad und einen neuen Plan/Apply. Nicht mit
expliziten `link_scopes` kombinierbar. Derzeit müssen alle verwalteten Ressourcen
die Plattformregion verwenden; weitere Regionen benötigen separate geprüfte
Router. Manuelle Ziele unterstützen Organisation, Ordner und Projekt. Bestehende
externe Links benötigen einen geprüften Import, keine stille Übernahme.

## Abhängigkeiten

Management, berechtigte zentrale Deployment-Identität und gleiche Region für
Router und Link. Audit und Observability sind separate Dienste.
Application-Ingestion-Tokens liegen im zentralen Projekt; Workload-Identitäten
erhalten keinen Zugriff auf diese zentralen Tokens.

## Dialog

Aufbewahrung, ACL, Object Lock sowie reine Organisationsereignisse gegenüber
verwalteten Ressourcen klären. Gespeicherte Entscheidungen erhalten; Defaults
sind keine Zustimmung. Für ausdrücklich gewünschte verwaltete Abdeckung
`managed_resources=true` mit geprüften Audit-Einstellungen vorschlagen, keine
erfundenen Projekt-IDs oder manuellen `link_scopes`.

## Beispiele

Synthetische Aktivierung: `audit_logs={ retention_days=90,
acl=["203.0.113.0/24"], s3_object_lock=false, managed_resources=true }`.
Nur ein Entwurf, kein Deployment.

## Grenzen

Neue Configurator-Audit-Konfigurationen verlangen ausdrückliche Entscheidungen
zu Aufbewahrung, ACL und Object Lock. Links erfassen zukünftige Ereignisse, keine
rückwirkende Historie. Standardrechte enthalten keine Audit-Änderungsrechte;
effektive Owner- oder geerbte Rechte können Routing trotzdem verändern. Kein
Deny-Versprechen gegenüber diesen Identitäten. Echte Zustellung nach Logs/S3
und Zugriffsbeschränkungen separat prüfen. Recovery erhält Link-Identitäten;
ein verlorenes Ingestion-Geheimnis verlangt gezielt bestätigten Widerruf und
neuen Plan/Apply für Ersatz, niemals erfundene Zugangsdaten.

## Zugangsdaten

Keine Router-/OTLP-Tokens, S3-Schlüssel, States oder Audit-Inhalte im Chat oder
öffentlichen Vertrag. Geheimnisse bleiben in geschützter Ausführung und
State-Ablage.

## Quellen

Das Manifest bindet Root-, Management-, Application- und Recovery-Verträge.
Vor Generierung erneut prüfen. Konfiguration belegt weder Zustellung noch
rechtliche Compliance.

Die Logs-ACL ergänzt vorhandene Client-Netze automatisch um die aktuellen öffentlichen STACKIT-Netze aus der nativen API-Abfrage. Diese Netze sind nicht exklusiv für Telemetry Router. Ein gültiges Token bleibt erforderlich. Optional kann `router_egress_cidrs` eine geprüfte, nicht leere IPv4-CIDR-Liste für eine engere Freigabe vorgeben. Ohne verfügbare Router-Quellnetze wird das Deployment abgewiesen.

Neue Audit-Entwürfe verwenden nur ausdrückliche Audit-Antworten zu Tagen,
Zugriffsnetzen und Object Lock. Fehlende Angaben werden gezielt nachgefragt;
Standardwerte, Assistant-Aussagen und frühere Firewall-Netze sind keine Zustimmung.
