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

Der [gemeinsame Beratungsablauf](assistant-consultation.de.md) behält durch
Benutzerzitate belegte Anforderungen und vergleicht sie mit tatsächlichen
Angeboten und geprüften Grenzen. Beispielsweise schließen etwa 80 Git-Entwickler
Git10 aus und sprechen für Git100, sofern dieser Tarif angeboten wird. Die
Empfehlung bleibt während der Zugriffsklärung sichtbar. Eine ausdrückliche Änderung
des Umfangs kann die Anforderung ersetzen. Das prüft eine Nutzergrenze, keine
Workload-Leistung; unbekannte Eigenschaften bleiben unbekannt.

Der Wunsch nach dem Accelerator-Default löst das offene Feld auf seinen echten
nativen Wert auf, einschließlich null/Weglassen. Für Git-Netzwerkzugriff ist dies
`0.0.0.0/0`; die öffentliche Erreichbarkeit wird erklärt. Der Assistant verlangt
weder erneut den wörtlichen CIDR noch eine weitere Bestätigung. Unbekannte
Firmen-/VPN-Egress-Netze werden nicht aus privaten SNA-Netzen oder der Topologie
anderer Services abgeleitet. Eine unbeantwortete Frage allein erlaubt keinen
öffentlichen Service.

Der Assistant darf tatsächliche dokumentierte Accelerator-Defaults als erkennbare
Annahmen für nicht festgelegte Felder vorschlagen. Der Vorschlag zeigt diese Werte
zur Prüfung; sie sind keine Benutzerentscheidungen. Ausdrückliche
Zugriffsbeschränkungen und offenzuhaltende Entscheidungen haben Vorrang.
Übernahme, Speichern und Plan/Apply bleiben getrennte Schritte.

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

## Nachweise und Grenzen

Öffentliche PIM-Fakten beschreiben ein Angebot nur bei passendem Produkt, Region
und Tarifverweis. Veraltete Einträge, widersprüchliche Fakten oder unbekannte
RAM-Einheiten werden nicht als Kapazitätszusagen angezeigt. Bestellbare Angebote
stammen weiterhin aus dem Projektkatalog. Git-Nutzergrenzen werden separat geprüft.

Nicht verfügbare und verfügbare leere Kataloge sind verschiedene Zustände.
Gekürzte Listen behalten ihre Kennzeichnung und beweisen keine Nichtverfügbarkeit.
Mehrdeutige Regionen benötigen eine Rückfrage statt fremder Angebote. Auswahlfelder
zeigen geprüfte Werte und Beschreibungen; Empfehlungskarten zeigen belegten Bedarf
und Tarifmerkmale. Das Modell behält seine kontextbezogene Erklärung. Erst die
abschließend validierte Antwort wird gestreamt.

Darstellungsmetadaten bleiben beim Neuladen erhalten, werden aber keine
Konfigurationsänderung oder Zustimmung. Revision, Mandant, Identität,
Veröffentlichung und Plan/Apply bleiben separat geprüft. Spätere Änderungen können
laut fest gepinntem Provider einen Ressourcenaustausch erfordern.

## Pflege und Prüfung

Servicefakten bleiben im geprüften Wissen, Feldzuordnungen im gemeinsamen Register
und die Darstellung in gemeinsamen Komponenten. Die vom Browser gewählte Sprache
steuert die Antwort. Historische Kundentexte und Ressourcennamen werden nicht
übersetzt. Aufrufe ohne Sprachangabe verwenden die bisherige Spracherkennung.

Der gemeinsame Werkzeugvertrag erlaubt lesende Wissens-, Konfigurations-, Default-
und Katalogabfragen sowie lokale Vorschlagsvalidierung. Validierungsrückmeldungen
gehen vor der finalen Antwort an das Modell zurück. Kein Werkzeug speichert,
führt Cloud-Änderungen aus oder erteilt Rechte. Der Gesprächskontext bleibt privat
in der bestehenden benutzergebundenen Unterhaltung und fehlt in Browserantworten.

`npm run assistant:generate`, Formatierung des generierten TypeScripts und
`npm run check` prüfen die lokalen Verträge. Das Szenario-JSON behält die exakte
Generatorausgabe. Datenbanktests prüfen privaten Kontext, Neuladen, Mandantentrennung,
Verwerfen und Felderhalt. Desktop-/Mobiltests prüfen Empfehlungen, Auswahl und
vollständige Vorschläge. Änderungen am gemeinsamen Laufzeitpfad benötigen die
vollständige wiederholte Modelltestsuite und den durchgehenden themenübergreifenden
Dialog. Fehlgeschlagene Nachweise bleiben erhalten; historische Controller-Tests
und Feldinventar qualifizieren den neuen Pfad nicht.
