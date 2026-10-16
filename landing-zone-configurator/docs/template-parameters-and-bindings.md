# Projekt-Templates: Eingaben, feste Vorgaben und Ressourcenverknüpfungen

## Aktueller MVP: ACL-Einrichtung durch den Benutzer

Stand: 2026-10-08. Die Observability-ACL ist kein Configurator-Parameter mehr.
Editor, Bestellformular und Vorschau bieten weder CIDR-Auswahl noch
Projektnetz-Bindung an. Eine aktivierte Observability-Instanz erzeugt keinen
ACL-Pflichtfeld- oder Egress-Qualifikationsblocker. Der Benutzer richtet die
Zugriffsquellen selbst direkt in STACKIT ein; der Configurator ermittelt oder
konfiguriert keinen automatischen Zugangsweg.

Gespeicherte ACL-Werte und alte Policies bleiben in ihren Vorlagen erhalten.
Alte ACL-Bestelleingaben und Policies werden bei neuer Auflösung ignoriert;
vorhandene feste Werte bleiben als Kompatibilitätswerte erhalten. Es wird kein
privates Projektnetz in Internet-Quelladressen übersetzt.

Die neue native Application-Revision `88149782bf8e91dcdbb43a203b54337886023f7f`
verwendet `ignore_changes = [acl]`, damit spätere manuelle ACL-Änderungen keinen
Terraform-Änderungsplan auslösen. Der STACKIT-Provider setzt beim Erstellen
weiterhin den anfänglichen ACL-Wert und überträgt bei anderen Instance-Updates
den eingelesenen Wert erneut. Eine gleichzeitige manuelle Änderung zwischen
Plan und Apply ist dadurch nicht gegen Überschreiben geschützt.

Neue Veröffentlichungen nutzen die aktiv angebotene Runner-Revision.
Bestehende veröffentlichte Versionen, Bestellungen und Saved Plans werden nicht
umgebunden. Für sie ist eine neue Veröffentlichung mit anschließender neuer
Bestellung erforderlich; alte Pakete und Historie bleiben erhalten. Die
folgenden ACL-Bindungsbeschreibungen dokumentieren den früheren Entwurfsstand,
nicht den aktuellen MVP.

Stand: 2026-10-06. Parametervertrag, Template-Editor, tenantgebundener Testkatalog, persistente Bestellaufträge und serverbasierte Applied-Platform-Bindung implementiert. Live-Aktivierung und menschliche Abnahme, Application-Cloud-Plan und produktive Instanziierung bleiben offen. Dieser Stand ist lokal, noch nicht veröffentlicht.
Ergänzt [Projekt-Template-Entwürfe](project-template-drafts.md) und die
[Plattform-/Application-Architektur](platform-application-architecture.md).

## Serverbasierte Plattformbindung

Bei aktivierter Capability `appliedPlatformsEnabled` waehlt der Platform Engineer
eine erfolgreich angewendete Plattform seines aktiven Tenants und laesst den
Server die nicht geheimen Plattformziele vorpruefen. Nur abgeschlossene Applies
mit weiterhin passender, unverriegelter State-Version und aktuellem menschlichen
Nachweis fuer die verifizierte Organisation stehen zur Auswahl.
Der normale Weg verlangt keinen JSON-Transfer; der Datei-Import bleibt lediglich
als Kompatibilitaetsweg fuer aeltere APIs erhalten.

Die Vorschau liefert Ziele und einen Source-Beleg aus Apply-ID, State-Key und
Version, urspruenglicher Vertragsrevision und SHA-256 des validierten Dokuments.
Zur ausdruecklichen Freigabe sendet der Browser nur diesen Beleg, Zustimmung und
die gewaehlte technische Profil-ID. Ziele und Organisation kommen erneut vom
Server, nicht aus kopierten Browserdaten. Menschlicher Nachweis, aktueller State
und technischer Zugriff werden erneut geprueft. Aenderungen waehrend der Pruefung
verhindern die Uebernahme. Die Quelle bleibt append-only und tenantgebunden;
konkurrierende Wiederholungen mit demselben geprueften Zugang sind idempotent.

Die Freigabe reserviert keine neue Cloud-Ausfuehrung und aendert keine vorhandene
Application-Instanz. Alte Bestellungen behalten ihre Vertragsrevision; ein neuer
Plattform-Apply bindet sie nicht automatisch um. Die API-Erweiterung und Migration
036 sind lokal qualifiziert, aber nicht Teil des laufenden Login-only-Standes 034.
Gruppenmigration 035 und Source-Migration 036 benoetigen eine separate Aktivierung.
Echte Application-Plans, explizite Applies, Drift und Upgrades bleiben eigenstaendige
Folgeschritte in #93. Der eigenstaendige Accelerator bleibt unabhaengig nutzbar.

## Aufgaben in der Oberflaeche

Der Editor-Schritt **Template-Entwürfe** bearbeitet unveröffentlichte Vorlagen.
Die Seite **Application Landing Zones** trennt die weiteren Aufgaben in Reiter:
**Katalog** für veröffentlichte Versionen und Bestellformulare sowie
**Bestellungen** für gespeicherte Instanzen und deren Details.
Platform Engineers sehen zusätzlich **Veröffentlichung** und
**Plattformanbindung**; berechtigte Gruppenmanager sehen **Gruppen**.
Application Owner erhalten keine Verwaltungsreiter. Nach erfolgreicher
Veröffentlichung öffnet sich der Katalog, nach einer Bestellung deren Auftragsbereich.

Die Plattformanbindung ist keine Veröffentlichung eines Templates und keine
Cloud-Ausführung. Der normale, serverbasierte Weg benötigt keinen Datei-Upload.
Bei älteren APIs liegt der bisherige Upload eingeklappt unter
**Kompatibilitätsimport**. Hier gehört ausschließlich der exportierte JSON-Vertrag
einer tatsächlich angewendeten Platform Landing Zone hinein, nicht ein beliebiges
JSON, Terraform-State, tfvars oder Zugangsdaten. Der Vertrag enthält die
Organisations-ID und freigegebene Zielordner mit ihren Plattformreferenzen;
der Server prüft ihn vor einer ausdrücklichen Freigabe.

Diese UI-Trennung ist lokal qualifiziert. Sie aktiviert weder die Migrationen
035/036 noch ein Backend-Feature oder eine Application-Cloud-Ausführung.

## Implementierter Umfang

`ProjectTemplateDraft.parameterPolicy` (Version 1) definiert die Wertquelle je
freigegebenem Feld. Die fünf ersten Felder sind Stage, Secrets-Manager-Aktivierung,
Observability-Aktivierung, Observability-Leistungsklasse und Observability-ACL.
Zusätzlich können Projektrollen über `source: context` und die typisierte Variable
`verified-project-owner` bei der Instanziierung zugeordnet werden. Alle anderen
Einstellungen bleiben fest; Sandbox-Parameter sind noch nicht qualifiziert.
String-Eingaben benötigen eine explizite Auswahlliste, ACL-Eingaben eine Auswahl
zulässiger CIDRs; eine leere ACL-Bestellung ist gesperrt. Eine noch leere, erforderliche
ACL-Auswahlliste ohne Vorauswahl darf als Entwurf bearbeitet werden; die Vorschau
und Auflösung bleiben bis zur gültigen Bestelleingabe gesperrt. Feste ältere Einstellungen
werden nicht automatisch umgedeutet. Defaults, Pflichtfelder, Herkunft und
unzulässige Overrides werden durch denselben Domain-Resolver geprüft, den der
Application-Compiler verwendet. Dies gilt auch beim Speichern der Template-Policy.

Neue Vorlagen erlauben Stage-Auswahl; neue Preset-Entwürfe behalten die Stage des
Beispiels als Vorauswahl, neu hinzugefügte Vorlagen verwenden `dev`. Die
explizite Übernahme einer bestehenden Konfiguration als Plattformkopie behält
hingegen feste Vorgaben. Das JSON im Fork speichert die Policy; der Plattform-
tfvars-Export enthält weiterhin keine Template-Instanzen.

Unter **Bestellung testen** erzeugt der Editor aus der Policy ein lokales Formular
mit wirksamen Werten und Herkunft. Das ist keine öffentliche Application-Owner-
Bestellung und führt keine Cloudzugriffe aus. Der veröffentlichte Application-
Vertragsprototyp Version 2 akzeptiert diese Policy und prüft Bestelleingaben,
Tenant-/Plattformbindung und konkrete Dienstwerte erneut. Version 1 bleibt
kompatibel. Ausführung bleibt ausdrücklich deaktiviert.

Die Projektnetz-Bindung wird symbolisch gespeichert und ist sowohl in der
Vorschau als auch nativ im Application-Root gesperrt. Ihre produktive Egress-
Auflösung wird in [#96](https://github.com/stackitcloud/stackit-landing-zone/issues/96)
verfolgt. Der Runner-Pin bleibt unverändert; diese Ergänzungen geben keine
produktive Ausführung frei.

## Tenantgebundener Testkatalog und Bestellungen

Die Seite `/applications` trennt veröffentlichte Versionen von bearbeitbaren
Projekt-Template-Entwürfen. Der Server speichert den vollständigen validierten
Snapshot samt Policy, Tenant, Template-ID, fortlaufender Version, Veröffentlichendem,
Zeitpunkt und festem Accelerator-Pin. Gleicher Snapshot mit gleichem Pin liefert
dieselbe letzte Version; Änderungen erzeugen eine neue. Frühere Versionen werden
weder verändert noch automatisch auf Bestellungen übertragen. Sandbox-Veröffentlichungen
und leere Bestell-Auswahllisten bleiben gesperrt.

Platform Engineers veröffentlichen aus dem aktuellen Entwurf. Application Owner
sehen nur Versionen ihres aktiven Tenants und benötigen keinen persönlichen Fork.
Der persönliche Arbeitsbereich erlaubt seinem bisherigen Admin die Vorbereitung
dieses Testkatalogs. Unverifizierte Organisationsarbeitsbereiche dürfen damit Daten
vorbereiten, erhalten aber keine STACKIT-Ausführungsrechte. Eine Katalogversion ist
noch keine für reale Kunden verifiziert freigegebene Ressourcenvorlage.

Die Bestellung enthält nur Versions-ID, Projektname, erlaubte Parameter und einen
UUID-Idempotenzschlüssel. Tenant und Antragsteller stammen aus der serverseitig
aufgelösten Session; Owner-E-Mail, Plattform-ID und feste Einstellungen sind nicht
überschreibbar. Derselbe Schlüssel desselben Antragstellers im selben Tenant mit
identischen Eingaben liefert dieselbe Instanz. Abweichende Eingaben ergeben HTTP 409.
Der Browser behält den Schlüssel für Wiederholung und Netzwerk-Retry des laufenden
Bestellformulars. Ein neu geöffnetes oder geändertes Formular ist ein neuer Auftrag;
es besteht keine automatische Zusammenführung nach Projektnamen.

Jede Bestellung erhält eine eigene serverseitige Instanz-ID und reserviert
`applications/<tenant-id>/<instance-id>/terraform.tfstate` als State-Key. Die Bestellung
erzeugt **noch keine State-Datei und kein STACKIT-Projekt**. Feste Einstellungen,
aufgelöste Eingaben und Qualifizierungsblocker werden dauerhaft gespeichert.
Application Owner sehen nur eigene Aufträge, Platform Engineers die Aufträge ihres
Tenants. PostgreSQL erzwingt RLS, aktuelle Produktrollen und unveränderliche Versionen;
ein Wechsel des aktiven Tenants während der Anfrage wird abgewiesen. Ein Arbeitsbereich
mit veröffentlichten Versionen oder Bestellungen kann nicht als leerer Entwurf
archiviert werden.

Der Planstatus ist stets `blocked` und `executionEnabled=false`. Die Oberfläche
weist fehlende verifizierte STACKIT-Benutzeridentität, fehlenden freigegebenen
Plattformvertrag und den noch nicht freigegebenen Application-Runner aus. Ein
GitHub-Login oder ein Service-Account-Key wird nicht als menschlicher STACKIT-Nachweis
umgedeutet. Es gibt keine erfundenen Ressourcenanzahlen und keine Apply-Aktion.
Unaufgelöste Projektrollen und Egress-Bindungen bleiben zusätzliche Blocker.
Der vorhandene Application-Compiler wird dadurch nicht als Ausführungsbroker ausgegeben.

Migration `010_application_catalogue.sql` und `LZC_APPLICATIONS_ENABLED=true` sind
für den Backend-Betrieb erforderlich; das Flag ist standardmäßig aus. Die neue
Migration wurde ausschließlich in der wegwerfbaren lokalen PostgreSQL-Testdatenbank
angewendet, nicht auf der CF-Datenbank. Bestehender Runner-Pin, Plattformvertrag und
Deployment-Pipeline werden nicht automatisch erweitert.

Nachweise: Domain-/API-Tests, echte PostgreSQL-Session/RLS samt HTTP-Durchstich,
parallele Idempotenzprüfung, Rollenentzug und Desktop-/Mobil-Browserfälle.
Die Browserfälle verwenden simulierte API-Antworten; sie ersetzen keine Live-Abnahme
mit verifizierten STACKIT-Identitäten und keinen echten Cloud-Plan.

## Lokales Projektnetz als Template-Vorgabe

Ein Projektnetz ist Teil der Landing Zone, nicht erst der späteren VM-Anwendung.
Public-Projekt-Templates können deshalb mit `settings.network_enabled: true`
ein lokales, nicht SNA-geroutetes Netz anlegen. `network_prefix_length` legt
optional die Präfixlänge fest; ohne Vorgabe wird sie vom Dienst bestimmt.
Die Präfixlänge beschreibt die Netzgröße: `/24` umfasst 256 IPv4-Adressen,
`/25` 128 und `/26` 64. Größere Präfixzahlen bedeuten kleinere Netze; nicht alle
Adressen sind für VMs verfügbar.
Die Oberfläche bietet diese Einstellungen direkt im Projekt-Template an.
Netzanlage und Größe bleiben zunächst feste Vorgaben, keine Bestelleingaben.

Bestehende Public-Templates ohne Netzoption bleiben unverändert. Corporate-
Templates behalten ihr automatisch erzeugtes geroutetes Netz und ihre SNA-
Zuordnung. Sandbox-Netze sind von dieser Erweiterung nicht erfasst. Eine Vorlage
für ein VM-Netz erstellt damit das Projekt und sein Netz, nicht bereits die VM.

Die Einstellungen werden mit dem Template-Dokument im Fork gespeichert und
erzeugen beim Plattform-Export keine Projekte oder Netze. Der Application-Vertrag
Version 2 übernimmt sie als feste Vorgaben in den nativen Application-Root;
Version 1 bleibt unverändert. Das Modul gibt eine nicht geheime Netzreferenz aus.
Modul-, Application- und Standalone-Mockpläne prüfen lokale Netzanlage ohne SNA
sowie den Erhalt bisheriger Konfigurationen. Produktive Instanziierung und ein
realer Cloud-Apply sind weiterhin nicht freigegeben.

Das lokale Netz ist keine automatische Observability-ACL-Quelle. Die
[Instanz-ACL](https://docs.stackit.cloud/products/logging-and-monitoring/observability/how-tos/control-instance-access/)
filtert die am Internet-Endpunkt sichtbaren Quelladressen gemeinsam für Grafana,
Metrics, Logs und Traces. Eine leere ACL stellt uneingeschränkten Netzwerkzugriff
wieder her. Private Netz-CIDRs dürfen daher nicht ohne nachgewiesene Egress-
Semantik als Quelladressen übernommen werden.

## Kataloge und verifizierte Instanziierungsvariablen

Die geladenen STACKIT-Produktkataloge gelten auch für die erlaubten Bestellwerte.
Bei der Freigabe der Observability-Leistungsklasse werden die aktuellen Optionen
angeboten und können über Checkboxen eingeschränkt werden. Nicht mehr im Katalog
enthaltene Bestandswerte bleiben erkennbar erhalten. Ohne verfügbaren Katalog bleibt
die manuelle Eingabe möglich; sie ist kein Nachweis der Cloud-Verfügbarkeit.
Dieselbe Katalogzuordnung wird im strukturierten Editor für Git, VPN, SKE,
Observability, Bastion und die neuen IAM-Felder verwendet. Nicht alle diese
Plattformfelder sind bereits als Projekt-Bestellparameter qualifiziert.

Für Projektrollen definiert die Policy `source: context`,
`variable: verified-project-owner` und eine Rollenliste. Es werden keine persönlichen
E-Mail-Adressen oder frei interpretierbaren Platzhalter im Template gespeichert.
Die lokale Vorschau zeigt die unaufgelöste Identität und einen Blocker. Der Compiler
bindet ausschließlich `context.verified_stackit_email`, niemals GitHub-Login oder
eine vom Besteller übergebene Benutzerkennung. Bestehende feste Zuweisungen bleiben
erhalten. Doppelte Zuweisungen derselben Rolle an dieselbe Identität werden vermieden.
Die zusätzlichen Rollenzuweisungen und festen `custom_roles` werden im Application-
Vertrag Version 2 bis zum nativen Root weitergegeben; Version 1 bleibt unverändert.
Das ist weiterhin ein nicht zur produktiven Ausführung freigegebener Prototyp.

Bei fest ausgeschaltetem Observability blendet der Template-Editor Leistungsklasse,
Zugriffsquellen, Instanzname und die entsprechenden Vorschauwerte aus. Gespeicherte
Werte und Policies bleiben erhalten und erscheinen beim Wiedereinschalten wieder.
Ist die Aktivierung erst bei der Bestellung wählbar, bleiben die benötigten
Template-Vorgaben konfigurierbar. Strukturierte Template-Dienste mit explizit
ausgeschaltetem `enabled`- oder benanntem `*_enabled`-Schalter blenden ihre
zugehörigen Details ebenfalls aus, ohne diese zu löschen.

STACKIT-Rollenvorlagen übernehmen Name, Beschreibung und Permissions als bearbeitbare
eigene Rolle mit einem `application-`-Namenspräfix. Keine projektgebundene Rollen-ID
des Referenzprojekts wird übertragen. Eine angezeigte Rolle ist keine Zusicherung,
dass dieselbe Definition im späteren Zielprojekt existiert; sie muss dort als eigene
Rolle definiert oder als verfügbare Zielrolle vor Veröffentlichung qualifiziert werden.

Public-Projektvorlagen mit aktiviertem lokalem Netz können die Observability-
Bindung ebenso wie Corporate-Vorlagen als symbolischen Entwurf auswählen.
Ohne Projektnetz ist die Auswahl gesperrt. Die ACL-Bindung wird nur bei aktiviertem
Observability ausgewertet. Wird Observability bei der Bestellung ausgeschaltet,
bleibt das Projektnetz erhalten; die inaktive ACL-Bindung erzeugt weder eine
Ressourcenbindung noch einen Qualifikationsblocker. Die Template-Policy bleibt
unverändert. Ein symbolischer Snapshot darf im Testkatalog gespeichert werden;
produktive Freigabe und Ausführung der aktiven ACL-Bindung bleiben für beide
Netzarten ohne nachgewiesene öffentliche Egress-Adresse gesperrt.

## Ausgangsproblem und überprüfte Accelerator-Grenzen

Die jetzigen `ProjectTemplateDraft.settings` bewahren hauptsächlich konkrete
Accelerator-Einstellungen. Sie unterscheiden weder feste Policy von überschreibbaren
Defaults noch Ressourcenbindungen von literalen Werten. Der vorhandene
Application-Vertrag ist ein nicht freigegebener Prototyp und muss entsprechend
weiterentwickelt werden. Die Oberfläche darf keine vollständige Parametrisierung suggerieren.

- `env` ist derzeit eine feste Einstellung, für neue Public-/Corporate-Entwürfe `dev`.
  In `src/main.tf` fließt der Wert in Naming und DNS ein.
- `src/modules/landing-zone/8-observability.tf` übergibt `var.observability.acl`
  unverändert. Eine Bindung an ein erzeugtes Netzwerk fehlt.
- `src/modules/landing-zone/3-network.tf` erzeugt weiterhin ein geroutetes Netzwerk
  bei `corporate=true`, zusätzlich jetzt ein lokales Netz für Public-Projekte bei
  `network_enabled=true`. Beide sind Modulressourcen; Sandbox gesondert qualifizieren.
- Die spätere ACL muss die am Dienst wirksame Quelladresse berücksichtigen:
  Ein Projekt-CIDR ist bei NAT oder anderen Zugriffswegen möglicherweise nicht
  die tatsächlich sichtbare Quelladresse. Die Produkt-/Netzwerksemantik ist vor
  Ausführungsfreigabe mit Provider und realem Verbindungstest nachzuweisen.

## Wertquellen statt frei interpretierbarer Platzhalter

Jede freigegebene fachliche Eigenschaft erhält genau eine Wertquelle:

| Quelle | Platform Engineer definiert | Application Owner sieht |
| --- | --- | --- |
| Fest vorgegeben | Konkreten typisierten Wert, z. B. Secrets Manager verpflichtend | Erklärte, schreibgeschützte Vorgabe |
| Bei Bestellung ausfüllen | Typ, Pflichtfeld, zulässige Werte/Grenzen, Erklärung, optionalen Default | Eingabe oder Dropdown innerhalb dieser Grenzen |
| Automatisch verknüpft | Freigegebene typisierte Ressourcenreferenz, z. B. eigenes Projektnetz | Beziehung und später aufgelösten Wert, kein Freitextfeld |
| Aus verifiziertem Kontext | Serverseitige Identitäts-/Tenant-/Plattformbindung | Herkunft und wirksamen Wert, keine überschreibbare ID |

Das sind keine vier Optionen für jedes Feld: Organisation/Antragsteller dürfen
beispielsweise nur aus verifiziertem Kontext stammen; eine Dienstleistungsklasse
kann nur zugelassene Werte anbieten. Ein serverseitiges Feldregister bestimmt,
welche Quellen und Referenztypen je Ziel zulässig sind. Unbekannte Felder sind
nicht automatisch veränderbar. Keine beliebigen HCL-/JavaScript-Ausdrücke,
String-Interpolation oder ausführbaren Template-Skripte.

Ein Default ist ein Vorschlag für eine erlaubte Bestelleingabe und keine feste
Policy. Pflicht, Zulässigkeit und Änderbarkeit sind getrennte Eigenschaften.
Secrets werden ausschließlich über autorisierte Secret-Referenzen eingebunden;
sie sind keine normalen Template-Parameter oder Vorschauwerte.

## Umgebung / Stage

Die **Auswahl einer konkreten Stage gehört normalerweise zur Bestellung**.
Das Template legt fest, welche Stages erlaubt sind und welche vorausgewählt ist,
beispielsweise `dev`, `test`, `prod` mit Default `dev`. Ein bewusstes
„Nur Produktion“-Angebot darf `prod` fest vorgeben. Die Auswahlwerte sind
Template-Policy, keine behauptete abschließende Accelerator-Enumeration.

Stage ist zunächst nur bei Anlage wählbar. Da sie im heutigen Accelerator Namen
und DNS beeinflusst, wird eine spätere Änderung erst mit qualifiziertem
Updatevertrag, sichtbarem Ressourcen-Diff und möglicher Ersatzwirkung angeboten.
Keine automatische Umbenennung bestehender Ressourcen. Der Application-Compiler
muss ihre konkrete Wirkung in Naming/Labels/DNS ausdrücklich abbilden; der aktuelle
Application-Prototyp erfüllt diesen Vertrag noch nicht.

## Beispiel: STACKIT Observability und eigenes Projektnetz

Der Platform Engineer definiert:

- STACKIT Observability wird erstellt (oder ist innerhalb definierter Policy optional).
- Leistungsklasse fest oder Auswahl aus freigegebenen, für das Ziel gültigen Klassen.
- Zugriffsregel: **Eigenes Projektnetz** statt einer vorab ausgedachten CIDR.
- Referenz auf das konkrete, von dieser Instanz verwaltete Netzwerk. Bei mehreren
  Netzen ist ein explizites Netz oder eine ausdrücklich definierte Menge erforderlich.

Das gespeicherte Template enthält eine typisierte Referenz, sinngemäß
`Observability → Zugriffsquellen → Projektnetz dieser Instanz`. Es enthält noch
keine vom Besteller einzutragende CIDR. Der Compiler übersetzt diese Beziehung
innerhalb eines States in eine echte OpenTofu-Ressourcenreferenz. Ist die Adresse
beim Plan unbekannt, zeigt die Vorschau „wird bei Bereitstellung ermittelt“ mit
Herkunft an; der Abhängigkeitsgraph löst sie beim Apply auf. Keine Vorabauflösung
per API auf ein noch nicht existierendes Netz und keine CIDR-Platzhalter in tfvars.

Fehlt das Netz oder passt sein Adresstyp/Zugriffsweg nicht, ist die Kombination
nicht veröffentlichbar bzw. nicht instanziierbar. **Kein stiller Rückfall auf
leere ACL oder `0.0.0.0/0`.** Bei Observability bedeutet eine leere ACL Vollzugriff
auf Netzwerkebene. Auch eine Public-Vorlage mit lokalem Netz benötigt eine
qualifizierte Egress-Strategie, bevor sie „eigenes Projektnetz“ als ausführbare
ACL-Quelle anbieten kann. Als symbolischer Entwurf ist die Bindung auswählbar.

## Allgemeine Verknüpfungen und State-Eigentum

Referenzen benötigen Ressourcentyp, erlaubtes Ausgabeattribut, Tenant/Instanz-
oder Plattformbezug und Kardinalität. Beispiele sind Cluster für Namespace,
SNA für Corporate-Netz, Zielordner für Projekt, Observability-Anbindung und
verifizierter Antragsteller für eine genehmigte IAM-Zuweisung. Nicht alle diese
Verknüpfungen werden bereits vom Accelerator unterstützt.

Referenzen innerhalb einer Instanz werden im OpenTofu-Graph verbunden.
Plattformreferenzen kommen aus einer geprüften Vertragsversion, niemals aus
beliebigen fremden State-Dateien oder Benutzer-UUIDs. Auflösung prüft Tenant,
Region, Typ, Berechtigung, Existenz und Lebenszyklus; Zyklen werden abgewiesen.
Ein Template darf nicht über einen Parameter auf fremde Tenants zugreifen.

Eine gemeinsam genutzte Plattforminstanz bleibt im Plattform-State. Wenn eine
Application deren ACL erweitern müsste, darf ihr State diese ACL nicht ebenfalls
verwalten. Dafür ist ein eigener, autorisierter Registrierungs-/Abmeldeablauf beim
Plattformeigentümer nötig, einschließlich Parallelität und Rücknahme bei Löschung.
Bis dieser existiert, wird die Kombination nicht zur Ausführung freigegeben.

## Veröffentlichung, Bestellung und Änderungen

1. Editor: Pro freigegebenem Feld sichtbare Quelle und bei Bestelleingaben Constraints.
2. Veröffentlichung: Typen, Defaults, Bindungsgraph, Pflichtabhängigkeiten und
   Compiler-/Accelerator-Fähigkeiten prüfen; unveränderliche Version erzeugen.
3. Bestellung: Formular ausschließlich aus freigegebenem Eingabeschema erzeugen.
4. Server: unbekannte/gesperrte Inputs ablehnen, erlaubte Werte erneut prüfen,
   Kontext binden und deterministisch kompilieren. Gleiches gilt für Chat/API.
5. Plan: konkrete Werte und noch unbekannte Ressourcenwerte samt Herkunft zeigen.
   Plan/Freigabe an Template-Version, Eingaben, Plattformvertrag und Compiler binden.
6. Update: nur ausdrücklich als veränderbar qualifizierte Eingaben zulassen;
   Template-Upgrade bleibt explizit. Vorlagenänderungen verändern keine Instanzen.

Persistiert werden Template-Policy, Bestelleingaben und Auflösungsnachweis getrennt.
Jedes wirksame Feld hat eine Herkunft. Bestehende Entwürfe behalten ihre Werte
zunächst als feste Vorgaben; der Platform Engineer macht sie ausdrücklich zu
Bestelleingaben oder Bindungen. Keine automatische Freigabe bisher gesperrter Werte.

## Umsetzungsreihenfolge / Abnahme

- [x] Lücke und konkrete Accelerator-Grenzen im Code geprüft.
- [x] Versionierten Parameter-/Binding-Vertrag mit fünf freigegebenen Feldern implementieren (#92); weitere Felder bleiben fest.
- [x] Stage als erste vollständige Bestelleingabe mit Default, Auswahl und festen Werten;
      unverändertes Lesen alter Entwürfe, explizite Konvertierung.
- [x] Template-Editor und lokale Bestellvorschau aus demselben Vertrag erzeugen.
- [x] Veröffentlichten Tenant-Katalog anbinden (#92/#93); reale unveraenderliche Version 1 lokal abgenommen.
- [ ] Echte Application-Owner-Bestellung mit anschliessendem Plan/Apply abnehmen (#93).
- [x] Compiler prüft Policy unabhängig vom Formular bei manipulierten Eingaben; Tests für
      unbekannte Felder, unzulässige Defaults, Tenantwechsel und Versionsbindung.
- [ ] Accelerator-Modul um typisierte Projekt-Netz-/Observability-Bindung erweitern;
      erst Provider-/ACL-/Egress-Semantik nachweisen, dann native Graph-/Plan-Tests.
- [ ] Fehlendes Netz, deaktivierter Quelldienst, mehrere Netze und zyklische oder
      regionsfremde Bindungen verhindern Veröffentlichung/Instanziierung.
- [ ] Plan mit unbekannten Ressourcenwerten und später korrekter ACL qualifizieren;
      echter Kunden-Apply ausschließlich nach ausdrücklicher Freigabe.
- [ ] Weitere Dienstverknüpfungen nach demselben Muster ergänzen; gemeinsame
      Plattform-ACLs erst nach Umsetzung des einzelnen State-Eigentümers freigeben.

Diese Arbeiten sind Voraussetzung eines nutzbaren Application-Self-Service,
kein nachträglicher Komfortausbau eines bereits vollständigen MVP.

## Validierung und Bereitstellung

- Lokale Domain-/App-Tests und native Application-Mockpläne prüfen die neue Policy
  sowie Stage-Naming, Legacy-Erhalt und die harte Netzwerkbindungs-Sperre.
- Browserprüfung und Release-Nachweis werden nach erfolgreicher Bereitstellung ergänzt.
- Kein Kunden-Apply und keine automatische Änderung vorhandener Projekte.

### Reale Template-Veroeffentlichung (2026-10-06)

Das bestehende Public-Template wurde als Version 1 aus dem gespeicherten Entwurf
veroeffentlicht: Region eu01, lokales Projektnetz, freigegebener serverbasierter
Plattformvertrag, Ziel `public-eu01`, automatische Gruppe **Application Owners**
und **Bereitstellung mit Freigabe**. Der Vertrag stammt aus dem erfolgreichen
aktuellen Plattform-Apply mit State-Version 6; alte Applies und rohe States sind
keine frei waehlbaren Quellen. Der Katalog zeigt dieselbe Version nach Reload.
Veroeffentlichung erzeugt keine Cloud-Ressourcen, Application-Ausfuehrung bleibt
deaktiviert. Eine echte Application-Owner-Bestellung und Cloud-Ausfuehrung sind
damit noch nicht abgenommen.

Eigene Gruppen werden in **Benutzerverwaltung** angelegt, mit Mitgliedern
besetzt und geloescht; die Veroeffentlichung verwaltet nur deren Template-Freigaben.
**Erfolgreicher Plattform-Apply** zeigt Konfigurationsname und Abschlussdatum
statt eines State-Key-Hashes. Auswaehlbar sind nur erfolgreiche, aktuelle,
unverriegelte Applies im verifizierten Arbeitsbereich mit gueltigem menschlichem
Organisationsnachweis. Dessen Erneuerung bleibt auch nach Organisationsbindung
in der Benutzerverwaltung erreichbar.
