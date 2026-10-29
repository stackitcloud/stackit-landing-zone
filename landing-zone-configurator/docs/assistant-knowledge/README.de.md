<a id="assistant-service-knowledge"></a>

# Assistant-Servicewissen

[English](README.md) | [Deutsch](README.de.md)

Englisch ist die kanonische, maschinell eingelesene Themensprache.
Deutsche Themenbegleiter sind ausschliesslich menschliche Lesefassungen;
das Manifest liest sie nicht ein. Der Katalog unten bietet Sprachwechsel,
ohne kuratierte Prompt-Quellen zu aendern.

<a id="architecture-contract"></a>

## Architekturvertrag

Freigegebene Architektur vom 2026-10-10: kuratiertes Markdown je Domaene/Service,
striktes Manifest und generiertes Backend-Bundle.
Das urspruengliche SNA-/Zugangsdaten-Paar wird zum vollstaendigen
Themenkatalog unten erweitert.
Kein automatisches Einlesen beliebiger Dokumentation, Websites, Kundendateien,
States, Plaene oder Secrets.
Markdown erklaert Faehigkeiten; Accelerator-Eingabeschemas, Patch-Validierung
und gemeinsamer Compiler entscheiden, was konfigurierbar ist.
Wissen erteilt niemals Berechtigungen oder neue Features.

Massgebliche Quellen:

- `manifest.json`: stabile Themen-ID, Markdown-Datei, Themenversion,
  Pruefdatum, lokale Qualifikation, Feature-Gruppen, Pflichtkennzeichen,
  abgedeckte Root-Eingaben, Abhaengigkeiten, lokale massgebliche Quellpfade,
  externe Referenzen und A01-A24-Szenario-IDs.
- Themen-Markdown: kuratierte Servicefakten, Dialoganforderungen und Beispiele.
- Generierte `knowledge-topics.generated.ts`: deploybarer Snapshot mit
  Themen-/lokalen Quell-SHA-256-Hashes, Engine-Revision und Inhalt.
  Nicht manuell bearbeiten.
- `knowledge.ts`: deterministische Auswahl, globale Regeln, generierte
  Feldmetadaten, Template-Metadaten und vollstaendiger Bundle-Hash.

Editor-Dialog verwendet gewaehlte Feature-Gruppen und deren
Themenabhaengigkeiten.
Zugangsdaten-Grundlagen und Konfigurationslebenszyklus sind immer enthalten.
Template-Beratung erhaelt die begrenzte vollstaendige Themenmenge.
Aktuelle Editor-Anfragen waehlen alle Feature-Gruppen, daher stehen alle
19 Themen bereit; dies ist kein semantisches Retrieval je Nachricht.
Abhaengigkeiten waehlen Wissen aus, aktivieren keine Services.
Es gibt keine Vektordatenbank, modellgesteuertes Retrieval oder
Laufzeit-Dateisystemzugriffe auf Dokumentation.
Das kompilierte API-Artefakt enthaelt den generierten Snapshot.
Thementext wird einmal als vertrauenswuerdige kuratierte Regeln geliefert;
Provenienz bleibt getrennt.
Kundeneingaben/-historie und PIM-Labels bleiben nicht vertrauenswuerdige
Daten, keine Anweisungen.

<a id="topic-delivery-contract"></a>

### Vertrag zur Themenauslieferung

Der generische Editor-Vorschlagspfad uebergab zuvor Themen-/Feldmetadaten
ohne kuratierte Regeltexte.
Das betraf alle 14 Themen mit nativen Editor-Vorschlaegen, nicht nur DNS.
Editor-Vorschlaege und Gespraechsberatung teilen jetzt dieselbe Themenabgrenzung:
aktuelles Thema, transitive Abhaengigkeiten, Pflichtthemen und alle globalen
Regeln.
Themenuebergreifende Editor-Vorschlaege enthalten auch die zustaendigen Themen
jedes exponierten Felds.
Nicht betroffene Thementexte bleiben ausserhalb des Antwortkontexts.
Fehlende Abhaengigkeiten fuehren explizit zum Fehler; eine eingeschraenkte
Feature-Gruppenauswahl bleibt erhalten.

Absichtsklassifikation erhaelt bewusst Themenzusammenfassungen, nicht das
vollstaendige Beratungswissen.
Firewall-Evidenzklassifikation erhaelt ausschliesslich Nutzeraussagen.
Deterministische Felduebersichten und die Policy-Grenze verwenden gepruefte
lokale Vertraege ohne zweiten Modellaufruf.
Starttemplate-Beratung und synthetische Qualifikation behalten ihre
vollstaendigen ausgewaehlten Regeltexte.

Regressionstests pruefen die tatsaechlich ausgehenden Modellanfragen fuer
alle 19 Beratungsthemen und alle 14 Editor-Themen, einschliesslich exakter
Volltexte, indirekter Abhaengigkeiten, Pflicht-/globaler Regeln,
Ausschluss nicht betroffener Themen und themenuebergreifender Vorschlaege.
Diese Tests mit simuliertem Transport beweisen Wissensauslieferung,
nicht faktische Qualitaet einer echten Modellantwort oder
Ausfuehrungsqualifikation.
DNS-Hinweise unterscheiden Primary-/Secondary-Rollen von Sichtbarkeit,
erklaeren beide als autoritativ und benennen das unvollstaendige native
Secondary-Server-Setup.

<a id="real-model-qualification"></a>

### Qualifikation mit echtem Modell

Aenderungen an Servicefakten, Prompts, Wissensauswahl oder
Komponentenvertraegen benoetigen gezielte synthetische Tests gegen
die konfigurierten echten STACKIT-Modelle, nicht nur simulierte Antworten.
Jeden betroffenen Fall mindestens zweimal unabhaengig ausfuehren:

```sh
npm run test:assistant:live -- --topic dns-zones --repeat 2
npm run test:assistant:journey
```

Fuer reine Arbeitsplatz-Zugangsdaten `--local-credentials` anhaengen;
niemals Tokens in Befehle oder Test-Fixtures einfuegen.
Dies liest das dedizierte Testtoken aus dem privaten authentifiziert
verschluesselten Plattform-Recovery-Snapshot ausschliesslich im Speicher;
es faellt niemals auf das Anwendungstoken zurueck.
Provisionierung und expliziter CI-Transfer sind im
[Infrastruktur-Runbook](../../infra/ci/README.de.md) beschrieben.
Der Harness lehnt aktivierte Ausfuehrung ab, verwendet synthetische
Identitaeten/Konfigurationsentwuerfe und ruft niemals Plan/Apply auf.
Vorschlaege werden lokal angewendet, per JSON rundgereicht und als native
tfvars exportiert.
Nachweise binden Ergebnisse an Modell-IDs, Wissens-/Suite-Hashes,
Iteration und Export-Pruefsummen.
Jede fehlgeschlagene Iteration bleibt ein Fehler; Wiederholungen sind keine
Retries. Der Harness erlaubt eine bis drei Iterationen und taktet
Modellanfragen.
Der produktive Client erlaubt genau einen zusaetzlichen Versuch nur fuer
freigegebene temporaere Netzwerkfehler vor Empfang der HTTP-Antwortheader.
Eine zufaellig variierte Wartezeit von 250-500 ms und beide Versuche teilen das
urspruengliche Anfragelimit (standardmaessig 60 Sekunden); ein Abbruch beendet
Wartezeit oder Anfrage. Unterbrochene Antwortinhalte, HTTP-Fehler,
Authentifizierungsfehler und ungueltige Modellantworten werden nicht wiederholt.
Dies wiederholt ausschliesslich Inferenz, niemals Plan/Apply oder das Speichern
einer Konfiguration; bei verlorener Antwort kann die erste Inferenz trotzdem
bereits upstream verarbeitet worden sein.
Jeder erkannte Transportfehler protokolliert seinen freigegebenen Fehlercode,
die Versuchsnummer und die Wiederholungsentscheidung in Anwendungslogs und
synthetischen Nachweisen, niemals rohe Fehler, Tokens oder Anfrageinhalte.
Eine endgueltig gescheiterte Anfrage laesst ihre Iteration weiterhin fehlschlagen.
Der Harness verwendet dieselbe produktive Wiederholungsregel, keinen
CI-Sonderweg; diese Versuche ersetzen weder die geforderten unabhaengigen
Wiederholungen noch loeschen sie fruehere fehlgeschlagene Nachweise.
CI verwendet fuer Antwort- und Intent-Modell die Anwendungsdefaults,
ohne CI-exklusiven Klassifikator-Override.
Effektive Modell-IDs stehen in jedem Nachweis.
Qualifikation eines alternativen Modells qualifiziert nicht das
konfigurierte Anwendungsmodell.

Aktive Firewall-Entwuerfe und mehrstufige Firewall-Dialoge verwenden immer
den spezialisierten Klassifikator fuer Einrichtungsumfang und Belege.
Ein allgemeiner Feldhinweis wie `ha` darf ihn nicht umgehen: Eine breite
Einrichtungsfortsetzung mit HA behaelt die noch offenen Entscheidungen zu
Verkehr, Kapazitaet und Unterbrechung bei. Eine ausdrueckliche gezielte native
Aenderung bleibt auch nach einem frueheren breiten Einrichtungsdialog eine
Feldaenderung und erzeugt keine fremden Einrichtungsfragen.
Gibt es keine begrenzten Nutzerbeleg-Fragmente, erlauben Belegfelder nur null
statt einer leeren Aufzaehlung.

Beschreibungen von Intent- und Evidenzschemas werden auch im Systemkontext
des Klassifikators gesendet, nicht nur als Structured-Decoding-Beschraenkung.
Antwortgenerierung erhaelt geprueftes Feld-/Themenwissen ohne zweiten
vollstaendigen Schema-Dump.
Fuer eine explizit benannte zusaetzliche DNS-Zone sind quellengebundene
angeforderte Felder im Vorschlagsschema dieser Zone verpflichtend.
Ein angeforderter Kontakt darf weder nur in der Erklaerung genannt noch
still weggelassen werden; Felder fuer eine Zone sind nicht in anderen
Zonen verpflichtend.
Laufzeitpruefungen fuer Quelle, Umfang und native Konfiguration bleiben
bestehen.

DNS-Faelle pruefen Rollenbedeutung, autoritative Antworten,
Trennung von Sichtbarkeit, Primary-Empfehlung, unvollstaendiges natives
Secondary-Setup, Korrektur frueherer Falschaussagen und Erhalt beim
Hinzufuegen einer Zone.
Semantische Pruefungen lehnen irrefuehrende Antworten und reine
Schlagwortantworten ab, bleiben aber begrenzte Regressionskriterien
statt Beweis universeller faktischer Korrektheit.
Die kontinuierliche themenuebergreifende Reise prueft auch die
DNS-Erklaerung nach frueheren Konfigurationsschritten und dass Beratung
den Entwurf nicht veraendert.

Standardmaessige `qualified`-Release-Builds haengen vom wiederverwendbaren Live-Workflow ab:
Alle Themen laufen zweimal, danach folgt der kontinuierliche Dialog,
auch wenn einzelne Modellfaelle scheitern.
Rohe synthetische Nachweise bleiben CI-Artefakte.
Promotion benoetigt erfolgreiche Live-Qualifikation und Build-Job des
Original-Builds; aeltere Builds ohne diesen Nachweis koennen Qualifikation
nicht umgehen.
Fehlendes Token, nicht verfuegbares Modell oder fehlgeschlagenes Kriterium
blockieren Qualifikation, kein stilles Ueberspringen.
Allgemeine Beratung beendet ihren zusammengefuehrten vertrauenswuerdigen
Systemkontext mit einer expliziten Anweisung zur Antwortvollstaendigkeit:
Die Erklaerung muss die tatsaechlich angeforderten Fakten, nativen Defaults,
Grenzen und Ausschluesse enthalten, nicht nur eine fehlende Liste
ankuendigen oder auf Vertragsmetadaten verweisen.
Rueckfragen ersetzen keine faktische Antwort.
Kompakte Stichpunkte je Feldfamilie zielen auf hoechstens 2400 Zeichen
innerhalb des unveraenderten 3000-Zeichen-Antwortschemas.
Gleichwertige regionale Formen gruppieren, statt sie bis zum Abschneiden
zu wiederholen.
Reine Informationsuebersichten zu Feldern/Defaults/Grenzen benoetigen keine
Konfigurationsentscheidungen und liefern keine Rueckfragen;
andere Beratung erfragt weiterhin nur fehlende fachliche Entscheidungen,
niemals geschuetzte Eingaben.
Der begrenzte Firewall-Anforderungsdialog behaelt seinen eigenen
Kurzantwortvertrag.
Transporttests pruefen Auslieferung dieser Anweisung; faktische Kriterien
am echten Modell entscheiden weiter ueber Qualifikation der Antworten.

Fuer native Felduebersichten waehlt semantische Absichtsklassifikation
die bestehende Antwort aus geprueften Metadaten, sofern verfuegbar,
statt denselben statischen Vertrag erneut generieren zu lassen.
VPN, DevOps Git und DNS-Feld-/Rollensemantik verwenden diesen Pfad mit
getesteter 2400-Zeichen-Grenze, ohne Fragen oder Entwurfsaenderungen,
mit nativen Routing-/Plan-Defaults und getrennter geschuetzter PSK-Bindung.
Das faktische Orakel fordert diese Details und lehnt erfundene
`static`-/`dynamic`-Routing-Typen ab.
DevOps verlangt native Felder und die Grenze `git_flavor=null`
(keine Instanz), ohne einen aktivierten Default zu suggerieren.
Dies ersetzt weder aktuelle Verfuegbarkeitspruefungen noch autorisiert es
Konfiguration; nicht unterstuetzte Uebersichtsthemen behalten den
Beratungspfad.
DNS-Rollenerklaerungen behalten die bestehenden Kriterien zu
Primary/Secondary, autoritativer Rolle, Sichtbarkeit und nativer
Secondary-Konfigurationsgrenze bei, einschliesslich Korrektur frueherer
irrefuehrender Beratung.
Tatsaechliches DNS-Setup erfolgt weiter ueber den bestehenden pruefbaren
Vorschlagsablauf.

CI benoetigt `LZC_MODEL_SERVING_TOKEN` in der geschuetzten Umgebung
`assistant-tests`.
Lokale Nachweise zertifizieren diese entfernte Umgebung nicht und
autorisieren kein Deployment.
CI-Qualifikationsjobs teilen eine nicht abbrechende Concurrency-Gruppe,
um konkurrierende Modellanfragen manueller und Release-Laeufe zu vermeiden.
Faktische Kriterien bei neuen Faehigkeiten pruefen/erweitern;
offene oder mehrdeutige Antworten benoetigen weiter menschliche Pruefung.

<a id="evidence-and-release-status"></a>

### Evidenz und Release-Status

Laufspezifische Ergebnisse gehoeren in quellengebundene Nachweise,
CI-Artefakte und den zugehoerigen Pull Request, nicht in ein permanentes
oeffentliches Abnahmeverzeichnis.
Fehlgeschlagene Experimente als Evidenz erhalten.
Ein spaeterer erfolgreicher Lauf qualifiziert nur seine eigene Quelle,
loescht keinen frueheren Fehler und zertifiziert kein anderes Deployment.
Der geschuetzte `qualified`-Release-Workflow wiederholt Qualifikation fuer seinen
exakten Build; lokale Ergebnisse allein autorisieren niemals Promotion
oder Deployment.

<a id="complete-topic-catalogue"></a>

### Dev-Release ohne Live-Qualifikation des Assistant

Bei Model-Serving-Ausfällen unter
**Actions > Configurator Release > Run workflow** auf Branch **main** ausdrücklich
**release_mode=dev-skip-assistant-qualification** wählen. **build_only** nicht
anhaken, **release_run_id** leer lassen und **runner_pool_size=1** setzen.
Den genauen Quellstand/Lauf prüfen und nach allen anwendbaren Build-/
Veröffentlichungsprüfungen die bestehende Umgebung **lzc-dev-release** freigeben.
Diese ausdrückliche Dev-Ausnahme überspringt nur den Live-Qualifikationsjob des
Assistant. `LZC_ASSISTANT_ENABLED` übernimmt weiterhin die bestehende
Umgebungseinstellung; ein konfigurierter Assistant bleibt aktiviert, ohne neuen
Live-Qualifikationsnachweis für diesen Release. Ob Inferenz funktioniert, hängt
weiterhin von der Modellverfügbarkeit ab. Dies gilt nicht als erfolgreiche
Qualifikation und löscht keine früheren fehlgeschlagenen Nachweise. Alle übrigen
Prüfungen, Migrationen, geschützten Tags und Dev-Zielprüfungen bleiben erhalten.
Gespräche und Vorschläge bleiben gespeichert; bestehende Laufzeitvalidierung,
Autorisierung und Revisionsprüfungen bleiben unverändert. Der Modus autorisiert
weder Produktion noch Kunden-Infrastruktur-Apply.

Das Manifest vermerkt die Beschränkung auf Dev und `assistantQualified=false`;
der Build-Job heißt `build-dev-skip-assistant-qualification`. Diese Artefakte
können nicht mit `release_run_id` übernommen werden, auch nicht als qualifizierter
Release. Nach einem Deploymentfehler sind Untersuchung und ein neuer manueller
Lauf nötig. `build_only=true` erlaubt einen Build zur Prüfung, dessen Artefakt
anschließend nicht übernommen werden kann. Ein qualifizierter Release erfordert
weiterhin einen neuen Lauf mit **release_mode=qualified** und vollständiger
quellstandsgebundener Live-Qualifikation. Der Standardpfad **qualified** und dessen
Übernahmebedingungen bleiben unverändert.


## Vollstaendiger Themenkatalog

| Thema | Umfang | Sprachen |
| --- | --- | --- |
| credential-foundations | Provider-, Workload- und native Ausfuehrungsbindungen | [EN](credential-foundations.md) / [DE](credential-foundations.de.md) |
| identity-foundations | Organisation, Owner, Namen/Codes, Region, Labels, Uebergabe-Namespace | [EN](identity-foundations.md) / [DE](identity-foundations.de.md) |
| governance-folders | Eltern, Ordnerrollen, Ownership und Audit-Rechte | [EN](governance-folders.md) / [DE](governance-folders.de.md) |
| management-state | Verpflichtendes Management-Projekt, State, Secrets Manager und Betriebsidentitaeten | [EN](management-state.md) / [DE](management-state.de.md) |
| observability | Zentrale, Projekt- und Cluster-Telemetrie/Aufbewahrung | [EN](observability.md) / [DE](observability.de.md) |
| audit-logs | Routing, Archiv, Object Lock und Umfang | [EN](audit-logs.md) / [DE](audit-logs.de.md) |
| federated-identities | Issuer/Assertions fuer Management-Betriebsidentitaet | [EN](federated-identities.md) / [DE](federated-identities.de.md) |
| stackit-network-components | SNA, Pools, Transfer, Praefixe und regionale Formen | [EN](sna.md) / [DE](sna.de.md) |
| dns-zones | Area-Zonen, Resolver-Auswahl und DNS-Abhaengigkeiten | [EN](dns-zones.md) / [DE](dns-zones.de.md) |
| firewall-infrastructure | OPNsense-Appliance, LAN/WAN, Zonen, Dimensionierung und HA | [EN](firewall-infrastructure.md) / [DE](firewall-infrastructure.de.md) |
| firewall-policy | Aliases, Routen, Regeln, NAT und Port-Forwards | [EN](firewall-policy.md) / [DE](firewall-policy.de.md) |
| firewall-access-bootstrap | Administration, API-Bindungen und Bootstrap-Phasen | [EN](firewall-access-bootstrap.md) / [DE](firewall-access-bootstrap.de.md) |
| vpn | Gateway/Plan, Peer/Tunnel, Routing und IKE-/IPsec-Grenzen | [EN](vpn.md) / [DE](vpn.de.md) |
| devops-git | Managed-Git-Service und ACLs | [EN](devops-git.md) / [DE](devops-git.de.md) |
| platform-kubernetes | SKE/Node-Pools, DNS, Monitoring, KMS und Bastion | [EN](platform-kubernetes.md) / [DE](platform-kubernetes.de.md) |
| project-templates | Public-/Corporate-Projekte, Rollen, Services und Anwendungsparameter | [EN](project-templates.md) / [DE](project-templates.de.md) |
| sandbox-projects | Sandbox-Ownership und native Projektliste | [EN](sandbox-projects.md) / [DE](sandbox-projects.de.md) |
| namespace-services | Namespace/RBAC, Secret-Policies, Break-Glass und explizite Demos | [EN](namespace-services.md) / [DE](namespace-services.de.md) |
| configuration-lifecycle | Workspace, Beratungsuebergabe, Revision/Ablauf, Versionen und Ausfuehrungsgates | [EN](configuration-lifecycle.md) / [DE](configuration-lifecycle.de.md) |

Jede aktuelle Root-Eingabe hat mindestens ein Manifest-Thema;
der Generator lehnt fehlende/unbekannte Eingaben ab.
Der bestehende Katalog mit 501 Pfaden bleibt die Feldautoritaet.
Eine Root-Zuordnung beweist keinen qualifizierten Dialog fuer jedes
verschachtelte Feld.
A01-A24-Zuordnungen decken den Szenariokatalog ab, nicht erfolgreiche Tests
fuer alle Szenarien.
Neue Root-Eingaben benoetigen explizite gepruefte Themenzuordnungen.
Neue Child-Moduloptionen benoetigen weiterhin verifizierte
Root-Verdrahtung, bevor sie beworben werden.

Template-Werte sind niemals Nutzerzustimmung zur Konfiguration oder
Aktivierung optionaler Services.
Firewall spaeter bedeutet nicht Firewall jetzt deployen.
Bestehende geerbte Einstellungen von angeforderten Aenderungen unterscheiden
und inkompatible Einstellungen kennzeichnen.
Ein vollstaendiger nativer Apply umfasst weiter Pflichtgrundlagen und
jede aktivierte Komponente; ein fokussierter Chatschritt ist keine
gezielte Terraform-Ausfuehrung.

<a id="fixed-topic-structure"></a>

## Feste Themenstruktur

Jedes Thema muss einen H1-Titel und diese H2-Abschnitte in dieser Reihenfolge
haben. Keine Abschnitte hinzufuegen, umbenennen oder weglassen;
bei Bedarf H3 innerhalb eines Abschnitts verwenden.
Die maschinelle englische Vorlage bleibt unveraendert:

```markdown
# Service Name

## Purpose
User needs this service can solve.

## Accelerator Contract
Native fields, supported forms and compiler/patch restrictions.

## Dependencies
Relationships to other components and declared topic dependencies.

## Dialogue
Business questions, existing-context reuse and permissible assumptions.

## Examples
Synthetic user requirement and native configuration, never secret values.

## Limits
Unsupported capabilities and separate validation/execution gates.

## Credentials
Required external bindings and safe workflow, never credential values.

## Sources
Interpretation of manifest references, review triggers and existing tests.
```

Praezise Fakten schreiben, keine umfassende Enzyklopaedie.
Mathematische Ableitung, Nutzerannahmen, implementierte Funktionalitaet und
aktuelle Betriebsfakten trennen.
Listen aktueller SKUs, Preise, Flavors und Versionen gehoeren in autorisierte
aktuelle Kataloge und oeffentliches PIM, nicht in kopierte statische Tabellen.
Servicespezifische Bindungen muessen mit dem nativen Accelerator-Vertrag
funktionieren, nicht von verstecktem Configurator-Zustand abhaengen.
Beispiele ohne Kundenkennungen oder Secrets verwenden.
Bestehende unbekannte Importfelder muessen ausserhalb des Modellkontexts
erhalten bleiben.

<a id="adding-a-topic"></a>

## Thema hinzufuegen

1. Zuerst Accelerator-/Modul- und gemeinsame Feature-Vertraege pruefen.
   Fehlende Features benoetigen Konzept, Modul/Schema, Validierung,
   Import/Export, Editor, Assistant, Zugangsdaten und Tests,
   nicht nur eine Wissensdatei.
2. Thema mit obiger Struktur anlegen, danach Manifest-Eintrag.
   Bestehende Dokumentation als massgebliche Quellen wiederverwenden,
   statt jedes Detail zu duplizieren.
3. Bestehende Root-Eingaben, Feature-Gruppen und A01-A24-Szenarien zuweisen.
   Explizite Abhaengigkeits-IDs ergaenzen; unbekannte Abhaengigkeiten und
   Zyklen scheitern.
   Verpflichtende Zugangsdaten-Grundlagen und Konfigurationslebenszyklus
   duerfen nicht entfernt werden.
   IDs globaler Vertragsregeln nicht als Themen-IDs wiederverwenden.
4. Quellen/Inhalte pruefen, `version/checkedOn` aktualisieren und das Bundle
   aus dem App-Verzeichnis mit der gepinnten Repository-Toolchain generieren:

```sh
npm run knowledge:generate
npm run knowledge:check
npm run check
```

5. Markdown und generierte Aenderungen pruefen, fokussierte Verhaltenstests
   in bestehenden Suites ergaenzen und einen synthetischen
   Modell-zu-nativem-Export-Roundtrip qualifizieren.
   Generierung und gruener Test sind kein geprueftes Produktionsrelease.

Gepruefte Kontextbudget-Entscheidung fuer vollen Umfang vom 2026-10-10:
maximal 20 Themen, 8000 Zeichen je Thema, insgesamt 48000 Zeichen,
acht Abhaengigkeiten/Gruppen je Thema und zwoelf lokale Quellreferenzen.
Der 19-Themen-Katalog passt ohne Abschneiden; gemeinsame Erklaerungen
wurden gekuerzt.
Erforderliches Wissen nicht still abschneiden.
Grenzen nur mit gepruefter Kontextbudget-Entscheidung erhoehen.
Externe Links werden erfasst, aber weder vom Generator noch zur Laufzeit
geladen.
Pruefdaten sind von Autoren gepflegte Review-Metadaten, keine Behauptung
ueber kuerzliches Abrufen einer externen Seite.

<a id="versioning-and-acceptance"></a>

## Versionierung und Annahme

<a id="provisional-response-streaming"></a>

### Vorlaeufiges Antwort-Streaming

Beide Chats fordern eine optionale `application/x-ndjson`-POST-Antwort an.
Der Modellclient verarbeitet begrenzte SSE-Ereignisse mit
`eventsource-parser` und unvollstaendiges JSON mit `partial-json`;
nur vorlaeufiger `explanation`-Text wird weitergeleitet.
Teiltext ist sichtbar ungeprueft, niemals ein gespeicherter/annehmbarer
Vorschlag.
Vollstaendig validiertes JSON durchlaeuft vor Speicherung und finalem
UI-Ereignis weiterhin bestehende Modell-, Feld-, Umfangs-, native
Compiler-, Autorisierungs-, Revisions- und Ablaufpruefungen.
Unterbrochene, uebergrosse, fehlerhafte oder vom falschen Modell stammende
Streams scheitern geschlossen.
Verbindungsabbrueche brechen Modellanfragen ab und werden vor Speicherung
geprueft.
Bestehende JSON-Clients bleiben unterstuetzt; kein automatischer Retry
oder Ausfuehrung.
Beide Nachrichtencontainer scrollen bei Historienaenderungen und
vorlaeufigen Textupdates ans Ende.

Optionales `LZC_MODEL_SERVING_INTENT_MODEL` waehlt nur den Klassifikator;
`LZC_MODEL_SERVING_MODEL` waehlt weiterhin Antworten.
Lokale Testaktivierung am 2026-10-11 nutzt mit expliziter Nutzererlaubnis
GPT-OSS-120B fuer Intent plus etabliertes Qwen-Antwortmodell.
Dies ist keine Produktions- oder vollstaendige Dialogqualifikation.
Streaming zeigt Text frueher, nicht vertrauenswuerdigeren Text.

<a id="conversation-and-change-contracts"></a>

### Gespraechs- und Aenderungsvertraege

Fragen exponieren begrenzte `text`, `options`, `multiple`:
bis zu sechs verschiedene Auswahltexte mit 160 Zeichen,
native Radio-/Checkbox-Auswahl und stets verfuegbare Freitextantwort.
Neuer Inferenztransport verlangt strukturierte Fragen;
gespeicherte Altfragen ohne Optionen bleiben gueltig.
Optionen durchlaufen ebenfalls Pruefungen auf geschuetzte Fragen.
Auswahl bereitet nur der Frage zugeordneten Nutzertext vor;
sie sendet, akzeptiert oder veraendert niemals automatisch.
Bestehender Compose-Text bleibt erhalten; die gemeinsame Grenze von
4000 Zeichen wird vor Einfuegen geprueft.
Auswahl erscheint nur aus vollstaendiger validierter Antwort,
nicht aus vorlaeufigem Streaming-Text.

Diff-Checkboxen bereiten eine Anfrage fuer einen neuen Vorschlag mit
gewaehlten Pfaden/Werten vor.
Es gibt weder direkten Teilannahme-Endpoint noch Mutation ausgewaehlter Felder.
Gesamtannahme ist deaktiviert, solange eine Teilmenge ausgewaehlt ist.
Das neue Ergebnis wird normal validiert/geprueft; Nutzer muessen seinen
gesamten Diff pruefen und explizit annehmen.
Zusammengehoerige native Aenderungen bleiben atomar;
ein Komponenten-Map-Eintrag wird nicht in einzelne verschachtelte Felder
zerlegt. Keine Ausfuehrungserlaubnis.

Konfigurationsdialog hat zwei begrenzte Modellaufrufe:
zuerst Thema/Modus anhand gespeicherter Nutzer-/Assistant-Historie
klassifizieren, danach unter backend-eigenen Faehigkeiten antworten.
Der Klassifikator kann keine Berechtigungen erteilen.
Folgefragen muessen kein Themenschlagwort wiederholen;
explizite Themenwechsel uebersteuern Historie.
Die vollstaendige gespeicherte Nutzerhistorie begleitet auch Beratung,
damit fruehere Anforderungen nach dem Fenster letzter Beitraege nicht
verschwinden.
Assistant-Vorschlaege und Template-Defaults sind keine Zustimmung.
Firewall-Planung erfasst exakte Nutzerzitate fuer Traffic, Kapazitaet
und Betrieb.
Backend lehnt Zitate ab, die nicht in Nutzernachrichten vorkommen,
und waehlt die naechste offene Entscheidung/den Pfad deterministisch.
Zitatkategorisierung bleibt Modellinterpretation, kein Nachweis der
Deployment-Eignung.
Beratungsanfragen erhalten nur relevante Themen/Abhaengigkeiten plus
Pflichtwissen, nicht alle Services;
Firewall-Dimensionierung ist von Managed-VPN-Produktplaenen getrennt.

Feldvertraege unterscheiden Nutzerentscheidungen von betreiberverwalteten
Zugangsdetails.
Nur explizit aufgefuehrte skalare Vorschlaege fuer Firmenname/-code/Region,
reine Namensupdates bestehender `rm_folders` und native SNA-Vorschlaege
sind unterstuetzt; keine pauschale Skalar-/Strukturerlaubnis.
Identitaetswerte benoetigen woertliche Nutzerevidenz, sofern der Nutzer
Firmenname/-code oder Ordnernamen nicht explizit zur Auswahl delegiert.
Solche Delegation referenziert eine originale Nutzernachricht ueber
eine vom Backend aufgezaehlte Quell-ID, niemals ein modellumgeschriebenes
Zitat oder einen Assistant-Beitrag.
Nicht leere delegierte Pfade benoetigen eine bestehende Nutzerquelle.
Diese begrenzte semantische Klassifikation ist weder allgemeine Zustimmung
noch Deployment-Autorisierung.
Ordnernamen haben 1-40 Zeichen; Schluessel, Owner, Reader, Beschreibungen
und Identitaeten bleiben erhalten.
Implizite native Ordnerdefaults werden nur als Namen projiziert;
explizit leere Maps werden nicht ersetzt.
Neue Ordner, Cloud-IDs, Regionsauswahl, IAM und Betreiberzugangseinstellungen
sind nicht delegiert.
Admin-Account, API-Secret-Version und Bootstrap sind von Chatfragen/
-aenderungen ausgeschlossen, auch bei Annahme aelterer Vorschlaege.
Bootstrap bedeutet Einrichtung initialen Management-Zugangs,
nicht Firewall-HA-Aktivierung oder Deployment-Autorisierung.

Firewall-Beratung uebersetzt Traffic-Umfang, Kapazitaet und
Ausfall/Betrieb in menschliche Entscheidungen.
Die modellgenerierte Erklaerung ist auf 800 Zeichen und hoechstens eine
native Entscheidungsfrage begrenzt.
Kein fester Antwortersatz.
Andere Komponententhemen bleiben beratend, sofern das Backend keinen
expliziten Translator hat.
Dies ist ein Firewall-Dialogpilot, kein vollstaendiger semantischer
Konfigurationscompiler oder produktionsqualifizierter
Gespraechszustandsautomat.
Zwei Inferenzaufrufe erhoehen Latenz; persistierte Absichtszusammenfassungen
und vollstaendige Lastqualifikation bleiben offen.

Bundle-Hash umfasst kuratierten Inhalt, Manifest-Metadaten, Engine-Revision
und lokale Quellfingerprints.
Eine Quellaenderung macht den generierten Snapshot veraltet;
die verpflichtende Pruefung scheitert.
Neugenerierung muss auf Quellpruefung folgen, nicht veraenderte Quellen
still massgeblich machen.
Kein automatisches Update bei Build/Start.
Wissensaenderungen benoetigen kein neues Gespraech.
Jede neue Nachricht verwendet das aktuelle Bundle und erhaelt Historie,
Identitaet und urspruenglichen Ablaufzeitpunkt.
Die neue Antwort ersetzt Vorschlag und Wissenshash atomar.
Alte Vorschlaege bleiben veraltet und koennen vor Neugenerierung mit
aktuellem Wissen nicht angenommen werden.
Keine Loeschung, Ablaufverlaengerung oder stille Vorschlagsannahme.

Alle Themen bleiben `local-draft-not-reviewed-release`.
Quellen sind explizit zugelassene lokale Terraform-, kuratierte Markdown-
und Domaenen-/API-TypeScript-Dateien;
nur Fingerprints, keine Quelldateiinhalte, werden als Provenienz gesendet.
Keine Umgebungs-, Zugangsdaten- oder State-Dateien sind Quelleingaben.
Vollstaendiges externes Quellen-Retrieval, gepruefte historische
Wissensreleases, automatische Promotion und vollstaendige
A01-A24-Gespraechsqualifikation sind mit dieser Architektur nicht implementiert.
Kuenftige Themenpartitionierung soll vor Einfuehrung von RAG explizit
und testbar sein.

### DNS-Kontext bei der Intent-Einstufung

Die DNS-Einstufung erhält zusätzlich stabile gespeicherte Zonenschlüssel und
validierte Angaben dazu, ob Domain, Anzeigename, Beschreibung und Kontakt vorhanden
sind, sowie zur Verfügbarkeit bestätigter Owner-/Benutzerkontakte. Tatsächliche
Domain-/Kontaktwerte, unbekannte Felder und Zugangsdaten sind aus diesem zusätzlichen
Klassifikationskontext ausgeschlossen. Der Serving-Vertrag verlangt eine explizite
DNS-Aufgabenentscheidung statt des bisherigen Parser-Standardwerts. Eine
semantische Entscheidung `remaining-settings` verwendet den Entwurfsmodus, auch wenn
der Klassifikator widersprüchlich Advice gemeldet hat. Vorhandene Domains und
Metadaten sind keine offenen Setup-Entscheidungen. Informationsfragen und ausdrücklich
änderungsfreie Fragen bleiben Advice. Kontaktquelle, Erhalt bestehender Werte,
Vorschlagsvalidierung und ausdrückliche Übernahme werden weiterhin geprüft.

Firewall-Zugangs-/Bootstrap-Übersichten nutzen nach semantischer Absichtserkennung ebenfalls geprüfte native Feldmetadaten und begrenzte Zugangs-/Phasenfakten. Dadurch entfällt für diese feste Übersicht ein zweiter generativer Aufruf. Admin-Anmeldung, API-Zugangsdaten und geschützte Operator-Bindungen bleiben getrennt; die Übersicht aktiviert keinen Bootstrap, liest keine Secrets und startet keine Ausführung. Andere Beratung bleibt im bisherigen themengebundenen Generierungspfad.

Beratung zu Template-Version, Plattformvertrag und Ausführungsquelle verwendet drei abgeschlossene semantische Aufgaben. Nur aktuelle Informationsfragen im Thema configuration-lifecycle wählen die geprüften, begrenzten Ablaufbeschreibungen; historische Absichten, Vorschlagsaufträge und andere Themen tun dies nicht. Diese Antworten erklären erhaltene Identitäten, ausdrückliche Bindung, frischen Plan und separaten Apply sowie die unterschiedlichen Grenzen gemeinsamer Plattform und Recovery ohne zweiten generativen Aufruf. Sie lesen oder verändern keine Bestellung. Andere Beratung behält die themengebundene Antwortgenerierung.

SNA-Feld-/Default-Beratung verwendet denselben geprüften Übersichtspfad: native Einzel-/Map-/Regionalformen, IPv4-Pools und Transfernetze, geordnete Subnetzpräfixe, Resolver-Defaults und regionale Corporate-Bezüge. Die Antwort enthält weder Einrichtungsfragebogen noch Entwurfsänderungen oder Kapazitäts-/Verfügbarkeitszusagen. SNA-Einrichtung und kombinierte Firewall-Aufträge behalten ihre bestehenden Vorschlags- und Umfangsprüfungen. Der echte Modellfall verlangt die nativen Felder und weist Einrichtungsrückfragen ab; eine Diagnoseantwort ist kein Qualifikationsnachweis.

Öffentliche Owner-Auswahlen werden als gebundene Identitätsmetadaten geprüft, nicht als Zugangsdatenfragen. Nur exakt erzeugte deutsche/englische Owner-Auswahllabel mit einer vorbereiteten, an den aktuellen Schlüssel gebundenen Plattform-Service-Account-Adresse oder der verifiziert angemeldeten E-Mail-Adresse werden von den Schlüsselwortprüfungen für Fragen ausgenommen. Fragetext, unbekannte/veränderte Optionen, Prüfungen auf geschützte Werte und alle gewöhnlichen Aufrufer behalten die bestehenden Schranken. Senden, Vorschau/Rebase und Übernahme lesen den gebundenen Identitätskontext erneut; ein gewechselter Schlüssel oder fremdes Profil kann eine gespeicherte Auswahl nicht bestätigen. Synthetische Fälle für gemischte Templates prüfen auch Plattformkonten mit Bootstrap im Namen.

Template-Rechteprofile werden pro Template als vollständige Einheit geprüft und ausgewählt: Schemaversion, Modus, initialer Owner und beide Rechtelisten bleiben zusammen. So bleiben Pflichtangaben in Vorschau und Übernahme erhalten und gleichzeitige Profiländerungen werden erkannt; andere Templates und Einstellungen bleiben separat auswählbar.
