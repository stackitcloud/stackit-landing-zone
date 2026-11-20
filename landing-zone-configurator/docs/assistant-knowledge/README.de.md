<a id="assistant-service-knowledge"></a>

# Assistant-Servicewissen
Der [gemeinsame Vertrag zur Service-Beratung](../assistant-service-guidance.de.md)
gilt für alle Themen. Editor und Assistant teilen dieselbe Feld-Katalog-Zuordnung;
Auswahlfragen nutzen serverseitig erzeugte Projekt-/Regionsoptionen,
Beschreibungen und zugeordnete PIM-Merkmale. Auswahloberfläche, Entwurfshinweise
und geprüfte englische Feldübersichten sind gemeinsames Verhalten. Neue Services
erweitern Zuordnung/Adapter und geprüfte Fakten statt einer weiteren eigenen
Rückfragenoberfläche.

[English](README.md) | [Deutsch](README.de.md)

Englisch ist die kanonische, maschinell eingelesene Themensprache.
Deutsche Themenbegleiter sind ausschliesslich menschliche Lesefassungen;
das Manifest liest sie nicht ein. Der Katalog unten bietet Sprachwechsel,
ohne kuratierte Prompt-Quellen zu aendern.

<a id="architecture-contract"></a>

## Architekturvertrag

Kuratiertes Markdown je Service, ein striktes Manifest und ein generiertes
Backend-Bundle bilden die Wissensgrundlage. Beliebige Webseiten, Kundendateien,
States, Pläne und Secrets werden nicht automatisch eingelesen. Wissen erteilt
keine Berechtigungen. Native Schemas, Vorschlagsvalidierung und Compiler bestimmen,
was konfigurierbar ist.

Maßgebliche Quellen sind `manifest.json` mit Themen, Versionen, Feldbindung und
Quellpfaden; Themen-Markdown mit geprüften Fakten; die generierte
`knowledge-topics.generated.ts` mit SHA-256 und Engine-Revision sowie `knowledge.ts`
mit globalen Regeln, Feldmetadaten, Template-Metadaten und Bundle-Hash.

Der aktuelle Editor-Chat folgt dem [gemeinsamen modellgesteuerten Beratungsablauf](../assistant-consultation.de.md).
Das Modell liest gezielt kuratiertes Wissen, native Felder und Defaults sowie
Projektkataloge und erhält Rückmeldungen des Vorschlagsvalidators. Eine gemeinsame
inhaltliche Schlussprüfung verwendet den tatsächlichen Compiler-Diff. Separate
Service-Intent-Klassifizierer und feste Produktdialoge werden dort nicht verwendet.
Pflichtwissen und Abhängigkeiten bleiben maßgeblich. Alle 19 Themen stehen im
Rahmen der gewählten Feature-Gruppen bereit. Pflichtregeln und der aktive Gesprächsstand
starten die Beratung; native Werkzeuge lesen Servicewissen, Feldmetadaten, aktuelle
öffentliche Werte und Katalogdaten. Bereits gelieferte Regeln werden referenziert. Konfigurationspfade wie `rm_folders[*].name` begrenzen Daten,
ohne Ordner-IAM-Metadaten zu übertragen. Die API enthält den kompilierten Snapshot
und kann keine beliebigen Laufzeitdateien, URLs oder Secrets lesen.

Quellgebundener Gesprächskontext behält bestätigte Anforderungen und offene Fragen.
Die Browser-Sprache steuert Antworten. Ein gemeinsamer Auswerter vergleicht
numerische Anforderungen mit Angeboten und geprüften Grenzen. Eine eindeutig
passende Empfehlung bleibt sichtbar und verlangt keine zusätzliche Bestätigung.
Default-Wünsche werden mit echten nativen Werten einschließlich null/Weglassen
vorgeschlagen. Tatsächliche native Defaults dürfen auch als sichtbare Annahmen in
einem nicht angewendeten Vorschlag erscheinen. Ausdrückliche Einschränkungen und
offenzuhaltende Entscheidungen haben Vorrang; offene Fragen sind keine Zustimmung.
Der Vorschlag zeigt die verwendeten Defaults zur Prüfung.

Ordnernamen ändern keine stabilen Schlüssel, Elternbindungen, Rechte oder
Identitäten. Quellprüfung, geschützte Felder, Compiler, Mandant, Revision und
getrenntes Save/Plan/Apply bleiben maßgeblich. Das Modell erklärt Git-Erreichbarkeit,
Nutzergrenzen und State-Koordination anhand gelieferter Fakten statt Formulartexten.

Der frühere Controller bleibt vorübergehend als `LegacyAssistantModelServing` für
gekennzeichnete historische Vergleichstests und die separate Template-Beratung
erhalten. Diese Tests qualifizieren den neuen Editor-Pfad nicht. Werkzeugvertrag,
Fristen, privater Kontext und Übergangsnachweise stehen im Beratungsdokument.

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

Der Editor-Chat streamt nur die abschließend validierte Erklärung. Werkzeugschritte
und ungeprüfte Vorschläge werden nicht als Beratung gestreamt. NDJSON- und JSON-
Aufrufe bleiben unterstützt; Abbruch und Antwortgrenzen gelten weiterhin. Die
separate historische Template-Beratung behält ihren begrenzten Vertrag.
Kein Stream speichert Daten oder führt Cloud-Änderungen aus.

### Gespraechs- und Aenderungsvertraege

Fragen enthalten begrenzte `text`, `options` und `multiple`, bis zu sechs
unterschiedliche 160-Zeichen-Auswahlen und Freitext. Eine Auswahl bereitet
fragebezogenen Benutzertext vor und sendet oder ändert nichts automatisch. Die
Nachrichtengrenze gilt weiter. Empfehlungskarten zeigen belegten Bedarf und Fakten,
bleiben beim Neuladen erhalten und verlangen keine weitere Bestätigung.

Eine Diff-Auswahl fordert einen neuen prüfbaren Vorschlag an. Der endgültige Diff
wird ausdrücklich übernommen; Save, Plan und Apply bleiben getrennt. Geschützte
Felder, Identitätsquellen, native Typen, Vollständigkeit neuer Komponenten,
Mandanten- und Revisionsprüfung bleiben maßgeblich. Defaults kommen aus dem nativen
Vertrag. Anzeigenamen verändern keine Ordnerschlüssel oder Zugriffsmetadaten.

Der private Gesprächskontext liegt serverseitig an der bestehenden Nachricht.
Bestätigte Entscheidungen zitieren echte Benutzerbeiträge; unbelegte Angaben werden
verworfen. Ein neuer Wissenshash verwirft den Kontext, nicht den Verlauf. Verwerfen
schließt offene Vorschlagskontexte. Neue Antworten behalten den ursprünglichen
Ablaufzeitpunkt und ersetzen Vorschlag und Wissenshash atomar. Veraltete Vorschläge
werden nicht still übernommen. Eine Datenbankmigration ist nicht nötig.

Der Bundle-Hash umfasst kuratierte Inhalte, Manifest, Engine-Revision und lokale
Quellfingerabdrücke. Quelländerungen verlangen geprüfte Neugenerierung; Build und
Start genehmigen kein Wissen automatisch.
