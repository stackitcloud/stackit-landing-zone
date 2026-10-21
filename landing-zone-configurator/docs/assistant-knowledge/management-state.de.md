<a id="management-project-and-state-foundations"></a>

# Grundlagen fuer Management-Projekt und State

[English](management-state.md) | [Deutsch](management-state.de.md)

Deutsche Lesefassung. Der Assistant liest ausschliesslich die englische Quelle.

<a id="purpose"></a>

## Zweck

Management-Projekt der Plattform, Terraform-State-Speicher und grundlegende
Betriebsidentitaeten bereitstellen. Von optionalen Monitoring-Services und dem
Backend unterscheiden, das den eigenen State des aktuellen Accelerator-Deployments
speichert.

<a id="accelerator-contract"></a>

## Accelerator-Vertrag

Der Root ruft `module.management` bedingungslos unter dem Governance-
Plattformordner auf. Eigentuemerschaft, Benennung, Organisation und Labels werden
aus Root-Eingaben abgeleitet. Die Management-Implementierung bestimmt
State-Bucket- und Identitaetsressourcen; es gibt keinen unabhaengigen erfundenen
Schalter `management_enabled`.
Das Modul erstellt auch seine Secrets-Manager-Grundlage; diese Instanz nicht mit
der separaten Wahl `secretsmanager_enabled` jeder Workload gleichsetzen.
Backend-Bootstrap/-Konfiguration ist eine getrennte Voraussetzung nativer
Ausfuehrung, keine in exportierte Konfiguration eingebettete
Configurator-Laufzeitabhaengigkeit.


`bucket_naming` verwendet standardmäßig `project-id`: Alle Management- und
Workload-Buckets enthalten die vollständige ID ihres Projekts und unterschiedliche
Zwecksuffixe, höchstens 63 Zeichen lang. Der Namensraum gilt STACKIT-weit.
`legacy` ist eine ausdrückliche Kompatibilitätswahl für vorhandene Bucket-Namen.
Ein Wechsel bei bestehenden Buckets erfordert eine geprüfte Migration oder
Ersetzungsentscheidung. Nach einem fehlgeschlagenen Apply ohne Buckets können
vorhandenes Projekt und State mit den neuen Namen weiterverwendet werden.

<a id="dependencies"></a>

## Abhaengigkeiten

Governance-/Benennungs- und Zugangsdaten-Grundlagen.
Observability, Audit-Routing und Federation sind optionale
Management-Einstellungen. Ihre Wissensabhaengigkeiten machen diese Services
nicht verpflichtend.

<a id="dialogue"></a>

## Dialog

Erklaeren, dass "zuerst nur SNA" die gewuenschte Konfigurationsaenderung begrenzt,
nicht eine gezielte Cloud-Operation: Ein vollstaendiger nativer Apply umfasst
weiterhin verpflichtende Basisressourcen und andere aktivierte Eingaben.
Backend-Eigentuemerschaft, Lebenszyklus, Aufbewahrung und
Betriebsverantwortung erfragen, ohne State oder Passwoerter anzufordern.

<a id="examples"></a>

## Beispiele

Synthetische Basis: `observability = null`, `audit_logs = null`,
`federated_identity_providers = []`. Optionale Services sind deaktiviert,
Management und Governance bleiben jedoch Teil des Roots.
Dies ist ein Fragment, kein vollstaendiger Lauf.

<a id="limits"></a>

## Grenzen

Ein erstellter State-Bucket beweist weder ein konfiguriertes Backend noch
erfolgreiche State-Migration, Verschluesselung, sichere Sperren oder
Disaster Recovery. Niemals Remote-State als Chat-Aktion lesen, abrufen oder
veraendern. Plan, Apply, Destroy, Recovery und Veroeffentlichung haben eigene
Autorisierungsgates; kein gezielter Terraform-Workaround.

Eine Quellkorrektur darf einen fehlgeschlagenen Bootstrap-Checkpoint nur nach
explizitem Abgleich seiner exakten State-Version durch den Eigentümer verwenden,
mit unterstütztem festgelegtem Quellstand und ohne Sperre, Migration, separaten
Recovery-State oder aktiven Lauf. Eine neue Vorbereitung und einen neu geprüften
Plan verwenden; niemals mit leerem State beginnen oder den verbrauchten Plan
wiederholen.

<a id="credentials"></a>

## Zugangsdaten

Backend-/Object-Storage- und Provider-Zugangsdaten ueber freigegebene externe
Ausfuehrungsbindungen bereitstellen. Schluessel, Passphrasen, State-Inhalte und
Plan-Dateien duerfen niemals in Modellkontext oder Wissensdateien gelangen.

<a id="sources"></a>

## Quellen

Root- und Management-Implementierung sowie Deployment-Zugangsdaten-Dokumentation
sind im Manifest per Fingerprint gebunden. Ressourcen-/Bootstrap-Aenderungen
vor Neugenerierung erneut pruefen; kein Quellenstand beweist betriebliche
Recovery-Qualifikation.
