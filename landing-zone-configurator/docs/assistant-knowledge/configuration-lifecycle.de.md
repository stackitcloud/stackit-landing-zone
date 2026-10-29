# Konfiguration, Gespräch und Ausführungslebenszyklus

[English](configuration-lifecycle.md) | [Deutsch](configuration-lifecycle.de.md)

## Zweck

Arbeitsbereich und Konfiguration autorisieren; Annahme und Ausführung trennen.

## Accelerator-Vertrag

Nur native tfvars, kein freies Terraform/YAML. Standards, Wissen und Kataloge
aktivieren nichts. Patches betreffen Firmenname/-kürzel/Region, bestehende Ordner
und native SNA. Namensdelegation erlaubt Namen, keine IDs, Region, Zugriffe,
Owner oder Rollen. Struktur und Metadaten erhalten. Speichern, Veröffentlichen,
Bestellen, Plan, Apply, Destroy und Recovery sind getrennte Schritte. Apply umfasst
Grundlagen und aktivierte Eingaben.

Bestellungen binden IaC, Lockdatei und Werkzeuge; der aktuelle Worker prüft die
paketierten Quellen. Unter Updates stehen Ausführung, Template und Plattform
getrennt. Ursprung ist die Template-Git-Revision; gewünscht ist die Accelerator-
Revision, kein bearbeitbarer Plattformentwurf. Zuletzt angewendet ist die Quelle
des letzten erfolgreichen Apply, kein aktueller State-Nachweis und keine
Recovery-Quelle. Ein Quellenupgrade erhält Bestellung, Projekt, State, Backend
und Richtlinie und startet nichts. Danach neuer Plan, Änderungen/Ersetzungen/
Löschungen prüfen und Apply separat ausdrücklich freigeben.

Ein Fehler erhält die gewünschte Bindung, kann Ressourcen und State aber bereits
verändert haben. Recovery verwendet den Snapshot und die Quelle des unterbrochenen
Jobs; Plan vergleicht den tatsächlichen State, nicht den letzten erfolgreichen
Apply. Unveränderten State oder Verlustfreiheit nach Fehlern niemals versprechen;
vorhandene Infrastruktur nicht neu bestellen. Zurückgezogene Quellen sperren neue
Ausführungen, ungeklärte Recovery sperrt Upgrades. Bei zurückgezogener Quelle muss
der Operator ein geprüftes Recovery-Paket bereitstellen. Kein manuelles Umgehen,
erfundene Hashes oder Ausführen beliebiger Git-Stände.

Für Template-Upgrades veröffentlicht der Platform Owner einen Vorwärtspfad
innerhalb derselben Template-Familie. Bestellung, Projekt, State, Backend und
bisherige Antworten bleiben erhalten; neue Pflichtantworten erfragen. Gewünschten
Snapshot bestätigen, dann neuer tatsächlicher Plan und separater Apply.
Standard-Upgrades blockieren Löschungen, Ersetzungen und unbekannte Nachweise;
keine Checkbox kann das umgehen. Sensible Änderungen an IAM, Schlüsseln, Netz,
Diensten und Verfügbarkeit folgen der veröffentlichten Richtlinie. Die strengere
Richtlinie beider Versionen gilt. Nur beidseitig direkte Freigabe plus ausdrücklich
erlaubter sensibler Self-Service erlaubt den Bestellerpfad; sonst bindet die
Freigabe Plan, Artefakt-Hash und Kandidaten-Hash.

Ein Plattform-Apply verändert gemeinsame Firewall und Routen für alle abhängigen
Applications. Es gibt keine private alte Firewall je Application. Die
Abhängigkeitsprüfung sperrt destruktive und unbekannte gemeinsame Änderungen;
sensible Bestätigungen binden Plan, State und Abhängigkeiten. Danach einen Pfad
zwischen tatsächlich freigegebenen Plattformverträgen veröffentlichen; die
Template-Version kann gleich bleiben. Organisations-, Platzierungs-, SNA- oder
Backend-Migrationen benötigen ein separates Verfahren. Chat kann weder Pfade
veröffentlichen noch Bindungen ändern, entsperren oder ausführen.

## Abhängigkeiten

Bereitschaft ist keine Ausführung und keine Autorisierung.

## Dialog

Bestätigte Anforderungen, Verlauf und unbenannte Folgefragen verwenden;
ausdrückliche Themenwechsel beachten. Annahmen und bestehende Widersprüche zeigen.
„Später“ aktiviert nichts. Fachliche, abgeleitete und geschützte Operator-
Entscheidungen trennen; eine fehlende Firewall-Entscheidung erfragen.
Antwortoptionen sind keine Zustimmung oder Patches. Mehrfachauswahl erlaubt
vereinbare Antworten, Freitext bleibt möglich. Teilmengen benötigen neue geprüfte
Vorschläge. Nur nach ausdrücklicher Gesamtannahme speichern. Neue Konfigurationen
übernehmen Beratung ausschließlich über revisionsgebundenen Serverkontext;
bestehende nicht nachträglich verändern. Gruppen und Parameter begrenzen Versionen
und Auswahlmöglichkeiten; Chat erteilt keine Berechtigungen.

## Beispiele

„SNA zuerst, Firewall später“: nur SNA; bestehende Firewall-Einstellungen offenlegen.
Kein selektiver Apply; eigenständige tfvars benötigen externe Zugangsdaten und Backend.

## Grenzen

Autorisierung, Ausgangsstand und Kandidat bei Annahme und nach Inferenz oder erneuter
Anmeldung prüfen. Unbekannte Importfelder nicht ins Modell geben. Chats verfallen
drei Kalendermonate nach Erstellung, nicht nach letzter Aktivität. Löschen und späte
Inferenz stellen abgeleiteten Kontext nicht wieder her. Aktuelles Wissen generieren,
keine Fristverlängerung. Fünf Sitzungen sind ein Lastziel, keine Quote. Schema- und
Modellfehler erhalten Entwürfe. Kein automatisches Git, Veröffentlichen, Bestellen,
Entsperren oder Lesen roher States und Pläne.

## Zugangsdaten

Sitzungen verleihen keine Rechte. Keine Tokens, Schlüssel, rohen Fehler oder
geschützten Daten im Modell.

## Quellen

Das Manifest bindet Quellen. Release, Promotion und Plan sowie Aufbewahrung,
Wiederherstellung, Last, Sprachgleichheit und A01–A24 getrennt nachweisen.
