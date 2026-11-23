# Rückbauintegration

[English](retirement.md) | [Deutsch](retirement.de.md)

Das [Lifecycle-Konzept](../../docs/destroy-lifecycle-concept.de.md) definiert das
vollständige Zielverhalten. Die aktuelle Umsetzung ist eine abgesicherte Grundlage,
keine aktivierte Plattform-Destroy-Funktion. `LZC_RETIREMENTS_ENABLED` ist standardmäßig
aus. Nicht als vollständigen Ausführungsablauf aktivieren oder ausrollen, bevor der
verbleibende Koordinator und die quellengebundene Runner-Anbindung qualifiziert sind.
Eine Produktionsaktivierung ist vom freigegebenen Dev-Test mit Wegwerf-Ressourcen getrennt.

## Implementierte Verträge

Migration `103_platform_retirements.sql` speichert Rückbauabsicht, genaue State-Bindung,
exportierte Plattformrevisionen/Ordnerumfänge, betroffene Besteller, Generation und
unveränderlich ergänzte Ereignisse außerhalb der Ziel-Cloud-Ressourcen. Der Platform
Owner braucht Plattformrolle und aktuellen verifizierten Organisationszugriff. Das
Vorbereitungsfenster beträgt standardmäßig sieben Tage und ist vor Ankündigung
wählbar. Der Rückbaustart sperrt Neuanlagen atomar. Vorhandene Ausführungen werden
abgeglichen und nicht als gestoppt angenommen. Unbekannte Ergebnisse und Recovery-
Sperren verhindern einen Abbruch.

Ein gemeinsamer transaktionaler Advisory-Lock ordnet Rückbaustart gegenüber neuen
Bestellungen, Veröffentlichungen/importierten Verträgen, Plattformquellen, Quellen-
Upgrades, Application-Jobs, Tickets, Claims, Backends, Dispatches, Plattform-Jobs und
Zugangsfreigabe-Verbrauch. Er gilt nur während der kurzen Zulassungstransaktion,
niemals während des Purge-Wartens. Bereits laufende Schreiber können Cloud-Zugangsdaten
besitzen; die Sperre beendet diese Aufrufe nicht. Destroy-Anfragen benötigen die
aktuelle Generation. Pause/Fortsetzung machen ältere vorbereitete Berechtigungen
ungültig. Eine andere Veröffentlichungsrevision macht einen stillzulegenden physischen
Ordner nicht wieder bestellbar. Geteilte oder ungeklärte State-Zuständigkeit verlangt
Prüfung statt Zusammenlegung von Deployments.

Besteller erhalten eine dauerhafte Workspace-Nachricht, auch nach Archivierung der
ursprünglichen Bestellung. E-Mails beachten das Thema `retirement` und die gewählte
Sprache. Bestehende Einstellungen und Standardauswahlen bleiben unverändert; das neue
Thema wird daher ausdrücklich eingeschaltet. E-Mail-Abwahl oder Zustellfehler entfernen
keine Nachricht im Posteingang. SMTP-Übergabe ist weder Zustimmung noch Zustellnachweis.
Der Platform Owner entscheidet; Zustimmung oder vorheriges eigenes Löschen durch
Besteller ist im Standard keine Voraussetzung.

Authentifizierte APIs verlangen einen ausdrücklichen Workspace-Header, eine einmalig
aufgelöste Sitzungsidentität sowie CSRF-/Origin-Prüfungen für Änderungen:

| Endpunkt | Wirkung |
| --- | --- |
| `GET /api/v1/retirements` | Rollenbezogener Status; Application Owner sehen nur ihre betroffenen Applications |
| `GET /api/v1/retirements/candidates` | Verifizierter Platform Owner wählt eine angewendete State-Bindung |
| `POST /api/v1/retirements` | Absicht, Grund und optionalen Zeitpunkt `notBefore` bestätigen; Nachricht und Sperre gemeinsam speichern |
| `POST /api/v1/retirements/:id` | Generationsgebundenes `inspect`, `pause`, `resume` oder `cancel` vor destruktivem Beginn |

Der Ausführungsverlauf enthält die Platform-Owner-Bedienung. Application-Ansichten
zeigen Betroffenen die aktuelle Nachricht ohne Rückbaubedienung. Templates liefern
das abgeleitete Merkmal `platformRetiring`. Normale Bestellungen und alte Apply-Pläne
bleiben auch bei veraltetem Browser serverseitig gesperrt. Entwurfsbearbeitung ist
keine Ausführungsberechtigung.

## Verbleibende Ausführungsanbindung

Die Grundlage erreicht derzeit Vorbereitung/Abgleich. Sie bietet **noch keinen**
administrativen Application-Destroy über Besteller hinweg, erfasste Cloud-Inventare
und Prüfung überlebender Steuerungsressourcen, phasengebundene native Plan-/Apply-
Dispatches, Purge-Beobachtung, späteren Ordnerabschluss, Abschlussnachrichten oder
Batch-Bereinigung. Der vorhandene bestellergebundene Application-Destroy wird nicht
imitiert oder pauschal erweitert. Diese Teile müssen handelnden Owner und Besteller,
ursprünglichen State, Quellen-/Provider-Bindung, verschlüsselte Artefakte, geprüften
Umfang und aktuelle Autorisierung erhalten. Datenbank-Phasenänderungen oder hochgeladene
State-Dateien sind keine Abschlussnachweise.

Der unabhängige [native OpenTofu-Adapter](../../src/retirement/README.de.md) bietet den
operatorgestützten Weg für sein qualifiziertes Provider-Profil ohne Import in den
Configurator. Diese API nutzt ihn nicht stillschweigend vor der Runner-Anbindung.
Historische Workloads mit privaten Providern brauchen ihre ursprünglich erreichbaren
Control Planes. Ordnerlöschung hängt weiterhin vom tatsächlichen STACKIT-Purge ab;
kein Timer garantiert Erfolg.

## Qualifikation

Unit-/HTTP-Tests prüfen Sitzung, Workspace, CSRF und Fehlergrenzen. PostgreSQL-
Integration prüft Rückbauabsicht, sieben Tage Standardfrist, Umfangstrennung, Zulassung,
alte Plattform-Tickets, Pause-Generationen, geteilte Zuständigkeit und Nachrichten
nach Archivierung. Desktop-/Mobil-Browsertests prüfen Englisch, ausdrückliche
Bestätigung und Pause. Native Tests verwenden den echten festgelegten Provider gegen
eine isolierte Loopback-API: Projektlöschung im selben State, erhaltene Ordner,
Abweisung falschen Verschwindens bei HTTP 403, HTTP-409-Fehler und später erfolgreichen
Ordnerabschluss. Diese Prüfungen nutzen keine Cloud-Zugangsdaten oder realen Ressourcen.

Der Dev-Pilot muss eine neu angelegte, eindeutig benannte Wegwerf-Landing-Zone nutzen
und vorhandene Demo-Deployments erhalten. Lokale Prüfungen allein erlauben weder
Produktionsrelease noch die Aussage einer vollständigen Live-Qualifikation.
