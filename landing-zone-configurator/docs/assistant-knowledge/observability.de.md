<a id="central-and-project-observability"></a>

# Zentrale und projektbezogene Observability

[English](observability.md) | [Deutsch](observability.de.md)

Deutsche Lesefassung. Der Assistant liest ausschliesslich die englische Quelle.

<a id="purpose"></a>

## Zweck

Logs, Traces und Metriken zentral oder je Projekt; Umfang und Aufbewahrung
folgen Betriebsanforderungen, nicht Template-Labels.

<a id="accelerator-contract"></a>

## Accelerator-Vertrag

`observability=null` deaktiviert zentrales Management-Monitoring.
Observability fuer Projekte und `platform_kubernetes` hat getrennte
verschachtelte Vertraege.
Zentrale Felder: `plan_name`, `acl`, Aufbewahrungszeiten fuer Logs/Traces/Metriken
und Downsampling. Eine Projektinstanz impliziert weder denselben zentralen
Service noch dieselbe Autorisierung.

<a id="dependencies"></a>

## Abhaengigkeiten

Management, Zugangsdaten, Projekt/Cluster, Ingestion-Pfade und bewusst
gewaehlte ACLs. Verschachtelten Umfang beachten.
Gewoehnliche Telemetrie beweist kein Audit Logging.

<a id="dialogue"></a>

## Dialog

Signale/Projekte, Aufbewahrungsbedarf, Zugriff und Dashboard-Betrieb klaeren.
Zentralen und projektbezogenen Umfang trennen.
Aktuelle Plaene/Kataloge wiederverwenden; ein nativer Default-Planname
beweist weder Verfuegbarkeit noch Quoten, Preise oder regionsuebergreifende
Unterstuetzung.

<a id="examples"></a>

## Beispiele

`metrics_retention_days=30`: Diese Wahl und Plan/ACL des Nutzers vorschlagen.
Andere Aufbewahrungsueberschreibungen auslassen, um native Defaults zu erben;
keine Beispielwerte fuer Logs/Traces kopieren oder bereits beantwortete ACLs
erneut abfragen. Optionale Aufbewahrungswerte sind keine Pflichtentscheidungen.

<a id="limits"></a>

## Grenzen

Schaetzungen benoetigen gemessenes Volumen und aktuelle Limits.
Leere/Default-ACLs sind nicht automatisch privat oder sicher.
Demos beweisen keine Produktionsabdeckung.
Typisierte native Editor-Vorschlaege aendern nur den lokalen Entwurf;
Ausfuehrung bleibt getrennt.

<a id="credentials"></a>

## Zugangsdaten

Provisionierungszugang von Ingestion-/Dashboard-Zugang trennen.
Keine Grafana-Passwoerter, Service-Tokens, OTLP-Secrets oder rohen
Kunden-Logs im Chat.

<a id="sources"></a>

## Quellen

Management-/Projekt-/Plattformvariablen und Manifest-/Engine-Bindung.
Nach Pruefung aktualisieren. Aktuelle Produktfakten und betriebliche
Qualifikation bleiben getrennt.
