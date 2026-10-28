# Lebenszyklus der Application-Ausführung

[English](application-execution-lifecycle.md) | [Deutsch](application-execution-lifecycle.de.md)

Eine Application-Bestellung beschreibt eine bestehende Instanz einschließlich
Projekt und State-Zuordnung. Ein Configurator-Update macht daraus keine neue
Bestellung. Ihr veröffentlichtes Template bleibt der unveränderliche Ursprung
und die Richtlinie dieser Instanz.

## Mit einer bestehenden Bestellung weiterarbeiten

Öffne die Bestelldetails. **Ausführungsstand** unterscheidet die ursprüngliche
Template-Revision, den gewünschten Ausführungsstand und die Revision des letzten
erfolgreichen Applies. Drift, neue Pläne und Wartung verwenden den gewünschten
Stand statt des aktuellen Standards für neue Template-Veröffentlichungen.

Das Runner-Paket enthält geprüfte historische Accelerator-Quellen, die genaue
Provider-Lockdatei, OpenTofu-Version und den Ausführungsvertrag. Der aktuelle,
gepatchte Worker prüft Paketmanifest und Quell-Digest, bevor er Zugangsdaten
materialisiert oder OpenTofu ausführt. Er lädt zur Laufzeit keine beliebigen
Git-Revisionen herunter. Historische native Quellen benötigen keine zusätzlichen
dauerhaft laufenden CF-Apps: Der zentrale Pool kann bei einem bereiten Runner
bleiben.

Die Veröffentlichung einer neuen Template-Version bindet bestehende Bestellungen
nicht stillschweigend um. Ein Produktupdate sperrt weiterhin einen alten
gespeicherten Plan, wenn seine genaue Runner-Artefaktbindung nicht mehr verfügbar
ist. Erstelle dann einen frischen Plan derselben Bestellung; lege keine
Ersatzinfrastruktur an und verwende keinen alten Apply-Plan erneut.
Berichte eines bereits ausgestellten gültigen Runner-Tickets bleiben auch über
API-Releases an dessen ursprüngliches Paket, Quelle und Lockdatei gebunden.

## Dieselbe Bestellung aktualisieren

1. Öffne **Ausführungsstand** und prüfe die angebotene Zielrevision.
2. Bestätige, dass dieselbe Bestellung und derselbe State erhalten bleiben und
   der neue Plan auf Änderungen, Ersetzungen und Löschungen geprüft werden muss.
3. Wähle **Ausführungsbindung aktualisieren**. Das ändert ausschließlich die gewünschte
   Ausführungsbindung. Es startet keinen Plan, Apply, Import, Unlock oder
   State-Schreibzugriff.
4. Erstelle im normalen Bestellablauf einen neuen Plan. Prüfe ihn vollständig
   und gib Apply gemäß der bestehenden Freigaberichtlinie frei.

Der Besteller kann dies mit seiner bestehenden Bestellberechtigung durchführen;
ein Upgrade verleiht keine zusätzlichen Projektrechte. Organisation, Plattformziel,
Backend, State-Key, Owner, Parameter und Template-Richtlinie bleiben an dieselbe
Instanz gebunden. Änderungen daran benötigen den jeweils getrennten Produktablauf.

Ein Bindungswechsel setzt eine ruhende Instanz voraus. Laufende oder ungeklärte
Jobs, gültige Runner-Freigaben und offene Recovery sperren den Wechsel. Diese
müssen zuerst abgeschlossen oder abgeglichen werden. Der Server prüft den
erwarteten Quellstand erneut und sperrt alte ungenutzte Ausführungsfreigaben;
ein alter Plan kann dies auch über direkte API- oder Datenbankzugriffe nicht
umgehen.

Bekannte historische Defaults bleiben beim Upgrade ausdrücklich erhalten.
Insbesondere behalten Bestellungen mit bisherigen Bucket-Namen diese Namen über
eine serverseitig abgeleitete Kompatibilitätseingabe; neue Bestellungen verwenden
weiter den Namensstandard mit Projekt-ID. Ein Upgrade erlaubt kein stilles
Umbenennen oder Ersetzen bestehenden Speichers.

Scheitert ein Apply nach dem Upgrade, bleibt die gewünschte Zielbindung erhalten.
Recovery verwendet die Quelle des unterbrochenen Jobs; danach ist ein frischer
Plan erforderlich. Ein teilweise aktualisierter State darf nicht stillschweigend
auf einen älteren Accelerator zurückgeschaltet werden.
Die Revision des letzten erfolgreichen Applies wird getrennt vom gewünschten
Ausführungsstand angezeigt.

## Zurückgezogene und nicht verfügbare Stände

Ein Operator kann eine Ausführungsquelle durch eine geprüfte Migration
zurückziehen, beispielsweise nach einem Sicherheitsbefund. Das sperrt neue
Ausführung und Zugangsdatenfreigabe für diese Quelle; Jobhistorie, Berichte und
State werden nicht gelöscht. Wird die ursprüngliche Quelle bei offener Recovery zurückgezogen, bleiben
Checkpoint und Sperre erhalten. Ein Operator muss ein geprüftes kompatibles
Recovery-Paket bereitstellen; weder Quellsperre umgehen noch einen ungeklärten
State aktualisieren. Die Bestellung zeigt den geprüften Ersatzpfad.
Der Besteller aktualisiert dieselbe Bestellung und prüft vor Apply einen neuen
Plan. Chat, Kundenparameter und Browseranfragen können eine zurückgezogene
Quelle nicht wieder freigeben.

Ein fehlendes Paket wird getrennt von einer zurückgezogenen Quelle gemeldet.
Der Operator stellt das geprüfte Paket wieder bereit oder bietet den geprüften
Upgrade-Pfad an. Paketprobleme werden nicht durch erfundene Quell-Hashes,
entfernte Quellprüfungen oder die Neubestellung eines bestehenden Projekts gelöst.

Der Assistant erklärt Quellen-Upgrades anhand eines festen Produktablaufs, damit
ein neuer Plan und die separate Apply-Freigabe nicht durch eine Modellformulierung
entfallen. Er liest die Bestellung dabei nicht aus und ändert ihre Bindung nicht
im Chat.

## Vertrag für den Betrieb

Der geprüfte Vertragskatalog und das Ausführungsquellenregister der Datenbank
müssen bei Quelle, Provider-Lock-Digest, Werkzeugversion, Vertrag und Ersatzpfad
übereinstimmen. Der Paketbau archiviert diese genauen Git-Commits und validiert
jede unterstützte native Root mit dem unveränderlichen Provider-Mirror. Eine
neue Revision ist eine ausdrückliche Kompatibilitätsänderung mit Offline-Plan-
und State-Regressionsprüfungen, keine Ausnahme in einer API-Freigabeliste.
Eine Quelle kann für bestehende Instanzen unterstützt bleiben, während neue
Template-Veröffentlichungen den aktuellen Standard verwenden.

Ausführungsbindungen bilden eine ausschließlich ergänzte Audit-Historie. Jobs
halten ihre wirksame Bindung fest; Grants, Tickets, gespeicherte Artefakte und
Berichte behalten ihre ursprüngliche Quelle, Paket- und Lock-Identität.
Registeränderungen gehören der Migrationsidentität; die Laufzeitrolle kann sich
keine Unterstützung für beliebige Quellen erteilen. Bestehende State-Sperren und
Recovery-Fences bleiben verbindlich. [Plan-Ausführung](plan-execution.de.md)
beschreibt die Vertrauensgrenzen für Ausführung und Recovery.
