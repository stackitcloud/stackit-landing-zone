# Modellgeführte Assistant-Beratung

[English](assistant-consultation.md) | [Deutsch](assistant-consultation.de.md)

Der Editor-Chat verwendet einen gemeinsamen Beratungsablauf für alle ausgewählten
Accelerator-Themen. Das Modell interpretiert Ziel, Plattformkontext und Folgeantworten;
die Anwendung liefert verlässliche Fakten und validiert lokale Änderungsvorschläge.
Ein Produkt benötigt keinen eigenen Gesprächszustandsautomaten mehr.

Die anfängliche Template-Beratung bleibt lesend. Sie erhält die registrierten
Topologiefakten und relevante Netzwerk-/Projektregeln mit verpflichtenden
Abhängigkeiten. Unbeteiligte Feldschemata und Produktverträge werden ausgelassen.
Quellenreferenzen dürfen nur tatsächlich mitgelieferte Regeln nennen.

Standardmodell ist `Qwen/Qwen3.8-27B` am vorhandenen STACKIT-Endpunkt in EU01;
Betreiber können es überschreiben. Laut [STACKIT-Modellkatalog](https://docs.stackit.cloud/products/data-and-ai/ai-model-serving/basics/available-shared-models/)
unterstützt es Reasoning und native Werkzeuge. Modellvergleiche und
Qualifikationsnachweise müssen die genaue Auswahl festhalten. Ein erfolgreicher
Vergleich qualifiziert weder ein anderes Modell noch einen älteren Quellstand.

Qwen3.8 verwendet die veröffentlichten Reasoning-Samplingwerte (`temperature=1.0`,
`top_p=0.95`) über Standard-API-Parameter. Andere Modelle behalten ihre bisherigen
Einstellungen. Dies belegt noch keine Antwortqualität; die vollständige
quellgebundene Qualifikation bleibt erforderlich. Siehe die
[offizielle Modellkarte](https://huggingface.co/Qwen/Qwen3.8-27B#api-usage).

Begrenzte Providerfelder `reasoning`/`reasoning_content` bleiben für diese Antwort
im privaten nativen Werkzeugdialog erhalten. Sie sind weder sichtbare Erklärungen
noch Befugnisse oder bestätigte Entscheidungen und gelangen nicht in gespeicherte
Chats, Gesprächsstand, öffentliche Antworten oder Qualifikationsprotokolle.
Ein isolierter EU01-Kompatibilitätstest bestätigt, dass der Endpunkt sein eigenes
Reasoning-Feld beim folgenden Werkzeugergebnis akzeptiert. Das qualifiziert noch
keine Antwortqualität.

Qwen3.8-Aufrufe erlauben 16.384 Completion-Tokens für Reasoning und finale Ausgabe;
andere Modelle behalten den bisherigen Standard von 4.096 Tokens. Betreiber können
`LZC_MODEL_SERVING_MAX_COMPLETION_TOKENS` für eine separat qualifizierte Auswahl auf
1.024 bis 16.384 setzen. Der sichtbare Antworttext bleibt auf 16.384 Zeichen begrenzt.
Eine abgeschnittene Completion zählt als Fehler und wird nicht still wiederholt.
Qwen3.8-Aufrufe haben standardmäßig 120 Sekunden Zeit innerhalb der vorhandenen
konfigurierbaren Grenzen, andere Modelle weiterhin 60 Sekunden. Die gesamte
Beratung bleibt einschließlich Leseaufrufen und Prüfungen auf drei Minuten begrenzt.

Die [englische Architekturübersicht](assistant-consultation.md) zeigt den Ablauf:
Nutzer und gespeicherter Gesprächsstand → Beratung und lesende Werkzeuge →
Vorschlagsvalidierung mit Rückmeldung → Antwort und Empfehlungen → ausdrückliche
Entwurfsübernahme → separates Speichern, Plan und Apply.

Zu Beginn werden Pflichtregeln und der aktive Gesprächsstand übergeben. Das Modell
liest Servicewissen und Abhängigkeiten über native OpenAI-Funktionsaufrufe. Der
erste Aufruf wählt `read_knowledge` ausdrücklich per `tool_choice`; allgemeines
Modellvorwissen ersetzt den ersten Quellenabruf nicht. Danach wählt das Modell automatisch.
Das Wissenswerkzeug bewertet die aktuelle Frage und eine optionale englische
Suchanfrage per BM25 gegen den ausgewählten kuratierten Bestand. Relevante Treffer
ergänzen gewählte Themen-IDs, damit ein benachbartes Thema nicht die benötigten
Servicefakten ausblendet. Kurze allgemeine Folgeantworten erzeugen keinen fremden
Themenwechsel. Aktiver Gesprächsstand und explizite Themenwahl bleiben verfügbar;
externe Dokumente und Kundendaten werden nicht durchsucht.
Unabhängige Abfragen können gebündelt werden. Bereits gelieferte Regeln werden
referenziert. Themen und bearbeitbare Wurzeln sind ohne separaten Intent-Klassifizierer
auffindbar. Native Schemas werden gezielt mit den Konfigurationswerten gelesen,
statt tausende unbeteiligte Feldpfade in jede Werkzeugdefinition einzubetten.

Unveränderliche Dienstverträge und Wurzelschemata werden je Beratung einmal
geliefert. Folgeabfragen enthalten Quellenverweise und die angefragten Werte.
Die Bereitschaftsübersicht trennt tatsächliche Template-Lesepfade von berechneten
Metadaten, die keine zusätzlichen Konfigurationsfelder darstellen.

## Werkzeuge und Validierung

Das Modell kann Wissen, Konfiguration, Defaults und Kataloge gemeinsam nachschlagen.
Es liest ausschließlich bereits eingegrenzte öffentliche Konfiguration und
Katalogstände. Andere Mandanten, beliebige URLs, Zugangsdaten, Live-State und Pläne
sind nicht zugänglich. Servicewissen enthält Abhängigkeiten und verbindliche Grenzen.
Native Schemas und Defaults stammen aus dem generierten Accelerator-Eingabevertrag.

Katalogabfragen können Anforderungen mit Nutzerbeleg enthalten. Eine gemeinsame
Auswertung vergleicht sie mit geprüften numerischen Grenzen und passenden
Katalogmerkmalen. Passende, ausgeschlossene und unbekannte Angebote bleiben
unterscheidbar. Git-Nutzergrenzen und gelieferte VM-/VPN-Merkmale verwenden dieselbe
Auswertung; unbekannte Kapazitäten oder ungeprüfte RAM-Einheiten begründen keine
Leistungszusage.

Ein eindeutig passendes Angebot erscheint als belegte Empfehlung mit Bedarf und
Tarifmerkmalen. Sie bleibt sichtbar, während eine andere Entscheidung offen ist. Neue Werte, die
im vollständigen verfügbaren Projekt-/Regionskatalog fehlen, werden vor Erteilung
eines Vorschlag-Handles abgelehnt. Vorhandene Werte bleiben erhaltbar; fehlende oder
gekürzte Katalogdaten belegen keine Nichtverfügbarkeit.
Die erläuternde Antwort stammt vom Modell und wird nicht durch einen allgemeinen
Katalogtext ersetzt. Empfehlungskarten erteilen weder Übernahme- noch Ausführungsrechte.

Änderungsvorschläge werden vor der endgültigen Antwort validiert; Fehler gehen zur
Korrektur an das Modell zurück. Es gibt keine Werkzeuge zum Speichern, Berechtigen,
Provisionieren, Veröffentlichen, Freigeben oder Ausführen. Werkzeugargumente, native
Pfade, geschützte Felder, Wertequellen und Vorschlagsformen werden im Backend geprüft.
Der bestehende Compiler prüft den Kandidaten während der Beratung und erneut vor dem
Speichern des Vorschlags. Rechte, Eigentümer, Revision und Ablauf bleiben bei der
Übernahme maßgeblich.

Geprüfte Workflow-Pakete enthalten betriebliche Abhängigkeiten und die typisierte
Quellenauswahl. Eine fachliche Anfrage verwendet dieses Paket, statt aus einzelnen
Verben eine unvollständige Liste zu rekonstruieren. Ausdrücklich exakte Listen von
Berechtigungskennungen bleiben exakt. Regressionen prüfen beide Fälle.

Neun native Funktionen bilden die gemeinsamen Beratungsoperationen ab. Zwei
Template-Werkzeuge unterscheiden zusätzliche Berechtigungen von einem vollständigen
Zugriffsprofil und verwenden dieselbe Vorschlagsvalidierung. Explizite eigene
Berechtigungslisten ersetzen die bisherigen Listen exakt. Volle Owner-Rechte
verwenden das registrierte atomare Profil. Die anfängliche Template-Übersicht
kennzeichnet vorhandene Profile und ältere Eingabefelder.

Interaktive Entscheidungen verwenden `ask_question` mit jeweils einem flachen
Pfad-/Text-/Auswahlargument. Fragen können mit `finish=false` intern gesammelt werden, während weitere
Leseaufrufe oder Rückfragen folgen. `finish=true` oder die abschließende Erklärung
führt sie vor der normalen Validierung und Prüfung zusammen. Eine Teilantwort
wird dabei nicht angezeigt; Rechte sowie Fragen- und Laufzeitgrenzen bleiben gleich.
Mehrere unabhängige Fragen können als mehrere Aufrufe
in einer Antwort zurückkommen. Der Adapter bildet daraus die bestehende öffentliche
Fragenliste und behält den validierten Vorschlag. `send_answer` kann bereits
gesammelte Fragen ohne zusätzliche Platzhalterfrage abschließen. Registrierte
Initial-Owner-Felder erhalten Auswahloptionen aus den verifizierten Anwendungsdaten
sowie eine manuelle E-Mail-Option. Modellbeschriftungen belegen oder wählen keine
Identität. Fehlende Referenzmetadaten werden ausschließlich aus bereits gelieferten
Quellen ergänzt; explizite fremde Referenzen werden weiterhin geprüft.
Damit entfallen verschachtelte Fragenlisten, die das Kandidatenmodell
wiederholt als fehlerhafte JSON-Strings lieferte. Nur gültige JSON-Container an
ausdrücklich entsprechend typisierten Feldern werden zur Transportkompatibilität
dekodiert. Fehlerhaftes JSON und freie/literale Werte werden nicht repariert oder
umgedeutet. Grenzen und sämtliche Vorschlagsprüfungen gelten unverändert.

Zur Kompatibilität werden Antworten, die ausschließlich aus gültigen markierten
`tool_call`-Blöcken bestehen, in native Aufrufe normalisiert. Gemischter Text,
fehlerhafte Blöcke und unbekannte Funktionen werden weder ausgeführt noch als
Beratung veröffentlicht. Quellenreferenzen priorisieren ausgewählte Themen und
bleiben begrenzt. Die Antwortprüfung erhält relevante Fakten und die tatsächlichen
Compiler-Änderungen, einschließlich angeforderter Namen, Schlüssel und exakter
Listen, ohne wiederholte Erkennungsschemata.

Die Antwortprüfung erfasst zuerst Nutzeranforderungen mit Soll, Ist und Verweis auf
den nummerierten Nutzerturn, bevor sie die Antwort bewertet. Nicht erfüllte Anforderungen
oder ungültige Nutzerturn-Verweise verhindern eine Freigabe. Wird ein registriertes Profil in der Antwort
beschrieben, muss seine dokumentierte kritische Grenze abgedeckt sein; sie kann
dann nicht als unzutreffend markiert werden. Diese Prüfungen verbessern die
Qualifikation, garantieren aber keine fehlerfreie semantische Bewertung.

Der Transport verwendet native `tool_calls` der Assistant-Rolle und zugehörige
`tool`-Ergebnisse mit Aufruf-ID. Ergebnisse werden nicht als neue Nutzernachrichten
nachgebildet. Erklärungen dürfen normaler Text sein; strukturierte Rückfragen nutzen
das Antwortwerkzeug. Eine Textantwort kann ausschließlich den zuletzt erfolgreich
validierten lokalen Vorschlag enthalten; ein abgelehnter Ersatz löscht dessen Handle.
Weder Text noch Funktionsnamen führen Cloud-Änderungen aus. Die Schlussprüfung bleibt
für beide Antwortformen verpflichtend.

Leere Fragen-, Referenz- und Vorschlagsfelder dürfen entfallen; dies aktiviert keine
Komponente und gewährt keinen Zugriff. Generierte Antworten verwenden dasselbe begrenzte Budget von 16.384 Zeichen wie der native Transport.
Der Entwurfshinweis schneidet keine Erklärung oder wichtige Grenze still ab.
Ein Turn bleibt auf zwölf Beratungsschritte, drei Schlussprüfungen und drei Minuten
begrenzt. Konfigurierte Einzelaufruf-Limits gelten weiterhin. HTTP-Fehler verursachen
weder einen versteckten Controller-Wechsel noch unbegrenzte Wiederholungen.

Die vollständige wiederholte CI-Qualifikation läuft wegen der gemeinsamen
Projektquote seriell und hat ein Job-Limit von sechs Stunden. Einzelaufrufe und
Turns erhalten dadurch keine längeren Fristen; fehlgeschlagene Wiederholungen
werden nicht erneut versucht und die Release-Kriterien bleiben gleich.

Große registrierte Preset- und benannte Katalog-Berechtigungsergänzungen werden
nur verdichtet, wenn der tatsächliche Compiler-Kandidat exakt dem nativen bzw.
serverseitig materialisierten Ergebnis entspricht. Das Modell erhält die belegte
Auswahl, Templates und Prinzipale sowie ergänzte/entfernte Produktanzahlen und
einen Effekt-Hash statt Hunderter wiederholter Kennungen. Kleine Listen bleiben
explizit. Eigene wörtliche Listen, unbekannte Operationen
und abweichende Compiler-Ergebnisse bleiben vollständig sichtbar. Andere geänderte
Felder und entfernte Produktgruppen werden nicht verborgen. Nutzerabsicht und
kritische Grenzen bleiben zu prüfen; der Beleg gewährt keine Rechte. Die prüfbare
öffentliche Vorschlagsdarstellung und Entwurfsübernahme behalten alle nativen Änderungen.
Geordnete registrierte Preset-, Owner- und Katalogoperationen behalten ihre
Reihenfolge. Ihr vollständig materialisiertes Profil wird mit dem Compiler-
Kandidaten verglichen. Entfernte alte Rollenfelder und geänderte Owner bleiben
explizit sichtbar; spätere Operationen werden nicht nur gegen ein Zwischenprofil geprüft.

Eine gemeinsame inhaltliche Schlussprüfung vergleicht Auftrag, Folgeantworten,
geprüfte Fakten und den tatsächlichen Compiler-Diff vor Anzeige und Speicherung.
Der Diff trennt ergänzte/entzogene Rechte nach Prinzipal und Produktgruppe.
Unveränderte Identitäten und IAM-Metadaten fehlen dort. Befunde gehen zur Korrektur
in denselben Dialog zurück. Das ist eine interne Qualitätsprüfung, keine weitere
Benutzerfreigabe und keine Garantie fehlerfreier Antworten. HTTP-Fehler werden auch
in dieser Schleife nicht wiederholt. Übernahme und Ausführung bleiben separat.

Typisierte `union`-, `add_permissions`- und registrierte `preset`-Operationen erzeugen vollständige
native Werte lokal. Das Modell wählt geprüfte Operationen statt Hunderte
Berechtigungskennungen auszuschreiben. Zugriffsprofile bleiben atomar:
Ergänzungen benennen Templates und Prinzipale ausdrücklich und erhalten initialen
Owner, den anderen Prinzipal und bestehende Rechte. Jede Operation wählt genau eine
Quelle: Servicegruppen, einen registrierten Rechtesatz oder genaue Kennungen.
Unbenutzte optionale Parameter aktivieren keinen zusätzlichen Rechtesatz.
Offizielle Servicegruppen kommen aus dem vorhandenen Katalog; IAM benötigt genaue
Berechtigungskennungen. Der erzeugte Vorschlag durchläuft dieselben Schema-, Quell-
und Compilerprüfungen und gewährt selbst keine Rechte. Plattformkontext unterscheidet
wiederverwendbare Template-Prinzipale von konkreten Projektmitgliedern. Deshalb
brauchen Template-Rechteänderungen keine einzelnen Benutzeradressen. Neue Presets
benötigen weiterhin einen bestätigten initialen Owner.

## Kontext und Defaults

Der Gesprächsstand enthält Ziel, bestätigte Entscheidungen, Empfehlungen und offene
Fragen. Bestätigungen verweisen auf wörtliche Nutzerbelege. Unbelegte Gedächtniseinträge
werden verworfen; eine gültige Antwort scheitert nicht allein an einem ungenau zitierten
Beratungsüberblick. Die tatsächliche Konfiguration bleibt maßgeblich. Empfehlungen
werden nicht zu vermeintlichen Nutzerentscheidungen.

Der vorherige, noch nicht übernommene Vorschlag wird als Compiler-Diff weitergegeben,
solange Wissenshash, Revision, Gültigkeit und öffentliche Ausgangswerte übereinstimmen.
Das ist Beratungskontext, keine übernommene Konfiguration oder Berechtigung. Verwerfen
löscht ihn; geänderte lokale Werte unterdrücken einen veralteten Vorschlag. Unveränderte
Ordner-IAM-Metadaten werden nicht in den Diff kopiert.

Der Stand liegt intern bei der Assistant-Nachricht im vorhandenen Gesprächs-JSON und
unterliegt denselben RLS-, Revisions-, Lösch- und Ablaufregeln. Der Browser kann ihn
nicht vorgeben und erhält ihn nicht in der öffentlichen Antwort. Ein anderer Wissenshash
verwirft den Cache, erhält aber den ursprünglichen Dialog. Verworfene Vorschläge
schließen ihren offenen Kontext. Dafür sind weder eine Datenbankmigration noch neue
Kundenressourcen erforderlich.

„Nimm den Default“ wählt den tatsächlichen Accelerator-Default des ausstehenden Feldes.
Das Modell verwendet die nativen Default-Fakten und übernimmt den Wert in den prüfbaren
Vorschlag. Es verlangt weder denselben Entscheid erneut noch den wörtlichen JSON-/CIDR-Wert.
Eine unbeantwortete Frage ist keine solche Auswahl. Die Auswahl „Unternehmens-/VPN-Netze“
liefert noch keine tatsächlichen öffentlichen Ausgangsadressen. Vorhandene Allowlists und
der native Default können als konkrete Optionen dienen. Eine spätere ausdrückliche
Default-Auswahl ersetzt die frühere Einschränkung.

Der vollständige Company-Git-Dialog erhält somit den Hub-and-Spoke-Kontext, empfiehlt
Git100 für ungefähr 80 Entwickler und setzt nach der Default-Antwort
`devops.git_flavor = "git-100"` sowie
`devops.allowed_network_ranges = ["0.0.0.0/0"]` als Vorschlag. Die Antwort erklärt die
öffentliche Erreichbarkeit. Sie wiederholt keine Größen-/Zugriffsfrage, verändert nicht
die vorhandene Netzstruktur und behauptet keine private Git-Anbindung über SNA.
Die Übernahme ändert ausschließlich den lokalen Entwurf.

## Prüfung und Übergang

Die Laufzeittests prüfen Werkzeugprotokoll, sämtliche Themenabfragen, native Defaults,
Compiler-Rückmeldungen, geschützte Eingaben, belegten Gesprächsstand, Empfehlungen,
Streaming und Gesprächsfolgen. Die realen Modelltests verwenden immer die öffentliche
Laufzeitklasse und müssen den neuen Pfad einschließlich vollständiger Nutzeraufgaben
und Servicewechsel qualifizieren. Fehlversuche bleiben erhalten. Kriterien betreffen
Ergebnisse, native Werte, Fakten und Nutzeranforderungen; gleichwertige Formulierungen
brauchen keinen festen Mustersatz.

Der frühere Controller bleibt vorübergehend als `LegacyAssistantModelServing` für
gekennzeichnete Vergleichstests bestehen. Der Editor-Chat kann nicht dorthin routen oder
zurückfallen. Diese Tests qualifizieren den neuen Pfad nicht. Die anfängliche
Template-Beratung behält ihren separaten typisierten API-Vertrag. Bei der späteren
Entfernung des alten Controllers müssen dieser Vertrag und Transport-/Fehlertests
erhalten bleiben.

Antwortbereitschaft bedeutet korrekten Fortschritt in der aktuellen Antwort:
validierter Vorschlag, beobachtete vorhandene Konfiguration, Beratung oder eine
notwendige strukturierte Rückfrage. Offene Entscheidungen verweisen auf tatsächlich
vorhandene Fragen; Fließtext ersetzt diese nicht. Eine notwendige Rückfrage
erfordert keine vorweggenommenen Änderungen. Ein validierter Default-Reset darf
eine explizite Vorgabe entfernen, auch wenn der effektive Compilerwert gleich bleibt.
Explizite Owner-Profile decken katalogisierte Dienstrechte bereits für beide
Empfänger ab. Ein Dienstwunsch darf diese Rechte nicht stillschweigend einschränken.
Eine gewünschte Umstellung auf granulare Rechte bleibt eine separat bestätigte Änderung.

## Qualifikationsverkehr

Die synthetischen Tests berücksichtigen den beobachteten Prompt-/Antwortverbrauch
und das gemeldete Projektlimit mit Reserve. STACKIT gewichtet Antworttokens mit
Faktor fünf. Damit werden folgende Aufrufe dosiert; empfangene HTTP-Fehler werden
nicht wiederholt, um eine fehlgeschlagene Wiederholung grün zu bekommen.
[STACKIT-Limits](https://docs.stackit.cloud/products/data-and-ai/ai-model-serving/how-tos/rate-limits-on-shared-models-_stackit-ai-model-serving/)
und [nativer Werkzeugvertrag](https://docs.stackit.cloud/products/data-and-ai/ai-model-serving/how-tos/integration-of-tool-calling/)
beschreiben die zugrunde liegenden Schnittstellen. Kritische Fähigkeitsgrenzen
benötigen einen expliziten Abdeckungsnachweis mit Referenzen auf serverseitig nummerierte
Antwortabsätze. Die Prüfung muss den Antworttext nicht nochmals wortgleich erzeugen.
Validierte Default-Wahlen werden mit nativem Wert und Nutzerbeleg an die Prüfung
übergeben, damit eine spätere Wahl nicht als frühere Zugriffsvorgabe interpretiert wird.

## Beratung und lokale Operationen

Die Chat-Werkzeuge sind lesend/lokal; das Configurator-Produkt führt separat
freigegebene Jobs aus. Eine Produktbeschreibung darf diese beiden Ebenen nicht
verwechseln. Vorschläge beschreiben geplante Wirkungen, keine schon erteilten Rechte.

Typisierte Änderungswerkzeuge bauen innerhalb einer Anfrage auf dem letzten
validierten Vorschlag auf. Die Validierung akzeptiert nur selbst ausgegebene
Vorschlagsschlüssel dieses Turns, spielt das begrenzte Operationspaket auf dem
ursprünglichen Stand ab und prüft seine vollständige Wirkung erneut. Abgelehnte
Kandidaten werden weder Grundlage noch finale Antwort. Ein allgemeiner
Validierungsaufruf kann eine Grundlage ausdrücklich auswählen oder neu beginnen.
Benötigt ein gültiger Vorschlag noch eine Nutzerentscheidung, liefert das
Fragewerkzeug Vorschlag und strukturierte Frage gemeinsam. Eine Frage nur im
Fließtext genügt nicht.

Registrierte Profile umfassen Workload, VM und vollen Owner. Granulare Profile
brauchen einen initialen Owner; die native Owner-Variante hat diese granularen
Owner-/Rechtelistenfelder nicht. Lokale Operationspakete aktualisieren ihren privaten
Arbeitsstand der Reihe nach und behandeln Profile atomar. Eine vorherige Owner-
Änderung bleibt dadurch bei anschließenden Rechteergänzungen erhalten.

Projekt-IAM-Rechte können in Public-, Corporate- und Sandbox-Vorlagen ergänzt
werden. Dafür werden weder Cluster noch SNA, Node-Pools oder Cluster-Namen
benötigt. Der Besteller, der Rechte bei einer Bestellung erhalten soll, ist bereits
als Empfänger bestimmt; Automation und zentraler initialer Owner sind eigene Rollen.
Passen mehrere Vorlagen zur gewünschten einzelnen Art, wird eine Auswahl mit den
tatsächlichen Schlüsseln angeboten. Kompakte Bereitschaftsinformationen zeigen
fehlende Veröffentlichungsvoraussetzungen ohne unveränderte Owner-Adressen.
Ein fehlender initialer Owner wird für betroffene granulare Vorlagen gemeinsam
erfragt; unabhängige lokale Rechteergänzungen können trotzdem vorgeschlagen werden.
Diese quellseitig bestimmten Entscheidungen werden gegen tatsächlich ausgegebene
Fragen oder eine wörtlich belegte Vertagung durch den Nutzer geprüft. Ein allgemeines
Prüfurteil genügt nicht. Andere Einstellungsänderungen und Vorlagen mit vorhandenem
Owner erzeugen diese Entscheidung nicht.

Nach bestätigter Umstellung älterer Rollen verwendet das Profilwerkzeug mit
`replaceLegacyAccess: true` dieselbe native Umstellungsfunktion wie der Editor.
Sie entfernt unvereinbare Rollenfelder und die zugehörige Parameterregel, erhält
andere Einstellungen und Vorlagenidentitäten und unterstützt anschließende
Rechteergänzungen. Die vollständige resultierende Vorlagenmap wird vom Compiler
geprüft. Eine reine Rechteergänzung migriert weder alte Rollen noch volle Owner-
Profile implizit.

Das native Validierungswerkzeug verwendet optionale `nativeDefaults`-Belege nur für
tatsächliche native Variablendefaults. Literale Werte, Katalogauswahl und registrierte
Profile benötigen diese Belege nicht; Quellen-, Schema- und Compilerprüfungen gelten
weiter für alle Vorschläge.

Vorhandene Template-Settings werden auf das passende native Projekt-/Sandbox-Modul
abgebildet. Ihre Auswahllisten verwenden dieselbe Feldregistrierung wie der Editor.
Katalogabruf und -prüfung verwenden die Template-Region statt der Plattform-Region;
unbekannte Template-Schlüssel werden nicht als Frageziele akzeptiert.
Profil- und Initial-Owner-Fragepfade werden aus tatsächlichen Vorlagen oder
compiler-validierten lokalen Vorschlägen registriert. Der synthetische Testlauf
verwendet dasselbe Register. Owner-Auswahllabel kommen aus vorbereiteten Accounts
und der verifizierten angemeldeten Identität. Modelltexte können keine andere
Identität als verifiziert ausgeben. Das betrifft Fragezuordnungen, keine zusätzlichen
Änderungspfade oder Tenant-Berechtigungen.
