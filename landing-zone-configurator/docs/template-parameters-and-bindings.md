# Projekt-Templates: Eingaben, feste Vorgaben und Ressourcenverknüpfungen

Stand: 2026-10-01. Parametervertrag, Template-Editor und lokale Bestellvorschau implementiert; Application-Veröffentlichung und produktive Instanziierung bleiben offen.
Ergänzt [Projekt-Template-Entwürfe](project-template-drafts.md) und die
[Plattform-/Application-Architektur](platform-application-architecture.md).

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

STACKIT-Rollenvorlagen übernehmen Name, Beschreibung und Permissions als bearbeitbare
eigene Rolle mit einem `application-`-Namenspräfix. Keine projektgebundene Rollen-ID
des Referenzprojekts wird übertragen. Eine angezeigte Rolle ist keine Zusicherung,
dass dieselbe Definition im späteren Zielprojekt existiert; sie muss dort als eigene
Rolle definiert oder als verfügbare Zielrolle vor Veröffentlichung qualifiziert werden.

Public-Projektvorlagen erzeugen aktuell kein eigenes Netz. Deshalb ist die entsprechende
Observability-Bindung dort deaktiviert und begründet. Corporate-Vorlagen können sie
als symbolischen Entwurf auswählen; ohne nachgewiesene öffentliche Egress-Adresse
bleibt die Ausführung weiterhin gesperrt.

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
- `src/modules/landing-zone/3-network.tf` erzeugt ein geroutetes Netzwerk nur bei
  `corporate=true`. Ein Public-Projekt hat damit nicht automatisch ein referenzierbares,
  durch dieses Modul verwaltetes Netzwerk. Sandbox gesondert qualifizieren.
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
leere ACL oder `0.0.0.0/0`.** Bedeutung leerer ACLs produktweise qualifizieren.
Eine Public-Vorlage benötigt zuerst eine unterstützte Netzwerk-/Egress-Strategie,
bevor sie „eigenes Projektnetz“ anbieten kann.

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
- [ ] Veröffentlichten Tenant-Katalog und echte Application-Owner-Bestellung anbinden (#92/#93).
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
