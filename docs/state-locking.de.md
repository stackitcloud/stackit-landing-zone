# State-Locking auf STACKIT Object Storage

[English](state-locking.md) | [Deutsch](state-locking.de.md)

Der geprüfte EU01-Object-Storage-Endpunkt erzwingt keine bedingte Objekterzeugung
(`If-None-Match: *`). OpenTofus S3-Einstellung `use_lockfile = true` stellt dort
deshalb keinen gegenseitigen Ausschluss her. Ein erfolgreicher Plan oder ein
vorhandenes `.tflock`-Objekt belegt kein funktionierendes Locking. Die unabhängige
Reproduktion steht in [Issue #262](https://github.com/stackitcloud/stackit-landing-zone/issues/262).
Ein nativer Service-Feature-Request ist gestellt; ein Implementierungstermin ist
nicht angekündigt. Andere Regionen erst nach Prüfung ihres Endpunkts bewerten.

## Accelerator ohne Configurator

STACKIT S3 bleibt als State-Speicher nutzbar, wenn Zugriffe **organisatorisch
serialisiert** sind. Pro State darf genau ein CLI-/Pipeline-Verantwortlicher
gleichzeitig arbeiten, einschließlich Plan, Apply, Destroy, Import, Refresh,
Migration und Recovery. Getrennte Application-States können unabhängig laufen.
Verantwortung und gemeinsames Ausführungsverfahren festlegen; die Concurrency-
Gruppe eines Workflows koordiniert weder eine unabhängige CLI noch andere Repositories.

Das Application-Backend-Beispiel setzt ausdrücklich `use_lockfile = false`, weil
der Endpunkt diese Sperre nicht erzwingen kann. Gleichzeitiger Zugriff wird damit
nicht sicher. Wenn organisatorischer Einzelzugriff nicht garantiert werden kann,
ein Backend mit unabhängig geprüftem atomarem Locking verwenden. Keinen zweiten
leeren State anlegen und bestehende States nur mit geprüftem Verfahren und
wiederherstellbarer Sicherung migrieren.

## Vom Configurator verwaltete Ausführungen

Der Configurator serialisiert in PostgreSQL über alle API-Replikate hinweg:

- Ein physischer S3-Pfad aus Endpunkt, Bucket und Key gehört zu genau einem
  logischen verwalteten Plattform- oder Application-State. Registrierungen für einen
  anderen logischen State oder Arbeitsbereich werden auch bei parallelen
  Anfragen abgewiesen.
- Plattform-Ausführungsreservierungen und Application-Dispatch-Reservierungen
  sind atomare Datenbankoperationen. Getrennte States können parallel laufen;
  derselbe State bekommt keine konkurrierenden verwalteten Ausführungen.
- Ablauf von Zugangsdaten oder Tickets belegt keinen gestoppten Prozess.
  Bereits übernommene abgebrochene/fehlgeschlagene Plattform-Läufe bleiben bis
  zur bestätigten Bereinigung oder explizit geprüften Recovery-Klärung gesperrt.
  Application-Reconciliation sperrt auch Drift und Destroy; Ticketablauf allein
  hebt die Sperre nicht auf.
- Quellen-, Eigentümer-, Mandanten-, gespeicherte Plan-, State-Versions- und
  Recovery-Prüfungen gelten weiter. Historische Recovery-Nachweise bleiben unveränderlich.

Der S3-Deskriptor des Runners behält aus Kompatibilitätsgründen
`useLockfile=true`; das Objekt ist ein zusätzliches Signal, **nicht der
Synchronisationsmechanismus**. Diese Änderung migriert weder State-Objekte und
-Schlüssel noch gespeicherte Pläne. Historische Aliase eines physischen States
lassen die Migration zur Prüfung durch den Betreiber scheitern, statt einen
Schreiber auszuwählen oder die Zuordnung still zu überschreiben.

Die Koordination umfasst verwaltete Ausführungspfade einer Configurator-
Installation mit gemeinsamer Datenbank. Unabhängige CLI-Schreiber und andere
Installationen mit eigener Datenbank sind nicht eingeschlossen. Zugangsdaten und
State-Pfade einer Ausführungsverantwortung zuordnen; externer Notfallzugriff
benötigt gestoppte verwaltete Schreiber und State-Abgleich vor Wiederaufnahme.

Die Configurator-Betreiber-IaC nutzt ihre bestehende umgebungsweite Concurrency
über Workflows hinweg. Die Kunden-Ausführungsdatenbank schützt diese nicht;
direkte Betreiber-CLI-Zugriffe folgen ebenfalls dem Einzelzugriffsverfahren.
