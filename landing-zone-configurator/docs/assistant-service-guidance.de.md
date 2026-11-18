# Service-Beratung durch den Assistant

[English](assistant-service-guidance.md) | [Deutsch](assistant-service-guidance.de.md)

Der Assistant verbindet geprüftes Service-Wissen mit den Projektkatalogen des
aktuellen Benutzers. Katalogzugriff allein ist keine Größenempfehlung:
Flavor-Namen belegen weder Kapazität, Preis, Berechtigung noch Eignung.

Für alle Themen gilt dieselbe Beratung: Ziel und nur die relevanten offenen
Anforderungen klären, beantwortete Entscheidungen behalten, geprüfte Abwägungen
erklären und konkrete Antworten anbieten. Der Wunsch nach einem sinnvollen
Einstieg kann eine dokumentierte Empfehlung delegieren; unbekannte Netze,
Zugangsdaten oder Berechtigungen ersetzt er nicht. Fehlt die Grundlage einer
Empfehlung, folgt eine verständliche fachliche Rückfrage statt der Aufforderung,
interne Kennungen selbst zu recherchieren. Services ohne Flavor verwenden
passende Entscheidungen, etwa Aufbewahrung, Verfügbarkeit oder Zugriff.


Dokumentierte Grenzen gehen einer Startempfehlung vor. Git erlaubt je nach
geprüftem Tarif höchstens 10/100 Nutzer pro Instanz; automatisches Speicherwachstum
erhöht diese Grenzen nicht. Bei mehr als 100 Nutzern folgt vor der Flavor-Auswahl
eine Architekturfrage zu getrennten Team-/Projektinstanzen oder einem kleineren
anfänglichen Umfang. Getrennte Instanzen bedeuten keine Föderation, automatische
Lastverteilung oder garantierte Gesamtkapazität. Der zentrale `devops`-Input
konfiguriert eine Instanz; weitere Instanzen benötigen separat geprüfte Konfiguration.

## Gemeinsame Katalogauswahl

`packages/contracts/src/cloud-catalogue-fields.ts` ordnet die Felder ihren
Katalogen zu. Editor, Assistant und generiertes Szenarioinventar verwenden diese
gemeinsame Zuordnung. Für neue Services keine separate Zuordnung oder eigene
Dropdown-Implementierung einführen.

| Konfigurationsbereich | Kataloggestützte Entscheidungen |
| --- | --- |
| Zentrales Git | Git-Tarif |
| VPN | VPN-Tarif |
| Kubernetes | Version, Knotengröße, Betriebssystem, Zonen und Speichertyp |
| Observability | Tarif und gelieferte Fähigkeiten zur Aufbewahrung |
| Debug-Bastion | VM-Größe, Image und Zone |
| Firewall-Infrastruktur | VM-Größe, primäre Zone und HA-Ausweichzone |
| Native Projektzugriffe | Projektrollen und Berechtigungsnamen; bestehende IAM-Prüfungen gelten weiter |
| Audit, Ordner, DNS, Netzaufbau und Lebenszyklus | Gemeinsame Beratungsregeln; kein erfundener Flavor, wo keiner existiert |

Das Szenarioinventar hält die Katalogzuordnung jedes nativen Feldes fest. Ein
neuer Katalogadapter braucht einen Eintrag in dieser Zuordnung, belegtes
Service-Wissen und einen Regressionstest des gemeinsamen Selektors. Produkte
ohne Katalogadapter werden nicht stillschweigend mit Flavors anderer Produkte
abgedeckt.

Rückfragen unterscheiden fachliche Anforderungen ausdrücklich von der
Katalogauswahl. Eine Frage zu Last oder Wiederherstellung bleibt eine fachliche
Frage, auch wenn ihre Antwort die Flavor-Wahl beeinflusst. Nur die konkrete
Produktauswahl erhält einen Katalogselektor.

Der Server ergänzt die Auswahldaten nach der Prüfung des Modelldialogs. Er nutzt
reale Werte und Bezeichnungen aus dem Zielprojekt und der Zielregion samt
Abrufzeitpunkt, Status und Hinweis auf unvollständige Ausschnitte. Die Oberfläche
bietet die Vorauswahl aus dem Gespräch, Suche in den geladenen Optionen,
Erweiterung auf den geladenen Katalog und Details zur ausgewählten Option. Kein
Wert wird automatisch gewählt. Fachliche Antwortoptionen und eigener Freitext
bleiben möglich. Eine gesendete Auswahl ist eine Chat-Antwort, keine übernommene
Konfigurationsänderung oder Ausführungsfreigabe.

Bei offenen Katalogentscheidungen erzeugt eine gemeinsame Darstellung die
Rückfrage und Erläuterung aus bekannten Optionen, statt ungeprüfte Modellprosa
anzuzeigen. So erscheinen an diesen Auswahlfragen keine erfundenen CPU-, RAM-
oder Durchsatzangaben. Liegen Projektkatalogdaten vor, wird vorläufiger Chat-Text
bis zu dieser Prüfung zurückgehalten. Bestehende Vorschläge und andere Beratung
behalten ihre eigenen Quellen- und Validierungsverträge; dies ist keine
universelle Faktenprüfung beliebiger Prosa.

## Belege und Grenzen

Öffentliche PIM-Merkmale dürfen eine angebotene Option nur bei passendem Produkt,
passender Region und passender Flavor-/Tarifreferenz beschreiben. Abgekündigte
Einträge, widersprüchliche Merkmale und unbekannte RAM-Einheiten werden nicht
zu Kapazitätsangaben. Öffentliche PIM-Artikel bestätigen keine Bestellbarkeit:
Die auswählbare Option stammt weiterhin aus dem Projektkatalog. Geprüfte
Git-Tarifbeschreibungen sind von der aktuellen Verfügbarkeit getrennt.

Die Katalogabfragen berücksichtigen die Plattform-Standardregion und konfigurierte
Service-Regionen. Ein nicht verfügbarer Katalog unterscheidet sich von einer verfügbaren leeren
Liste. Begrenzte Ausschnitte werden gekennzeichnet und belegen nicht, dass ein
fehlendes Angebot nicht verfügbar ist. Das Modell erhält einen begrenzten
Ausschnitt; die Auswahldarstellung hat eigene Mengen- und Bytegrenzen und behält
die Hinweise auf Unvollständigkeit. Bei regional mehrdeutigen Wildcard-Fragen
muss die Zielregion geklärt werden. Eine Auswahl eines öffentlichen Tarifs
benötigt keine Frage nach privaten Projekt-UUIDs oder Zugangsdaten.

Darstellungsdaten werden für erneutes Öffnen mit dem berechtigten Gespräch
gespeichert. Vor der Prüfung eines gespeicherten Vorschlags zur Übernahme werden
sie entfernt; daraus können keine Konfigurationsänderung oder Zustimmung
entstehen. Revision, Mandant, Identität, Veröffentlichung und Plan/Apply bleiben
separate Prüfungen. Eine spätere Konfigurationsänderung kann Ressourcen ersetzen;
das Service-Wissen muss das tatsächliche Verhalten des gepinnten Providers
beschreiben und darf keine beliebige Änderung im laufenden Betrieb versprechen.

## Pflege und Prüfung

Service-Fakten gehören ins geprüfte Wissen, Feldzuordnungen in die gemeinsame
Zuordnung und Darstellung in die gemeinsame Rückfragenkomponente. Die englische
UI-Sprache wird ausdrücklich übergeben; englische technische Übersichten nutzen
die gepflegten englischen Service-Texte statt deutscher Ersatztexte. Alte
Kundennachrichten und Ressourcennamen werden nicht übersetzt. Ältere Anfragen ohne
UI-Sprache verwenden die letzte natürlichsprachliche Nutzerantwort, auch bei
kurzen Folgeantworten. Firewall- und SNA-Rückfragen folgen demselben Sprachvertrag.

Bei einem bestätigten Entwurfswunsch wird eine leere Modellantwort ohne Änderungen
und Rückfragen einmal mit gleichem Kontext und Schema zur Konkretisierung
aufgefordert: tatsächlicher typisierter Entwurf oder wirklich fehlende Rückfrage.
Bei Firewall-Einrichtung bleibt der ausdrückliche Wunsch nach reiner
Anforderungsklärung ohne Änderungsvorschlag erhalten. Beratung und Entwurf nutzen
dieselben zweisprachigen fachlichen Antwortoptionen.
Alle Quellen-, Umfangs- und Übernahmeprüfungen gelten weiter; daraus entsteht keine
Ausführungsberechtigung.

`npm run assistant:generate` ausführen, generierte Ausgabe formatieren und
`npm run check` ausführen. Die Tests prüfen jede zugeordnete Service-Familie,
Quellen-/Regionsabgleich, Widersprüche, fehlende/leere/begrenzte Kataloge,
Bytegrenzen und die Ablehnung vom Modell erfundener Auswahldaten.
Desktop-/Mobiltests prüfen Filter, Beschreibungen, kombinierte Auswahlen und
Senden ohne Speichern. Echte PostgreSQL-Tests prüfen erneutes Öffnen,
Mandantentrennung und Vorschlagsübernahme mit Darstellungsdaten.

Live-Modellfälle für Kubernetes, VPN und Observability verlangen tatsächliche
offene Katalogfelder und keine Änderungen vor der Auswahl. Ihre synthetischen
Kataloge enthalten keine Leistungszahlen; erfundene Hardware-Angaben führen daher
zum Fehler. Wie bei anderen gemeinsamen Assistant-Vertragsänderungen die gesamte
Suite unabhängig wiederholen und den zusammenhängenden Dialog prüfen, bevor ein
Qualifikationsnachweis gemeldet wird. Fehlerhafte Nachweise bleiben erhalten;
Feldinventar oder übersprungene Qualifikation belegen keine Dialogqualität.
