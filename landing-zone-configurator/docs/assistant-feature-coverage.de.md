<a id="assistant-feature-coverage-and-dialogue-acceptance"></a>

# Assistent: Feature-Abdeckung und Dialogabnahme

[English](assistant-feature-coverage.md) | [Deutsch](assistant-feature-coverage.de.md)

<a id="additive-organisations-und-folder-rollenvorschlaege"></a>
<a id="lokaler-wissens-und-qwen-spike-2026-10-10"></a>

Stand: 2026-10-12. Lokaler Assistant mit automatischem Feldinventar und echten
synthetischen Themen-Smokes; keine vollstaendige Komponenten-/Cloud-Qualifikation.
Der bestehende Editor-/Compilervertrag bleibt massgeblich.
Produktentscheidungen: [Planung](planning.de.md#11-chatbot-mit-stackit-model-serving).

<a id="current-field-inventory-and-automated-topic-cases"></a>

## Aktuelles Feldinventar und automatisierte Themenfaelle

Der [aktuelle Testkatalog](assistant-test-catalogue.json) ordnet alle 501
Katalogfelder (einschliesslich Container und Listenelement-Vertraegen) genau einem
der 19 Wissensthemen zu. Er fuehrt Typ, Optionalitaet, Verantwortlichkeit,
tatsaechlichen Modus und erlaubten nativen Patch-Pfad auf. Unterschied zwischen
bekanntem Feld und unterstuetztem Vorschlag bleibt sichtbar: beispielsweise
regionale DNS-Felder und zentrale Dienste ueber den gemeinsamen nativen
Editor-Vertrag vorschlagbar, geschuetzte Zugangswerte nur Operator-Voraussetzungen.
Management-/Lifecycle-Themen ohne eigene Root-Eingaben haben eigene Chatfaelle.

Die Themenfelder einschliesslich Abhaengigkeiten werden als `componentFields`
an das Antwortmodell uebergeben; erlaubte Rueckfragefelder bleiben separat
eingeschraenkt. Antwortquellen sind auf die tatsaechlich gelieferte
Themenauswahl begrenzt. Metadaten enthalten keine Secret-Werte.

52 feste [Chatfaelle](../app/scripts/assistant-scenarios.ts) decken jedes Thema
und exakte DNS-/Grundlagen-/SNA-/Rollen-/Firewall-Regressionen ab. Katalog und Live-Bericht sind an
Wissens-, Engine- und Testquellhash gebunden. Normale PR-Checks pruefen offline
Frische, Feldzuordnung und Regression-Pruefer; echte Modellaufrufe sind explizit.
Start, Credentials, Einzelthemen und manueller CI-Lauf sind im
[App-README](../app/README.de.md#automatisierte-assistant-themenpruefung) beschrieben.
Live-Tests nutzen keine Benutzer-SSO-Sitzung und speichern keine Kundenentwuerfe.

<a id="common-editor-proposal-contract"></a>

### Gemeinsamer Editor-Vorschlagsvertrag

Der Assistant leitet seine geschlossenen Wertschemas aus demselben nativen
`InputType`-Inventar wie der Editor ab. Alle effektiven, nicht geschuetzten
Katalogpfade haben eine validierte Vorschlagsroute; Firewall-Policy bleibt
gemaess #101 ausgeschlossen. Das ist Feld-/Entwurfsparitaet, keine Behauptung
vollstaendiger Cloud-Ausfuehrungsqualifikation.

`merge` erhaelt ausgelassene Objektattribute und Map-Eintraege. Listen bleiben
atomar. `replace` und `default` werden als vollstaendiger Ersatz bzw. Rueckkehr
zum nativen Standard angezeigt, nicht in gefaehrliche Teilersetzungen zerlegt.
Operationen bleiben durch Feldwahl, Konfliktpruefung, API und Speicherung erhalten.
Projektvorlagen werden separat von konkreten Projektinstanzen behandelt;
neue Kennungen werden serverseitig erzeugt. Publikation und Bestellungen sind
keine Chat-Aktionen.

[Vertragstests](../app/tests/assistant-editor.test.ts) pruefen typisierte Werte
fuer jeden effektiven nicht ausgeschlossenen Katalogpfad sowie echte
Anwendung/Export, native Eingaben, Audit-Pflichtentscheidungen, Teilwahl,
atomare Ersetzung/Standards, stabile Vorlagenkennungen und unbestaetigte
IP-/ID-/Kontakt-/Produktwerte. Echte synthetische Modellfaelle pruefen die
natuerliche Uebersetzung separat; reine Metadaten gelten nicht als Dialogabnahme.

Der Vertrag unterscheidet nun den Zustand des Zielobjekts. Bei Erstellung muessen
einfache skalare/List-Slots im Serving vorhanden sein, statt vom Decoder
ausgelassen zu werden. Nicht angefragte optionale Null-Slots werden vor der
Vorschlagsausgabe als native Defaults ausgelassen; bei Updates bleiben explizite
Null-Werte unveraendert. Komplexe optionale Collections werden nicht zwangsweise
gefuellt: insbesondere sind leere Audit-Link-Scopes kein Organisationsdefault.
Neue Map-Eintraege verlangen native Pflichtfelder wie Kubernetes-Region und
Node-Pool-Name; bestehende Eintraege bleiben ueber bekannte Unterpfade partiell
aenderbar.

Komponentenspezifische Zusatzregeln liegen deklarativ in
`assistantEditorPolicies`, nicht in einem zweiten Feldmodell:
Audit-Erstellungsentscheidungen und ACL-Freitextfragen sind die ersten Regeln.
Ihre Pfade werden gegen das native Inventar getestet. Angebotenes Serving-Schema
und unveraenderte native Laufzeitpruefung werden beide durchlaufen; keine
Reparatur doppelter, unvollstaendiger oder unbestaetigter Antworten.
Topic-Korrektur verwendet eindeutige Besitzer der validierten nativen Roots,
nicht frei erfundene Komponentennamen. Irrelevante Firewall-Anforderungen werden
vor ihrer Quellenpruefung aus Nicht-Netzwerkthemen entfernt; Quellenpruefungen
fuer tatsaechlich genutzte Netzwerkentscheidungen bleiben strikt.
DE/EN-Vorschlagstexte mit Aenderungen werden serverseitig als lokale
Entwurfsvorschlaege erzeugt und koennen keine Speicherung oder Live-Grants
behaupten. Das [Erweiterungsvorgehen](../app/README.de.md#weitere-assistant-komponenten-ergaenzen)
verbindet Inventar, Wissen, Zusatzregeln, Anwendungstests und serielle
Modellqualifikation.

<a id="previous-evidence-topic-switch-from-firewall-to-audit-logging"></a>

### Vorheriger Nachweis: Themenwechsel von Firewall zu Audit Logging

Der erkannte aktuelle Topic darf nicht von geerbtem `networkScope` oder alten
Firewall-Targets ueberschrieben werden. Solche Merkmale gelten ausschliesslich
im aktiven Netzwerk-/Firewall-Thema; ihre belegten historischen Anforderungen
werden nach der Belegpruefung aus einem anderen Topic entfernt, nicht geloescht
oder als dessen aktuelle Anforderungen uebernommen. Ein aktueller Auftrag mit
"als naechstes ... richte ein" ist keine Vertagung.

Audit-Setup erhaelt eine gepruefte native Feldberatung zu Telemetry Link/Router,
Logs und Archiv mit der ausdruecklichen Grenze: derzeit kein uebernehmbarer
Audit-Patch im Chat. Der gemeinsame Editor hat generische Felder unter Plattform.
Keine stille Aktivierung, Retention-/ACL-Wahl oder Object-Lock-Zusage; keine
Fortsetzung der Firewall-Unterbrechungsfrage. Audit-Proposals sind damit nicht
automatisch aus dem MVP genommen.

Nachweis: **209 gezielte Offline-Tests**, Typpruefung und **16/16 echte
synthetische Modellfaelle** (2 Audit-Faelle einschliesslich des gemeldeten
Wechsels, 14 Firewall-Regressionen) bestanden. Wissenshash:
`8d8322d3c83f806d87ebbb7574443a8e06a9d8bcb98995e2557613c7216de906`;
Testsuitehash:
`5314926be9bd321415c1377b7433fcd74cf61428295c70200d23db32e4b51d4d`.
Keine Kundenpolicy/-konfiguration oder Cloud-Ausfuehrung zur Qualifikation.
Der Stand ist in der HTTPS-Entwicklungsumgebung aktiviert; API-Gesundheit und
unveraenderte vollstaendige Konfigurations-/Gesprächszeilen sind nach Neustart
geprueft. Bestehende Gespraeche bleiben fortsetzbar.

<a id="current-mvp-scope-no-firewall-policy-proposals"></a>

### Aktueller MVP-Scope: keine Firewall-Policy-Vorschlaege

Benutzerentscheidung 2026-10-13:
[Issue #101](https://github.com/stackitcloud/stackit-landing-zone/issues/101)
verschiebt gefuehrte Policy-Bearbeitung und uebernehmbare Assistant-Vorschlaege
aus dem MVP. Generische native Felder im gemeinsamen Editor bleiben erhalten;
die MVP-Alternative ist manuelle Policy-Pflege durch den Firewall-Admin in
OPNsense. Infrastruktur und HA garantieren allein keine Isolation oder NAT.

Aktuelle Faehigkeits- und Definitionsanfragen fuer Regeln/NAT/Aliase/Routen/
Port-Forwarding erhalten die explizite Chatgrenze, #101 und die Admin-Alternative,
ohne Aenderungen oder einen Regelvorschlag versprechende Rueckfragen.
Native Feldberatung bleibt moeglich. Historische Regelanforderungen verdrangen
keine aktuelle Infrastruktur-/Kapazitaetsantwort; Infrastruktur/HA-Patches
bleiben verfuegbar. Weitere MVP-Gates werden damit nicht aufgehoben.

Nachweis: **205 gezielte Offline-Tests**, Typpruefung, Wissens-/Katalogfrische
und **16/16 echte synthetische Modellfaelle** (14 Infrastruktur-/Dialogfaelle,
2 Policy-Faelle) bestanden. Die Tests pruefen keine Kundenpolicy und autorisieren
keine Cloud-Ausfuehrung. Wissenshash:
`b9892a0d275b920e3089c167157062ef66af29630374df0b8a6d03ba5d24c37b`;
Testsuitehash:
`f443f6633a4ffda7662f419d797a01ffe039c56f0ca5c4aaa187316036cc9c81`.
Der qualifizierte Backend-Stand ist in der HTTPS-Entwicklungsumgebung aktiviert.
API-Gesundheit und unveraenderte vollstaendige Konfigurations-/Gesprächszeilen
wurden vor/nach Neustart geprueft; UI und Kundendaten wurden nicht umgebaut.

<a id="previous-evidence-firewall-capability-boundary-and-actionable-errors"></a>

### Vorheriger Nachweis: Firewall-Faehigkeitsgrenze und handlungsfaehige Fehler

Der native Accelerator verwaltet `firewall_config` mit Regeln, Aliasen, Routen,
ausgehendem NAT und Port-Forwarding. Der aktuelle Chat kann nur Infrastruktur
und HA als Vorschlag patchen, nicht den komplexen Policy-Vertrag. Eine aktuelle
Frage nach dieser Faehigkeit hat Vorrang vor laufenden Infrastrukturfragen.
Die Antwort nennt den Editorweg, offene Regelziele und API-Voraussetzungen;
bisherige Verkehrs-/Policy-Antworten bleiben Anforderungen, keine Regeln.
Historische Faehigkeitsfragen duerfen eine aktuelle Kapazitaetsantwort nicht
verdraengen. Der Intent benennt dafuer ausdruecklich die aktuelle Quelle.

Abgelehnte Modellantworten werden nicht automatisch wiederholt oder teilweise
angenommen. JSON und NDJSON liefern denselben redigierten Fehlervertrag:
unbestaetigte Anforderungen, unpassender Vorschlag, ungueltige/abgeschnittene/
unterbrochene Antwort, Timeout, Auslastung, Dienstanmeldung oder Verfuegbarkeit.
Konfigurations-Chat und Template-Beratung zeigen lokalisierte Ursachen,
konkrete naechste Schritte und eine Diagnosekennung; Eingaben bleiben erhalten.
Modell-Rohantworten, Transportdetails und Zugangsdaten werden nicht angezeigt.

Nachweis am 2026-10-13: **196 gezielte Offline-Tests**, **6 PostgreSQL-Faelle**,
**13/13 echte synthetische Firewall-Faelle** und
**8 Desktop-/Mobil-Browserfaelle** bestanden, einschliesslich der gemeldeten
Faehigkeitsfrage, unbekannter Kapazitaet, handlungsfaehiger Fehlermeldungen und
Antwort-/Auswahlerhalt. Wissenshash:
`53945a3b8988baf2b4096365496e01fa3a38beb83b2d7da3e43bb0fcab798181`;
Testsuitehash:
`2caf7ed586cda64bf151f3fa6bd4466b8504da63fb45666ed4ca77e1b2bc4e3d`.
Dies ist keine Policy-/Paketpruefung und keine Cloud-Ausfuehrungsfreigabe.
Typpruefung, Wissens-/Katalogfrische und gezieltes Lint bestanden (eine
vorbestehende Browser-Testwarnung). Der Stand wurde in der HTTPS-
Entwicklungsumgebung aktiviert; API-Gesundheit und neues UI-Bundle wurden
geprueft. Vollstaendige Konfigurations-/Gesprächszeilen blieben unveraendert.

Vorheriger Nachweis vor dem Rollenpatch am 2026-10-12: **93 Offline-Tests**, Typpruefung, Wissens-/Katalogfrische
und gezieltes Lint bestanden. Abschliessender echter Lauf: **24/24 bestanden,
kein uebersprungener Fall**, mit Qwen3-VL als Antwortmodell und GPT-OSS-120B als
Intentmodell. Die fuenf zuvor roten Faelle sind behoben; die Sollpruefungen wurden
nicht gelockert, sondern um Feldnamen, Grenzen und falsche Speicherbehauptungen
erweitert. Grundlagenwiederherstellung und alle drei DNS-Kontaktvarianten bleiben
gruen. Keine automatische Wiederholung oder Annahme fehlgeschlagener Antworten.

| Fall | Ursache und Korrektur | Live-Nachweis |
|---|---|---|
| `identity-foundations-advice` | Serving verlor fruehere Systemnachrichten; Ausgabe endete am Tokenlimit. Ein einziger Systemvertrag und eine gepruefte native Felduebersicht ersetzen die unvollstaendige Freiform-Aufzaehlung. | bestanden, 1659 ms |
| `governance-folders-advice` | Namens-Patchgrenzen wurden mit Editor-Feldern verwechselt. Uebersicht nennt Elternordner, Rollen und Namen 1-40 Zeichen; meaningful descriptions werden explizit abgelehnt. | bestanden, 1391 ms |
| `firewall-policy-advice` | Gemeinsamer Firewall-Infrastrukturdialog verdraengte den Policy-Vertrag. Getrennte Themenfragen und native Policy-Uebersicht mit aliases/routes/rules/NAT, pass/block/reject und expliziter Synchronisierung. | bestanden, 1929 ms |
| `sandbox-projects-advice` | Verlorener Systemvertrag/Tokenlimit; erfundene Laufzeit-/Budgetoptionen. Native Uebersicht nennt nur project_name, project_owner_email und owner_emails sowie die separaten Lifecycle-Grenzen. | bestanden, 1583 ms |
| `sna-complete-draft` | Modellprosa behauptete eine bereits erfolgte Konfiguration. Erklaerung wird aus validierten Patch-Werten erzeugt; Streaming zeigt keinen ungeprueften Speichertext. | bestanden, 3946 ms |

Der semantische Intent `adviceTask=field-overview` nutzt fuer diese vier
Uebersichtsthemen den Backend-Wissensvertrag mit Feldinventar und geprueften
Grenzen. Das ist ein expliziter Beratungspfad, kein Erfolg-Fallback nach einem
Modellfehler. Andere Fragen und Vorschlaege verwenden weiterhin das Antwortmodell.
Ein Tokenlimit-Abbruch wird als `completion_truncated` verworfen; der HTTP-Fehler
bleibt redigiert. Alle vertrauenswuerdigen Systemanweisungen werden zusammen
gesendet, Nutzer-/Historiennachrichten bleiben getrennte untrusted Daten.
Native Editorfelder und schmalere Chat-Patchrechte bleiben unterscheidbar;
Rueckfragen sind auf das aktive Thema beschraenkt.
Der gepruefte Stand wurde lokal im Chatmodus ohne Cloud-Ausfuehrung neu gestartet.
API und UI-Proxy melden gesund; UI HTTP200 und unauthentifizierte Chatroute HTTP401.
Konfigurations-/Gesprächspruefsummen und Revisionen (6/19) blieben unveraendert.

Die Themen-Smokes pruefen Antwortvertrag, Referenz und Beratungsmodus, nicht jede
fachliche Textaussage oder jedes Feld einzeln. Fuer Vollqualifikation braucht es
weitere spezifische Sollwerte, Negativfaelle und Komponentenbeziehungen. Ein
vollstaendiges Inventar oder ein gruener Smoke ist keine Ausfuehrungsfreigabe.

<a id="gpt-oss-120b-model-experiment-and-continuous-dialogue"></a>

### Modellversuch GPT-OSS 120B und zusammenhaengender Dialog

Am 2026-10-13 wurden Antwortmodell und Intentmodell in isolierten Testprozessen
auf `openai/gpt-oss-120b` gesetzt. Die laufende Anwendung, Kundenentwuerfe,
Gespraeche und Cloud-Ausfuehrung wurden nicht umgestellt.

Der erste komplette 52-Faelle-Lauf bestand **29/52**. Von 23 Fehlern waren neun
HTTP-429-Antworten; parallel laufende Diagnose-/Journey-Tests beeintraechtigten
damit die Aussagekraft. Weitere Fehler waren sechs Tokenlimit-Abbrueche, vier
Scope-Ablehnungen, eine unbestaetigte Intentquelle und drei fachliche
Sollwertverletzungen. Diese Zahlen sind kein fairer Modellrangvergleich.
Wissenshash dieses ersten Laufs:
`c9bcfb0a1e8c3d2be7855a8db2a3a0ffc8ad392e0ed854d880ca876effad2ef2`;
52-Faelle-Suite:
`574375fd7a19aa775bba0bf766156660721454ae5db6a7013d69b2689dd6da32`.

Synthetische Rohantworten zeigten wiederholte merge/replace-Alternativen fuer
denselben Pfad und ausgelassene Audit-ACLs trotz Nennung im Antworttext.
Die Serving-Schemas verwenden deshalb nun ein einzelnes Operationsobjekt pro
Pfad und begrenzen die Anzahl auf die angebotenen Pfade. Nicht unterstuetzte
`propertyNames` werden nur aus dem Serving-Schema entfernt; die urspruengliche
Zod-Pruefung von Map-Schluesseln, Operationswerten und vollstaendigen
Ersetzungen bleibt unveraendert. Ein gekuerzter Label-Reply enthielt vor allem
Whitespace statt Nutzdaten; ein hoeheres Tokenbudget oder automatischer Retry
ist daher kein nachgewiesener Fix.

Der neue [Journey-Runner](../app/scripts/assistant-journey.ts) wurde danach fuer
beide Modelle **seriell** mit identischem Skript, Wissensstand, Temperatur und
Tokenlimit ausgefuehrt. Beide Modellrollen verwendeten jeweils dasselbe Modell.
Er simuliert Grundlagen, Rollen, SNA, Firewall/HA, die Policy-MVP-Grenze,
Audit-Themenwechsel/Rueckfragen/Aktualisierung, Observability, DevOps,
Kubernetes und Labels. Nur gueltige, erwartungsgemaesse Vorschlaege werden im
Speicher uebernommen. API-konforme Gespraechshistorie, JSON-Roundtrip und
tfvars-Export bleiben Bestandteil des Laufs; kein Browser, DB-Speichern,
Plan oder Apply wird dadurch qualifiziert.

| Serieller Journey-Schritt | GPT-OSS 120B | Qwen3-VL 235B A22B |
|---|---|---|
| Grundlagen | Scope-Ablehnung | bestanden |
| Organisations-Owner | bestanden | bestanden |
| SNA | bestanden | bestanden |
| Firewall/HA | bestanden | bestanden |
| Policy-MVP-Hinweis | bestanden | bestanden |
| Audit-Themenwechsel / fehlende Entscheidungen | Pflichtwerte fehlen | bestanden |
| Audit-Antwort | Pflichtwerte fehlen | Pflichtwerte fehlen |
| Audit-Aktualisierung | Pflichtwerte fehlen | Pflichtwerte fehlen |
| Observability | unbestaetigte Intentquelle | erwartete ACL/Retention fehlen |
| DevOps | bestanden | bestanden |
| Kubernetes | Vorschlag nicht anwendbar | Vorschlag nicht anwendbar |
| Labels | Tokenlimit-Abbruch | falsches Thema / Label fehlt |
| **Gesamtergebnis** | **5/12, nicht qualifiziert** | **7/12, nicht qualifiziert** |

Die seriellen Laeufe enthielten keine HTTP-429/503-Ablehnungen. Beobachtete
Turn-Dauern einschliesslich Intentklassifikation: GPT-OSS Median ca. 7,0 s,
Maximum 22,5 s; Qwen Median ca. 5,7 s, Maximum 12,3 s. Dies sind einzelne
synthetische Laeufe, keine allgemeine Latenz-, Kosten- oder Qualitaetsgarantie.
Beide Laeufe verwenden Wissenshash
`b21aac363a8f2d9110a4e21d4473b630bc193b0b02e9d04926f306f4c98af73d`
und Journey-Hash
`80ce96770cd172dbbfd37f73b5443cffd2e3f5e521627d2bf53aa2b20df1dd9e`.
**228 gezielte Offline-Tests**, Typpruefung, gezieltes Lint und
Wissens-/Katalogfrische bestanden.

Ergebnis: Ein reiner Modellwechsel behebt die Editor-/Assistant-Probleme nicht.
GPT-OSS wird auf dieser Basis nicht als neuer Standard aktiviert. Audit-Pflicht-
und Rueckfragevertraege, Label-Intent, anwendbare Kubernetes-Vorschlaege sowie
Scope-/Quellenkontinuitaet muessen vor einer erneuten Vollqualifikation
bearbeitet werden. Auch die native Editor-Erweiterung bleibt unaktiviert.

<a id="common-component-contracts-renewed-qualification"></a>

### Gemeinsame Komponentenvertraege: erneute Qualifikation

Die anschliessende Korrektur erfolgt im gemeinsamen nativen Vorschlagsvertrag,
nicht ueber modellspezifische Sonderfaelle. Neue Audit-Konfigurationen brauchen
Retention, ACL und die ausdrueckliche Object-Lock-Entscheidung zusammen.
Bestehende Objekte bleiben partiell aenderbar. Kubernetes-Erstellung verlangt
native Pflichtfelder einschliesslich Region und Node-Pool-Name; Labels verwenden
den geprueften Besitzer ihrer nativen Pfade. Ein Themenwechsel verwirft
irrelevante Firewall-Anforderungen, nicht aber Quellenpruefungen fuer weiterhin
genutzte Netzwerkentscheidungen. ACL-Rueckfragen erfinden keine auswaehlbaren
CIDRs. Vorschlagstexte behaupten weder Speicherung noch Deployment.

Nach diesen Aenderungen bestanden am 2026-10-13:

| Pruefung | Ergebnis |
|---|---|
| Gezielt alle acht Assistant-Offline-Suites | **238/238** |
| Typpruefung und Produktionsbuild | bestanden |
| Repository-Lint | keine Fehler; bestehende Warnungen bleiben |
| Wissens- und Szenarienkatalogfrische | bestanden |
| Zusammenhaengender echter Qwen-Dialog | **12/12** |
| Vollstaendiger echter Qwen-Szenarienlauf | **52/52** |

Beide Modellrollen verwendeten weiterhin
`Qwen/Qwen3-VL-235B-A22B-Instruct-FP8`. Die Modelltests liefen nacheinander und
ohne automatische Wiederholung. Vorherige Laeufe mit denselben
Komponentenvertraegen waren durch HTTP 429 unvollstaendig geblieben.
Der [gemeinsame Testadapter](../app/scripts/assistant-test-model.ts) begrenzt
jetzt jeden tatsaechlichen Request, einschliesslich Intentklassifikation, auf
mindestens 2500 ms Abstand. Tests pruefen Abstand, fehlenden Retry und Abbruch
waehrend der Wartezeit. Diese Begrenzung gilt nicht fuer den produktiven
Assistant; die gemessenen Turn-Zeiten enthalten Testwartezeit.
Die beiden abschliessenden Laeufe enthielten keine Quoten- oder Modellfehler.

Nachweis-Hashes:

- Wissen: `eb856918ecd71e3f380ea8da9be116d4578cedfc9977088c56311b9e65d44346`
- Journey: `74b5d41782e20b9d720a63afa1d515e50c4197602f41789d1ce920f1598d64e2`
- Szenariensuite: `57888ab5cfccc1303ebfd01125a9c6ed185b82602eab83a75a7eb20b1e34d498`

Der Journey uebernahm gueltige Vorschlaege in einen fortgeschriebenen
synthetischen Entwurf, bewahrte 24 Gespraechsnachrichten, pruefte den
JSON-Roundtrip und exportierte 2069 Bytes tfvars. Dies ist keine Qualifikation
aller Browser-/Datenbank-Workflows oder von Plan/Apply. Kundenentwuerfe und
Gespraeche wurden nicht veraendert; die laufende API wurde nicht neu gestartet.
GPT-OSS ist nach diesen Vertragskorrekturen noch nicht erneut qualifiziert.
Die Firewall-Policy bleibt als einzige hier ausdruecklich ausgeschlossene
Komponentenbearbeitung unter #101; es wurden keine weiteren Themen aus dem
MVP genommen. Weitere Komponenten folgen dem dokumentierten
[Erweiterungsverfahren](../app/README.de.md#weitere-assistant-komponenten-ergaenzen).

<a id="dev-release-qualification-2026-10-14"></a>

### Dev-Release-Qualifikation (2026-10-14)

Der korrigierte Release-Stand `927f20a` wurde erneut mit dem echten Qwen-Modell
qualifiziert: **52/52** synthetische Katalogfaelle und **12/12** Schritte im
fortgeschriebenen Gesamtdialog bestanden ohne automatische Wiederholung.
Der vorangegangene Lauf auf `1aabadb` bestand nur 51/52 Faelle: Eine bestaetigte
Firewall-Verkehrsentscheidung wurde erneut abgefragt. Die anschliessende
Klassifikationsklarstellung und der gezielte Regressionstest wurden vor dem
vollstaendigen Wiederholungslauf ausgefuehrt; der erste Fehlerbeleg bleibt erhalten.

- Wissen: `12693f9d18db481e57ae668b777bfd19715a96f121aa94efa984bc5cd8747bea`
- Journey: `74b5d41782e20b9d720a63afa1d515e50c4197602f41789d1ce920f1598d64e2`
- Szenariensuite: `57888ab5cfccc1303ebfd01125a9c6ed185b82602eab83a75a7eb20b1e34d498`

Der Journey bewahrte 24 Gespraechsnachrichten und exportierte 2069 Bytes tfvars.
Zusaetzlich bestanden 685 Unit-, 49 PostgreSQL- und 288 Desktop-/Mobile-Tests
sowie Typpruefung, Produktionsbuild, Katalogfrische und Release-Vorbereitung.
Die gehostete Assistant-Aktivierung wird ueber das geschuetzte
`LZC_ASSISTANT_ENABLED`-Opt-in weitergereicht und verlangt Authentifizierung.
Realer menschlicher Login, Organisationsnachweis und Kunden-Cloud-Ausfuehrung
sind separate Nachweise; ihr aktueller Status steht im
[MVP-Umfang](mvp-scope.de.md). Die oben genannten Zahlen sind historische,
revisionsgebundene Ergebnisse; aktuelle Nachweise stehen in CI und im
zugehoerigen Pull Request.

<a id="additive-organization-and-folder-role-proposals"></a>

### Additive Organisations- und Folder-Rollenvorschlaege

Die gemeldete Bitte um Nutzung der hinterlegten E-Mail als
Organisationsverantwortlicher wurde faelschlich als Grundlagenkontakt behandelt.
Der bislang schmalere Namens-/Skalarvertrag liess Rollenfelder nicht zu.
Explizite Rollenzuweisungswuensche werden jetzt semantisch als Governance-Entwurf
klassifiziert. Ein gepruefter Backend-Pfad erstellt `organization_owners`,
`organization_auditors` oder vorhandene Folder-Owner-/Reader-Listen aus der
angefragten gespeicherten, verifiziert menschlichen oder explizit genannten
E-Mail-Quelle, ohne freie Rollenwerte des Antwortmodells. Das ist kein Fallback
nach Modellfehlern und kein menschlicher Identitaetsnachweis.

Vorhandene Zuweisungen, Folder-Namen, Schluessel und uebrige Konfiguration bleiben
erhalten. Neue Folder, entfernte Subjects, Elternordner-/Configurator-Rollen oder
Live-Grants sind nicht erlaubt. Fehlende E-Mail oder unklare Folder-Auswahl werden
gezielt erfragt. Organisations-Owner-Rechte decken Folder ab; die native
Governance vermeidet doppelte Folder-Zuweisungen. Folder-Reader verwenden auditor.
Selektive Uebernahme speichert weiterhin nur den Entwurf, unselektierte Felder
bleiben offen; IAM-Auswirkungen benoetigen einen getrennten geprueften Plan/Apply.

Zusatznachweis am 2026-10-12: **110 Offline-Tests**, Typpruefung und gezieltes Lint
bestanden. **30/30 echte synthetische Faelle** bestanden, diesmal mit Qwen3-VL
sowohl als Antwort- als auch als Intentmodell entsprechend dem laufenden
Workstation-Modus. Die sechs neuen Governance-Faelle pruefen die gemeldete Frage,
alle explizit ausgewaehlten Folder, einen konkreten Reader, fehlende Folder-Auswahl,
fehlende E-Mail und die verifizierte Login-Quelle. Drei fokussierte echte
PostgreSQL-Tests pruefen transaktionale Rollen-/DNS-/Netzwerk-Felduebernahme,
Revisionsgrenzen und Tenant-Isolation. Keine Kundenkonfiguration, kein
Kundengespraech und keine Cloud-Berechtigung wurde durch die Tests veraendert.

<a id="native-firewall-infrastructure-and-ha"></a>

### Native Firewall-Infrastruktur und HA

Der bisherige SNA-Dialog nahm ohne Grundlage einen ausschliesslichen ersten
Netzwerkschritt an; Firewall-Infrastruktur war nur beratend unterstuetzt.
Explizite kombinierte Auftraege verwenden jetzt die gespeicherten SNA-Werte und
setzen mit dem Firewall-Vertrag fort. Fehlende SNA-Eingaben bleiben echte
Abhaengigkeiten, ein ausdrueckliches "Firewall spaeter" bleibt SNA-only.
Die Kapazitaetsrechnung trennt Projekt-Subnetze und Adressen: /16 enthaelt512 /25,
jeder /25 hat128 Adressen vor Infrastrukturreservierungen, ohne Quoten-/Durchsatz-
oder Freibelegungszusage.

Zentrale `connectivity.firewall`/`firewalls` akzeptieren gepruefte native
Infrastrukturfelder einschliesslich des HA-Objekts mit anderer Backup-Zone,
optionalen Node-/VIP-Adressen, Backup-Namen und vhid. Ein zusammenhaengender Patch
enthaelt alle Pflichtfelder neuer Appliances; vorhandene Appliances sind partiell
editierbar. Explizit angefragte Felder werden im Antwortschema verpflichtend.
Fehlende bestaetigte Adressen/Produkte/Zonen fuehren zu geprueften Rueckfragen,
nicht zu unvollstaendigen Patches oder erfundenen technischen Beispielwerten.
Mehrere Bereiche erfordern explizite Zielauswahl; Neuanlage einer nativen Map
muss alle Bereiche abdecken und braucht dafuer einen ausdruecklichen Auftrag.

Single-/Map-Form, Area-Keys, unbekannte Importmetadaten und nicht angefragte
Konfiguration bleiben erhalten. Geprueft werden Pool-Containment, LAN-/WAN-/
Transfer-Ueberlappungen, nutzbare unterschiedliche IPs, native cidrhost-Defaults
4/5/6 und unterschiedliche HA-Zonen. Regional-Umwandlungen, Entfernung,
Firewall-Policies, Operator-Zugaenge und Ausfuehrung bleiben ausgeschlossen.
Nested-HA-Felder erscheinen einzeln im UI; unvollstaendige abhaengige Auswahl
wird transaktional ohne Speicherung abgelehnt. Feldannahme ist kein Deployment,
SLA-Nachweis oder automatisches Failover einer oeffentlichen IP.

Nachweis nach der Einrichtungs-/UI-Sperrkorrektur: **160 Offline-Tests**, Typpruefung,
Wissens-/Katalogfrische und gezieltes Lint bestanden. **10/10 gezielte Firewall-
Live-Faelle** bestanden mit Qwen3-VL als Antwort- und Intentmodell, ohne
uebersprungene Faelle oder automatische Wiederholung. Der vorherige vollstaendige
Live-Lauf bestand mit **35/35 Faellen**; die neue Suite enthaelt 39 Faelle.
Vier echte PostgreSQL-Tests pruefen HA-/Rollen-/DNS-/SNA-Feldauswahl, darunter
Rollback unvollstaendiger HA-Auswahl, Revisionen und Tenant-Grenzen.
Sechs Desktop-/Mobil-Browsertests pruefen HA-Einzelfelder sowie bestehenden
DNS- und Chat-Workflow. Die neuen Live-Faelle testen den gemeldeten kombinierten
Satz, HA-Ergaenzung, komplette Neuanlage, fehlende Voraussetzungen und gespeicherte
HA ohne erneuten Vorschlag. Keine Cloud-Bereitstellung oder Kunden-Draft-Aenderung
durch diese Tests.
Die neue Regression verwendet die native Single-Form mit Metro-Zone, /28-LAN/WAN,
vorhandenem Flavor und einem Produktkatalog. Unbestaetigte Node-/VIP-Adressen
fehlen im Antwortschema; berechnete Defaults bleiben implizit. Gespeicherte oder
benutzerbestaetigte IPs bleiben einzeln vorschlagbar, erfundene IPs werden weiterhin
abgewiesen. Auch die genaue Benutzeranfrage mit gespeichertem oeffentlichem
Konfigurationsstand und echten autorisierten Produktkatalogen wurde nur lesend
erfolgreich reproduziert; es wurden keine Kunden-Vorschlaege uebernommen.
Bei breiter Einrichtung folgt neben einem gueltigen HA-Patch eine einzelne offene
Verkehrs-, Kapazitaets- oder Betriebsfrage. Ein begrenzter semantischer Aufruf mit
dem Intentmodell prueft nur aktuelle/vorherige Benutzeraussagen und die enge oder
breite Anfrage. Bestaetigungen brauchen woertliche Benutzerquellen; erfundene
Bestaetigungen werden abgewiesen. Gezielte native Patches erhalten keinen
zusaetzlichen Fragebogen. Vorhandene Appliance-Werte werden als Entwurfsstand,
nicht als Leistungsnachweis, angezeigt.
Die damaligen Desktop-/Mobiltests reproduzierten die pauschale Sperre bei
ungespeicherten Aenderungen. Diese Sperre wird durch den unten beschriebenen
konfliktbezogenen Entwurfsabgleich ersetzt.
Der korrigierte Workstation-Prozess ist ueber HTTPS erreichbar; alle gespeicherten
Konfigurations- und Gespraechszeilen blieben laut Pruefsummen beim kontrollierten
API-Neustart unveraendert. Es wurde kein Plan/Apply gestartet.

<a id="historical-concept-matrix-a01a24"></a>

## Historische Konzeptmatrix (A01-A24)

Die [maschinenlesbare Matrix](assistant-feature-coverage.json) ordnet alle 29
aktuellen Root-Eingaben und jeden verschachtelten Katalogeintrag Szenarien zu.
Objekt-/Listencontainer sind enthalten, nicht nur Blaetter. Sie verwendet
`featureGroups`, `acceleratorInputs` und `featureFieldCatalogue`; keine separate
handgeschriebene Feldliste. Quellhashes erkennen Aenderungen am Feature-Katalog,
Input-Inventar, aktuellen Vorlagen, Fachvalidierung, Dokument-/Compilervertraegen
und Application-Template-Vertrag. Die
Engine-Revision ist der vorhandene Domain-Pin, keine Behauptung, dass der lokale
Root oder ein neues Runner-Paket bereits unter diesem Pin freigegeben ist.

Jeder Feldeintrag beginnt mit `qualification = not-qualified`. Zuordnung und
Frische beweisen nur Konzeptvollstaendigkeit, nicht KI-Verstaendnis. Pro Feld
sind Analyse, fehlende Angaben und, soweit unterstuetzt, Erstellung/Aenderung
mit validiertem Diff zu evaluieren. Sensible Felder erlauben ausschliesslich
Erklaerung der Zugangsvoraussetzungen, keine Werte im Chat, Modellkontext oder
Patch. Unwirksame Felder werden erklaert und abgewiesen, nicht angeboten.
Komponentenbeziehungen brauchen zusaetzliche fachliche Faelle; Feldabdeckung
allein reicht nicht. Die Matrix erweitert keine Ausfuehrungsrechte.

Aktualisieren und pruefen im App-Verzeichnis:

```sh
npm run build:packages
node --import tsx scripts/assistant-coverage.ts
node --import tsx scripts/assistant-coverage.ts --check
npx vitest run tests/common-configuration.test.ts
```

Der bestehende Unit-Gate prueft Matrixfrische und Katalogvollstaendigkeit. Neue
Root-Eingaben ohne Szenariozuordnung schlagen fehl. Neue Unterfelder machen die
Matrix veraltet; Regeneration ersetzt keine fachliche Review oder Modellabnahme.

<a id="business-scenarios"></a>

## Fachliche Szenarien

Jeder Fall beginnt mit einem Benutzerziel, nicht mit einer vollstaendigen tfvars.
Das Modell fragt gezielt fehlende Informationen, nennt keine erfundenen Defaults
und zeigt seine Annahmen. Pflichtangaben/Fachregeln entscheidet das Backend.

| ID | Bereich und Beispielziel | Rueckfragen, Beziehungen und erwarteter Nachweis |
| --- | --- | --- |
| A01 | Standalone und Grundlagen: Public-Einstieg fuer ein API-Team | Vorlage begruenden; Organisation/Owner aus autorisiertem Kontext statt erneut abfragen; Region, Namen, Codes, Labels und Contract-Namespace klaeren; Public explizit; unveraenderte Defaults erhalten. |
| A02 | Ordner und Rechte: bestehender Parent mit getrennten Teams | Parent, stabile Ordnerrollen, Anzeigenamen, Owner/Reader/Auditor-Zuordnungen; keine ownerlose Anlage; nichtleere Folder-Beschreibung ablehnen; Rechte nicht aus Freitext ableiten. |
| A03 | Management: Audit, Aufbewahrung und foederierter Login | Zentrale Observability, Audit-Routing und Archivierung, Object-Lock-Default, IdP-Konfiguration und Projektbeziehungen erklaeren; keine stille Aufbewahrungsaenderung. |
| A04 | Hub-and-Spoke/Multi-Area: Produktion und Forschung trennen | SNA-Adresspools, Transfernetze, Praefixe, DNS/Resolver, Corporate-Zuordnung und Bereichsidentitaeten; Ueberlappungen/Widersprueche nach Fachregeln erkennen; referenzierten Bereich nicht loeschen. |
| A05 | Multi-Region: eu01/eu02 ohne implizite Verbindung | Regionale Eingabeform, Bereiche, DNS-Zonen/Zuordnungen und Projekt-/Clusterreferenzen; single/regional nicht gleichzeitig aktiv exportieren; kein automatisches Inter-Region-VPN (#64). |
| A06 | Firewall-Infrastruktur: Appliances fuer Prod/Nonprod | Groesse, Zone, Netze, IPs und HA/CARP nach vorhandenem Root-Vertrag; Infrastruktur von Policy unterscheiden; keine Multi-Appliance-Policy zusagen (#65). |
| A07 | VPN: Office-Gegenstelle mit zwei Tunneln | Gegenstellen, Routingart, Routen/Subnetze und IKE/IPsec-Abhaengigkeiten; keine PSKs erfragen; aktuelle SNA-Reichweite (#85), BGP-Grenze (#86) und Inter-Region-Grenze aus qualifizierter Capabilityquelle erklaeren. |
| A08 | DevOps: Git-Service fuer private Teams | Erlaubte Netze, Plattformprojekt und Netzwerkbeziehungen; widerspruechliche Isolation gegen gemeinsam benoetigten Dienst aufloesen; keine unverdrahteten Dienste erfinden. |
| A09 | Kubernetes: regionaler Cluster mit Monitoring/KMS/Bastion | Node-Pools und Autoscaling, Bereiche, DNS/Gateway, Volumes/KMS, SSH/Bastion und Rollen schrittweise konfigurieren; private Erreichbarkeit (#37), regionale Zuordnung (#80), gekoppelte Bastion (#87) und Observability-Ort (#88) getrennt behandeln. |
| A10 | Projektarten und projektspezifische Dienste | Public/Corporate, Region/Bereich, stabile Kennung, Umgebung, Netzgroesse, Rollen/Custom Roles, Secrets Manager und Observability; Artwechsel mit Auswirkungen statt stiller Migration. Plattformentwurf bleibt von realen Application-Instanzen getrennt. |
| A11 | Sandbox: temporaere Teamumgebung | Name, Verantwortliche und zusaetzliche Owner; nur unterstuetzte Sandbox-Felder, keine erfundene automatische Laufzeitloeschung. |
| A12 | Namespace-Dienste: Policy und Demo im Plattformcluster | Cluster-/Projektbezug, DNS, Zugriff, Secrets-Integration, Policy-Modi, Break-glass, Labels/Annotations und optionale Demo-/Last-/Metrikfelder; Demo von Produktion trennen; regionale Grenzen erhalten. |
| A13 | Firewall-Policy und Bootstrap | Aliase, Regeln, Routing, NAT und Portforwarding sowie Endpoint/TLS, Benutzer und Erst-/Folgephase; erforderliche Bindings erklaeren, keine API-Secrets lesen und kein TLS-Bypass. |
| A14 | Application Landing Zone Templates | Autorisierte bestehende Versionen passend zum Bedarf auswaehlen oder neue Entwuerfe mit Parametern, Bindings, Regionen, Service-Einstellungen und Deployment-Policy erstellen; PE-Veroeffentlichung separat; bestehende Instanzen bleiben versioniert. |
| A15 | Bestehende Konfiguration gezielt anpassen | Workspace/Config und Revision erkennen; Ziele gegen Ist-Entwurf analysieren, fehlende Angaben nachfragen; unbekannte Felder sowie nicht gesetzt/null/konfiguriert erhalten; Gesamt-Diff und Topologie; veralteten Patch blockieren. |
| A16 | Geschuetzte Zugaenge und Injection | Geheimnisse weder erfragen noch an Modell senden; nur Anforderungen und autorisierte sichere Binding-Workflows; manipulierte Texte geben keine neuen Werkzeuge/Rechte; allgemeine Fremdaufgaben ablehnen. |
| A17 | Gespraech fortsetzen und Rechte erneut pruefen | Nach Wiederanmeldung/Backend-Neustart korrekt fortsetzen; Tenant/Workspace/Config/Rechte jedes Mal pruefen; Session-Widerruf und fremde IDs abweisen; Konfigurationsaenderungen transparent abgleichen. |
| A18 | Loeschung, Altersgrenze und Restore | Beide Elternloeschpfade samt Nachrichten/Zusammenfassungen/Vorschlaegen; laufende/spaete Inferenz darf Daten nicht wiederbeleben; drei Kalendermonate ab Erstellung, Monatsenden eingeschlossen; Aktivitaet verlaengert nicht; Cleanup/Restore ohne abgelaufene Daten. |
| A19 | Fuenf parallele Sitzungen und Modellfehler | Keine Kontextvermischung oder Requestverluste; begrenzte Queue, Provider-429/Timeout/Abbruch, begrenzte Reparaturversuche; manuelles Editieren bleibt moeglich; keine Geldgrenze, trotzdem technischer Missbrauchsschutz. |
| A20 | Wissen und Versionswechsel | Quellen und Modul-/Provider-/Config-Version binden; neue STACKIT-Funktionen nicht ungeprueft anbieten; Wissensupdate erkennen/geprueft promoten; unveraenderte Altversionen und kein automatisches Upgrade. |
| A21 | Workspace und Konfigurationsverwaltung | Im autorisierten Workspace neue/gespeicherte/importierte Config binden; Herkunft, Fork-/Repository- und Export-/Speicherworkflow erklaeren; unbekannte Felder erhalten; Repository-Speichern/Loeschen bleibt ausdrueckliche regulaere UI-Aktion, kein Modell-Git-Zugriff. |
| A22 | Application-Gruppen, Veroeffentlichung und Bestellungen | Sichtbare autorisierte Template-Versionen, Gruppenbeschraenkungen, Parameter/Bindings und Approval-Policy verwenden; Bestellungen/Instanzstatus erklaeren; keine Rechte vergeben, keine Instanz automatisch bestellen und keine Quoten-/Upgrade-Funktion erfinden. |
| A23 | Organisation, Credentials, Backend, Plan und Recovery | Organisations-/Rollen-/Einladungsprozesse sowie erforderliche Profile/Backend-Bindings erklaeren; nur freigegebene bereinigte Statusmetadaten, keine State-/Plan-/Credential-Rohdaten; Freigabe/Dispatch/Recovery/Unlock bleiben separate autorisierte UI-Aktionen. |
| A24 | Cloud-Kataloge, Topologie und Sprache | Autorisierte aktuelle Regions-/Service-Angebote mit Herkunft/Alter statt erfundener SKUs; bei fehlendem Angebot nachfragen; deterministische Topologie aus validiertem Entwurf; DE/EN-Dialog mit identischem Fachverhalten und stabilen technischen Kennungen. |

<a id="dialogue-state-and-completion"></a>

## Dialogzustand und Fertigstellung

1. Autorisierten Workspace und Konfigurationsentwurf binden, gegebenenfalls
   regulären neuen Entwurf vor Vorlagenauswahl anlegen. Keine ungebundenen Chats.
2. Ziel, vorhandene Angaben, offene Fragen und widerspruechliche Anforderungen
   als strukturierte Fakten mit Herkunft speichern; Aussagen sind keine Rechte.
3. Vorlage/Komponenten begruendet vorschlagen, Fragen nach Abhaengigkeiten
   priorisieren. Explizite Antworten haben Vorrang vor Annahmen; sichere Defaults
   muessen aus dem jeweiligen Vertrag stammen. Nicht immer erneut Identitaet fragen.
4. Plattform und Application-Template-Entwuerfe gemeinsam auf Konsistenz pruefen.
   Mehrere Vorschlaege im Chat-Arbeitsentwurf sammeln, ohne Ausgangsconfig zu aendern.
5. Backend bewertet `fehlende Angaben`, `Widersprueche`, `vollstaendiger Entwurf`
   und separat `Ausfuehrungsblocker`. Ein nicht erreichbarer privater Runner macht
   keine korrekte Konfiguration unvollstaendig, aber die Ausfuehrung gesperrt.
6. Gesamt-Diff samt Auswirkungen/Topologie und Quellen anzeigen. Uebernahme
   verlangt aktuelle Rechte, gleiche Basisrevision und ausdrueckliche Bestaetigung.
   Git, Template-Veroeffentlichung, Plan und Apply bleiben getrennt.

<a id="qualification-stages"></a>

## Qualifikationsstufen

<a id="local-knowledge-and-qwen-spike-2026-10-10"></a>

### Lokaler Wissens- und Qwen-Spike (2026-10-10)

`apps/api/src/assistant/knowledge.ts` erzeugt einen deterministischen lokalen
Metadaten-/Regelentwurf: alle 501 Katalogpfade mit Modus, Typ und Optionalitaet,
Vorlagen-ID/Quellhash ohne Vorlagenwerte sowie fuenf kuratierte Regeln mit
Quellverweisen. Der Kontext verlangt passenden Engine-Pin und Wissenshash und
eine begrenzte Auswahl bekannter Funktionsgruppen. Sensible Pfade enthalten
keine Werte und sind ausschliesslich Zugangsvoraussetzungen.

Dieser Entwurf ist `local-draft-not-reviewed-release`: Der Hash bindet genau
diese Metadaten/Regeln, nicht den vollstaendigen Modulcode oder alle aktuellen
STACKIT-Dokumentationen. Vollstaendige Quellenaufnahme, Review/Promotion,
historische Wissenspakete und reale Dialogqualifikation stehen noch aus. Die
Quellverweise selbst sind keine Retrieval- oder Aktualitaetsnachweise.

`apps/api/src/assistant/model-serving.ts` implementiert nur einen synthetischen
Public-Standalone-Spike, keinen allgemeinen Chat. Operator-Konfiguration:

| Variable | Verhalten |
| --- | --- |
| `LZC_MODEL_SERVING_TOKEN` | Bestehendes Terraform-/Deployment-Binding; Pflicht, nur Prozessumgebung. |
| `LZC_MODEL_SERVING_MODEL` | Default `Qwen/Qwen3-VL-235B-A22B-Instruct-FP8`; betreiberseitig anpassbar. |
| `LZC_MODEL_SERVING_BASE_URL` | Default und derzeit einzig zugelassen `https://api.openai-compat.model-serving.eu01.onstackit.cloud/v1`; andere Endpoints brauchen ausdrueckliche Allowlist-/Sicherheitsqualifikation. |
| `LZC_MODEL_SERVING_TIMEOUT_MS` | Default 60000, begrenzt auf 1000..120000. |

Im App-Verzeichnis mit gepinntem Node 24 und sicher bereitgestelltem Binding:

```sh
npm run build:packages
node --use-system-ca --import tsx scripts/assistant-spike.ts
```

Kein Token im Kommandoargument, Chat, Git oder Frontend; keine Ausgabe roher
Terraform-Outputs zum Beschaffen des Tokens. Der bestehende Token muss sicher
in die lokale Prozessumgebung injiziert werden, nicht neu erzeugt oder rotiert.
Der Mac-Transfer enthaelt `.local/github-platform-applied.tfstate` und den
Originalschluessel `.local/platform/state.passphrase`, beide mit Modus `0600`.
Read-only-Zugriff wurde mit dem gepinnten OpenTofu 1.12.6 qualifiziert: in einem
leeren temporaeren Verzeichnis, vollstaendige Verschluesselungskonfiguration
ueber `TF_ENCRYPTION`, `output -json -state=<lokaler Snapshot> model_serving_token`.
Ein Operator-Prozess faengt stdout ausschliesslich im Speicher ab und uebergibt
den JSON-dekodierten Token direkt als `LZC_MODEL_SERVING_TOKEN` an den Kindprozess.
Kein Terminal-Output des Tokens, kein Klartextfile, kein Remote-State-Pull und
keine Schluesselrotation. Der historische Snapshot wird dabei nicht veraendert;
sein Vorhandensein allein beweist keine aktuelle Gueltigkeit des Tokens.
Der Befehl prueft Matrixfrische und sendet ausschliesslich synthetische Daten.
Ausgabe sind nur Modell-/Wissensbindung, Laufzeit, bekannte Template-ID und
Anzahlen; keine Antworttexte oder Secrets.

Der Client begrenzt Ausgabe und Responsegroesse, erlaubt keine Redirects oder
automatischen Retries und prueft JSON, Abschlussgrund, Template-ID, editierbare
Fragepfade und kuratierte Referenzen. Die synthetische Aufgabe verlangt
Standalone und den Public-/Corporate-Regelbezug. Fehler werden redigiert.
Das Ausgabebudget betraegt 4096 Tokens; die Schema-Grenzen stehen auch im Prompt,
insbesondere maximal acht priorisierte Fragen. Abgeschnittene Antworten oder
zu viele Fragen werden weiterhin abgewiesen, nicht stillschweigend gekuerzt.
Diese Pruefungen beweisen noch keine allgemeine semantische Zuverlaessigkeit
oder Prompt-Injection-Sicherheit fuer Kunden-Dialoge.

Lokale Nachweise: sieben fokussierte Tests, einschliesslich Secret-Fragen,
erfundener/falscher Templates, Zusatz-Toolgrants, falscher Revision/Hashes,
429/JSON/Responsegroesse und Timeout ohne Retry. Kanonischer Gate: Lint, Typen,
Build, 444 Unit-Tests bestanden, 53 umgebungsgebunden uebersprungen. Der echte
CLI-Spike besteht nach sicherer Token-Uebergabe aus dem lokalen Snapshot:
`Qwen/Qwen3-VL-235B-A22B-Instruct-FP8`, 11983 ms, `standalone`, acht Fragen,
fuenf Referenzen, `authorizesExecution=false`. Wissenshash:
`6fbe9d02cdb514f9c36ce39150a1ebc1aaa84c0d67a5dcf02a6a4cc2c8a1d370`,
Engine-Pin `a256f6896d11134fdc351786f1be5eba4e56b2e2`.
Fuenf einzeln gestartete synthetische Aufrufe: vier abgewiesen, einer akzeptiert;
keine automatischen Retries. Redigierte Diagnostik bestaetigte HTTP 200 und den
passenden Modellnamen. Zunaechst `finish_reason=length` bei 1200 Tokens; nach
Budgetkorrektur vollstaendiges JSON, aber 19 statt maximal acht Fragen. Die
expliziten Prompt-Limits beheben den zuletzt nachgewiesenen Vertragsfehler.
Die Einzelmessung ist keine Latenzzusage, Lastabnahme oder A01-A24-Qualifikation.

Der urspruengliche Spike hatte keinen HTTP-Endpunkt oder Browserintegration.
Der folgende lokale Editor-Schritt ergaenzt einen begrenzten Dialog, ist aber
weiterhin keine vollstaendige A01-A24- oder Betriebsqualifikation.

<a id="upstream-template-advice-2026-10-10"></a>

### Vorgelagerte Template-Beratung (2026-10-10)

Das authentifizierte Panel `Template-Beratung` steht bereits auf
`Konfigurationen` und `Neue Konfiguration` bereit, ohne geoeffneten Entwurf.
`AssistantModelServing.adviseTemplates` verwendet begrenzte Historie und
backendgebundenen Wissensentwurf mit bekannten Template-IDs/Hashes und
Netzwerkbereich-/Firewallmetadaten. Antworten enthalten eine bekannte ID oder
`null`, maximal fuenf Rueckfragen, eine Erklaerung und bekannte Regelreferenzen.
Keine Rechte, Werkzeuge, Geheimnisse oder automatische Konfigurationserstellung.
Die Vorlagen sind unterschiedliche Startvorgaben derselben Engine; daraus folgt
keine pauschale Zusage vollstaendiger Feature-Unterstuetzung.

`/api/v1/configurations/template-advice`: GET/POST/DELETE unter den bestehenden
Login-/Plattform-/Origin-/CSRF-Grenzen. Migration 054 persistiert ein persoenliches
Tenant-Gespraech mit unverlaengerbarer Drei-Kalendermonats-Frist. Erneute
Autorisierung und Revisionsvergleich nach Inferenz verhindern Wiederbelebung
geloeschter/abgelaufener Gespraeche und konkurrierendes Ueberschreiben.
`Vorlage ansehen` oeffnet ausschliesslich die vorhandene Vorschau. Keine
automatische Uebernahme von Gespraechsanforderungen in Editorwerte; Auswahl-
und Konfigurationsgespraech bleiben getrennt. Keine neuen Geld- oder
Gespeicherte-Gespraeche-Quoten; vorhandene 40-Nachrichten-/fuenf-Aktivanfragen-
Prozessgrenzen gelten. UI-Systemtexte bisher Deutsch; DE/EN-Paritaet offen.

Nachweise: elf fokussierte Vertrags-/HTTP-/Modelltests, 448 Unit-Passes/53 Skips
plus Lint/Typen/Build, 33 PostgreSQL-Faelle, vier fokussierte Desktop-/Mobil-
Workflows mit Screenshots. Echter synthetischer HTTP-Dialog mit Standard-Qwen:
6757 ms/vier Rueckfragen/`null`, dann 3146 ms/`hub-and-spoke`/keine Rueckfragen;
vier persistierte Nachrichten, Reload 200, DELETE 204. Kein Benutzerentwurf
fuer diese Inferenz verwendet. Lokale Benutzer-DB auf 054 migriert, beide
vorhandenen Konfigurationen unveraendert. Matrix bleibt `not-qualified`:
zwei echte Antworten sind kein A01-A24-, Injection-, DLP-, Quellen-,
Restore-/Monatsend- oder Fuenf-Sitzungs-Lastnachweis.

<a id="continuing-firewall-dialogue-2026-10-13"></a>

### Fortlaufender Firewall-Dialog (2026-10-13)

Antworten zu Verkehrsregeln und unbekannter Kapazitaet setzen den bestehenden
Einrichtungsauftrag fort. Ein begrenzter Intent-Aufruf waehlt Belegkennungen
tatsaechlicher Nutzeraussagen statt frei formulierter Zitate. Eingebettete
Rueckfragen gelten nicht als Antworten. Unbekannter Durchsatz bleibt ein offener
Sizing-/Benchmark-Punkt, blockiert aber nicht die naechste Betriebsentscheidung.
Regelanforderungen und benannte Betreiber bleiben erhalten; bereits beantwortete
Verkehrs-/Betreiberfragen werden nicht wiederholt. Setup-Rueckfragen werden aus
geprueften deutschen Textbausteinen erzeugt, nicht aus internen Steuertexten.
Vorhandene Entwurfswerte sind weder Deployment- noch Speichernachweise.

Nachweise: 173 Offline-Tests einschliesslich eines zusammenhaengenden
Fuenf-Schritt-Dialogs, 6 fokussierte PostgreSQL-Tests, Typpruefung und
Wissens-/Katalogfrische erfolgreich. 12/12 echte synthetische Firewall-Modellfaelle
mit Qwen als Antwort- und Intent-Modell erfolgreich, einschliesslich unbekannter
Kapazitaet, Fortsetzung bis zur letzten Betriebsantwort und enger HA-Feldaenderung.
Wissens-SHA256: `38f58c5895837f28583c834890698e567cae886da03210770b14fe7c9490c0e8`;
Suite-SHA256: `db75e65e906c3c030d0dc02fa5367f566c2e3a912e4897d82eb445c3f6c3b010`.
Dies ist eine synthetische Regression, kein Firewall-Leistungs-/SLA-Nachweis.

Backend aktiviert; HTTPS-Healthcheck erfolgreich. Vollstaendige gespeicherte
Konfigurations- und Gespraechszeilen sind laut aggregierten Pruefsummen vor/nach
Aktivierung unveraendert. Keine automatische Vorschlagsannahme, Speicherung von
Kundenaenderungen oder Cloud-Ausfuehrung.

<a id="conflict-aware-local-adoption-2026-10-13"></a>

### Konfliktbezogene lokale Uebernahme (2026-10-13)

Die UI sendet beim Annahmepfad `draft`, `savedDraft` und die ausgewaehlten
Feldkennungen. Das Backend fuehrt einen Drei-Wege-Abgleich mit der aktuellen
gespeicherten Konfiguration durch: unabhaengige lokale und gespeicherte
Aenderungen bleiben erhalten. Migration057 speichert bei neuen Vorschlaegen
die freigegebenen Ausgangswerte. Eine andere Basis- oder Wissensrevision allein
blockiert nicht; Vorschlaege werden gegen den aktuellen Vertrag erneut geprueft.
Tatsaechliche Feldkonflikte liefern409 mit den pruefbaren Werten; manuelle
Editor-Konflikte zeigen nur Feldpfade, niemals geschuetzte Inhalte. Bestaetigung
ist an die exakt gepruefte gespeicherte Revision gebunden und muss bei erneuter
Aenderung wiederholt werden. Historische Vorschlaege ohne rekonstruierbaren
Ausgangswert verlangen ausdrueckliche Wertepruefung statt erfundener Baselines.

Uebernahme aendert nur den Browserentwurf, nicht Konfigurations-/Gespraechszeilen;
Speichern bleibt ein gesonderter Schritt mit optimistischer Revisionspruefung.
Gespeicherte Vorschlaege bleiben bei Reload eines ungespeicherten Entwurfs erhalten.
Additive Rollenauftraege bewahren zwischenzeitlich hinzugefuegte Berechtigungen
und stellen bewusst manuell entfernte Altberechtigungen nicht ungefragt wieder her.
Chat/Rueckfragen bleiben bei lokalen Aenderungen nutzbar: nur freigegebene Werte
des lokalen Entwurfs werden als Modellkontext verwendet. Aufklappen reiner
Detailbereiche veraendert keine Werte; Objekt-Schluesselreihenfolge verursacht
keine falsche Dirty-Anzeige. Authentifizierung, Tenant-/Owner-RLS, Origin/CSRF,
gueltige Netz-/HA-Abhaengigkeiten und separate Cloud-Freigabe bleiben unveraendert.
Ohne die neuen Entwurfsparameter gilt der bisherige API-Speicherpfad unveraendert.

Nachweis (2026-10-13):170 Offline-Assistententests,6 fokussierte PostgreSQL-Tests
und6 Desktop-/Mobil-Browsertests erfolgreich; Build, Typpruefung und
Wissens-/Katalogfrische erfolgreich. Die Browserpruefung deckt HA-Backup-Zone
eu01-2, zwischenzeitliche Editor-/Speicheraenderungen, Konfliktabbruch und
Bestaetigung sowie separates Speichern ab. DNS prueft eine echte TTL-Aenderung
von3600 auf7200 und blendet bereits vorhandene Werte aus. Die vorherige
10/10-Modellqualifikation betrifft die Firewall-Gespraechsfuehrung; der
Uebernahmepfad fuehrt keine neue Modellanfrage aus.

Aktivierung: API und HTTPS-Proxy mit zusammengehoerigem UI-/Backend-Stand
gestartet; HTTPS-Healthcheck erfolgreich. Migration057 ist angewendet; die
beiden historischen Vorschlagsbaselines bleiben NULL. Anzahl und vollstaendige
Konfigurationszeilen sowie alle bisherigen Gespraechsspalten sind laut
aggregierten Pruefsummen unveraendert. Keine Vorschlagsannahme, Cloud-Ausfuehrung
oder automatische Speicherung echter Kundendaten bei der Aktivierung.

<a id="fieldwise-editor-proposals-2026-10-12"></a>

### Feldweise Editor-Vorschlaege (2026-10-12)

Ersetzt die nachfolgende historische Scalar-/Gesamtannahme-Grenze: DNS-, Ordner-
und SNA-Patches werden als einzelne geaenderte Felder mit gespeichertem Wert und
Vorschlag dargestellt, nicht als JSON-Block. Arrays wie Adressbereiche bleiben
ein gemeinsames Feld. POST `/api/v1/configurations/:id/assistant/accept` akzeptiert
optional `selectedFields` mit stabilen Feldkennungen aus dem bestehenden Vorschlag.
Ohne Auswahl gilt weiterhin die bisherige Gesamtannahme. Unbekannte, doppelte,
leere und veraltete Auswahlen werden abgewiesen. Die echte Annahme prueft Compiler,
Rollen, RLS und Revisionen innerhalb derselben Transaktion. Zusammenhaengende
Netzwerkpflichtfelder koennen nur als fachlich gueltige Kombination gespeichert
werden. Nicht ausgewaehlte Vorschlaege bleiben auf die neue Basisrevision gebunden;
keine erneute Modellanfrage erforderlich.

Modellkontext: owner_email und organization_id gehoeren jetzt zu den begrenzten
Grundlagenwerten. Nur die aktuell verifizierte menschliche STACKIT-E-Mail des
aktiven Benutzers wird zusaetzlich bereitgestellt, keine fremde Identitaet oder
Anmeldecredentials. DNS-Kontakt: vorhandenen Kontakt erhalten, sonst Owner aus
gespeicherten Grundlagen, dann verifizierte Login-E-Mail als pruefbares Default
vorschlagen. Unbestaetigte Template-Platzhalter zaehlen nicht als bekannte Kontakte.
Explizite Kontaktangaben haben Vorrang; keine automatische Speicherung.
organization_id darf nur die vom Benutzer ausdruecklich angegebene bestehende UUID
sein: keine Tenant-Bindung, Zugriffsverifikation oder Cloud-Ausfuehrung.

Grundlagenauftraege verwenden keine DNS-Rueckfragen/Netzwerkquellen. DNS-Mehrfeld-
und Grundlagenvorschlaege erhalten deterministische Abschluss-/Speicherhinweise
aus den validierten Feldern. Ihr vorlaeufiger Stream zeigt nur einen Pruefstatus,
keine ungeprueften Modellbehauptungen ueber angeblich gespeicherte Werte.
Die alten Grenzen und Nachweise unten bleiben historisch; #94/A01-A24 weiterhin
nicht vollstaendig qualifiziert.

<a id="local-editor-chat-2026-10-10"></a>

### Lokaler Editor-Chat (2026-10-10)

Einstieg: anmelden, unter Konfigurationen eine gespeicherte aktuelle
Konfiguration oeffnen. Das Panel `Konfigurations-Chat` steht oberhalb des
Editors. Ungespeicherte Aenderungen sperren Sendung und Uebernahme. Antworten
und Rueckfragen erscheinen im Verlauf; ein separater kompletter Scalar-Diff
wird erst mit `Gesamten Vorschlag uebernehmen` zur neuen gespeicherten
Konfigurationsrevision. Keine Veroeffentlichung oder Infrastruktur-Ausfuehrung.

Backend: GET/POST/DELETE `/api/v1/configurations/:id/assistant`, ausdrueckliche
Uebernahme ueber POST `/api/v1/configurations/:id/assistant/accept`.
Bestehende Plattformrechte, aktive Datenbank-Autorisierung, Tenant-/Owner-RLS,
Origin/CSRF und `no-store` gelten. Neue Migration 053 speichert ein Gespraech
je Benutzer und Konfiguration, maximal 40 Nachrichten. Ablauf ist UTC plus
drei Kalendermonate ab Erstellung; Runtime darf die Frist nicht aendern.
Elternloeschung kaskadiert; spaete Modellantworten pruefen Eltern-, Gespraechs-
und Konfigurationsrevision erneut. Ablauf-Cleanup erfolgt bei Zugriff, beim
API-Start und jede Minute; nach Offline-Zeiten vor neuem Zugriff bereinigen.
Restore kompletter Eltern-/Chat-Snapshots und Monatsend-/Lastfaelle sind noch
nicht als vollstaendige Betriebsabnahme qualifiziert.

Der Modellkontext umfasst Metadaten/Regeln, bekannte nicht sensible
Root-Scalarwerte ohne ID-Felder und maximal zwoelf historische Nachrichten.
Keine vollstaendige Konfiguration, Terraform-State oder Credential-Bindings.
Erkennbare Secret-Zuweisungen werden vor Inferenz abgewiesen; diese Heuristik
ist kein allgemeiner DLP- oder Prompt-Injection-Nachweis. Niemals Zugangsdaten
im Chat eingeben. Maximal fuenf laufende Anfragen je API-Prozess, acht Fragen
und acht typgepruefte Scalar-Aenderungen; Timeout/Responsegrenze unveraendert.

Bewusste Anfangsgrenze: keine Strukturmutation komplexer Komponenten, keine
Chat-Auswahl neuer Plattformvorlagen, kein Erstellen/Bearbeiten von Application
Template-Drafts und kein vollstaendiger Konfigurationsanalyse-Kontext. Diese
Anforderungen und die komplette Quellenaufnahme bleiben #94 zugeordnet.
Die bestehende Coverage-Matrix bleibt `not-qualified`, nicht aufgewertet.

Reproduzierbarer lokaler Start mit vorhandenen privaten State-/Schluesseldateien:

```sh
LZC_STACKIT_CLI_CLIENT_APPROVED=true npm run dev:chat
```

Gepinntes Node/npm verwenden. Dieser Start benutzt den vorhandenen lokalen
Login-Starter: neue Migrationen und lokale DB-Rollenpasswortrotation beim
Neustart; Benutzer hat diese lokalen Arbeiten dauerhaft freigegeben. Keine
Modeltoken-/Artifact-Key-Rotation, keine Runner-Aktivierung. Produktionsstart
bleibt opt-in mit `LZC_ASSISTANT_ENABLED=true` und geschuetztem Operator-Binding.

Nachweise: zehn fokussierte Unit-/HTTP-Faelle; kanonischer Gate Lint/Typen/Build,
447 Unit-Passes und 53 umgebungsgebundene Skips; 32 echte PostgreSQL-Faelle.
Vier fokussierte Desktop-/Mobilfaelle fuer Chat und benachbarte Speicherung
bestanden mit `--workers=1 --timeout=60000` (je ca. 1-2 Sekunden). Parallel
traten Desktop-Neulade-/Browser-Session-Timeouts auf; Last-/CI-Budget bleibt
offen. Screenshots geprueft, kein Seitenoverflow; Diff auf Mobil intern scrollbar.
Echter synthetischer autorisierter HTTP-Dialog auf isolierter Testdatenbank:
HTTP 200 in 2649 ms, zwei gespeicherte Nachrichten, ein Vorschlag, null weitere
Fragen; Fortsetzung und ausdrueckliche Uebernahme als Revision 2 bestaetigt.
Keine Benutzerkonfiguration fuer diese Inferenz verwendet.

Lokale Benutzerumgebung danach freigegeben aktiviert: API 3000, Preview 4181,
Callback 8000, Migrationen 051-053 angewendet. Anzahl und Inhalts-/Revisions-
pruefsumme der vorhandenen Konfiguration vor/nach Start identisch. UI/Health
200, anonymer Chat 401. Manuelle Dialogabnahme auf Benutzerkonfiguration offen;
im geteilten Browser vorhandene Sitzung, aber Seite fuer Klick nicht sichtbar.

- Katalog-/Matrixfrische: lokal automatisch pruefbar, kein Modellaufruf.
- Deterministischer Vertrag: Schema, Compiler, Template-Policy, Rechte, Revision,
  Lifecycle und Redaction mit isolierten Unit-/DB-/Browserfaellen pruefen.
- Echte Modell-Evaluation: A01-A24 mit reproduzierbaren Aufgaben und pro Feld
  belegter Abdeckung, einschliesslich realistischer komplexer Kombinationen.
  Inferenz muss ueber den vorhandenen geschuetzten Dev-Zugang qualifiziert werden.
- Betriebsabnahme: Loesch-/Restore-Grenzen und fuenf Sitzungen messen. Antwortzeit-
  Ziele anhand des Spikes festlegen; keine erfundene Latenzzusage.

Grenz-Referenzen sind bekannte Befunde, keine Garantie ihres heutigen Zustands.
Vor Modellfreigabe sind sie gegen den jeweils qualifizierten Source-/Capability-
Stand erneut zu pruefen. Nachweise und Messungen werden #94 zugeordnet; fehlende
KI-Qualifikation blockiert die Behauptung vollstaendiger 1:1-Unterstuetzung.