# MVP-Abnahme und Weg zum Merge

Stand: 2026-10-05. Dies ist die aktuelle Arbeitsliste; die ausführliche
[Architekturplanung](planning.md) bleibt das Entscheidungsprotokoll.
**Der fachliche MVP ist noch nicht erreicht. Ein Merge ist noch nicht freigegeben.**

## Was MVP hier bedeutet

Das aktuelle Zwischenziel ist **Template veröffentlichen → bestellen → eigenen
Cloud-Plan anzeigen**. Erste Vorlage: Public-Projekt mit lokalem Netz, ohne VM
und ohne automatische Observability-Netzbindung. STACKIT ist die primäre
menschliche Anmeldung; GitHub ist ein optionaler Connector. Technische
Cloud-Zugriffe verwenden den vom Platform Engineer gespeicherten Service Account.
Application Owner benötigen weder Fork noch eigenen technischen Zugang.

**Kunden-Apply erfordert immer eine gesonderte ausdrueckliche Freigabe; kein Merge ist freigegeben.** Gespeicherte Plattform-Plans koennen inzwischen nach Pruefung und expliziter Freigabe angewendet werden. Eine Live-Abnahme von Apply, Migration und Recovery ist weiterhin nicht nachgewiesen. Der früher diskutierte
Gesamtumfang mit Apply/Recovery, Model-Serving-Assistent und Upgrades bleibt
verbindlicher MVP-Restumfang. Tenanttrennung, verifizierte menschliche Identität und unveränderliche
Template-/Plattformversionen sind bereits für dieses Zwischenziel verpflichtend.

Eine nutzbare Editor-/Plan-Vorabversion ist ein Zwischenstand. Sie ersetzt weder
diesen Umfang noch die Abnahme des Application-Self-Service. Optionale Drift
Detection/Correction, eigener Terraform-Code aus Forks und private Kubernetes-
Runner bleiben eigene Ausbaustufen. Ein belastbarer Nachweis der STACKIT-Organisation
und des Projektverantwortlichen ist verpflichtend; ein erfolgreicher Login allein
ersetzt weder den technischen Organisationszugriff noch einen Cloud-Plan.

## Lokaler Self-Service-Fortschritt (2026-10-02)
Die nachfolgenden Detailnachweise beschreiben diesen historischen Stand. Der aktuelle Issue-Abgleich hat Vorrang; Application-Cloud-Ausfuehrung bleibt weiterhin nicht aktiviert oder live abgenommen.

- Unveränderliche, tenantgebundene Plattformvertragsversionen mit ausdrücklicher
   PE-Freigabe, gültiger menschlicher STACKIT-Identität und aktuellem SA-Zugangstest.
   Gespeichert werden Profil-ID, Secret-Version, Key-ID und Prüfzeit, keine Schlüssel.
- Veröffentlichung bindet eine passende Zielregion/Projektart und Vertragsrevision.
   Ein Revisionswechsel erzeugt eine neue Template-Version; Altversionen bleiben gleich.
- Bestellungen verwenden ausschließlich die serverseitig verifizierte Besteller-E-Mail.
   Widerruf und Ablauf liefern weiterhin gesperrte Bestellungen, keine Ausführungsfreigabe.
- Eigener Plan-Input ist über die gespeicherte Bestellung mit erneuter Rollen-,
   Identitäts-, Organisations- und Eigentumsprüfung an den strikten Compiler angebunden.
   Eine geänderte E-Mail verlangt eine neue Bestellung. AO lesen keine Credential-Profile.
- Desktop/Mobil: Vertragsimport, automatische Auswahl des einzigen gespeicherten
   PE-Zugangs, Freigabe, gebundene Veröffentlichung, forklose Bestellung und Plan-Input.
- Lokale Gates: 210 Unit-, 27 echte PostgreSQL- und 24 fokussierte Browserfälle
   bestanden; nativer Plan-Summary-Test sowie 14 Application-, 3 Netz- und 3
   Governance-Verträge mit OpenTofu 1.12.6 bestanden. Browser-/Cloud-Adaptertests
   verwenden kontrollierte Antworten und ersetzen keine Live-Kundenfreigabe.
- **Noch kein Application-Cloud-Plan:** Der freigegebene CF-Runner akzeptiert nur
   `initial-plan-only` und packt den Accelerator-Commit
   `a256f6896d11134fdc351786f1be5eba4e56b2e2`, der kein Application-Root enthält.
   Ein freigegebenes Application-Artefakt, eigener State-Backend-Zugang samt Locking
   und ein begrenzter technischer Job-Grant fehlen noch. Reservierte State-Keys und
   geprüfte Terraform-Variablen sind weder State-Dateien noch Planergebnisse.

Details und JSON-Vertrag: [Application-Plan-Eingaben](plan-execution.md#application-plan-input-und-plattformvertrag).

## Bestandsaufnahme

### Issue-Abgleich vom 2026-10-05

Alle sieben mit `mvp:required` markierten Issues #89 bis #95 waren bei Beginn
dieses Abgleichs offen. Ein implementiertes Teilkriterium ist kein abgeschlossener
Gesamt-MVP und kein Beleg fuer eine Live-Abnahme.

| Issue | Inzwischen implementiert / nachgewiesen | Verbleibende Abnahme oder Umsetzung |
|---|---|---|
| [#89](https://github.com/stackitcloud/stackit-landing-zone/issues/89) | Gemeinsamer Datensatz, begrenzte Standalone-/Governance-Freigabe, unveraenderliche Vorbereitung, Broker-Pruefung; persoenliche Kunden-Plans erfolgreich, zuletzt `6fb07c43-bd5d-47e7-bf30-3a14eb10b605`; leerer Erstplanpfad auch bei deaktivierter Plattformausfuehrung gegen Checkpoint, Teilstate, Aliase und unzugeordneten Altstate gesperrt | Weitere Komponenten einzeln mit nativen Contracts und gegebenenfalls privater Erreichbarkeit qualifizieren; Editorumfang ist keine Ausfuehrungsfreigabe |
| [#90](https://github.com/stackitcloud/stackit-landing-zone/issues/90) | Verschluesselter gespeicherter Plan, explizite Freigabe, unveraenderliche Bindungen, serialisierte Ausfuehrung, temporaerer Bootstrap-State, kundeneigener S3-Zielbackend, geschuetzte Recovery-Nachweise und CLI-Ausgaben | Nachgewiesene Live-Abnahme von Apply, Migration, Folgeplan und hartem Runner-Verlust; operatorseitige Wiederherstellung und Abgleich unterbrochener Laeufe |
| [#91](https://github.com/stackitcloud/stackit-landing-zone/issues/91) | Primaerer STACKIT-Device-Login, verifizierte menschliche Identitaet, optionaler benutzergebundener GitHub-Connector, Rollen-/Eigentums-/Tenant-Pruefungen; lokal gepruefte menschliche IAM-Owner-Bindung mit separater Bestaetigung und unveraenderlichen Auditbelegen; persistente einmalige Plattform-Job-Grants mit Ablauf/Widerruf vor technischer Credential-Nutzung | Aktivierung und echte Zwei-Organisations-Abnahme; Least-Privilege-Providerqualifizierung, Application-Job-Grant-Anbindung, Live-Widerruf/abgelaufene Jobs und Produktions-Client-Freigabe |
| [#92](https://github.com/stackitcloud/stackit-landing-zone/issues/92) | Gespeicherte Template-Entwuerfe, unveraenderliche tenantgebundene Versionen, Compiler-/Plattformvertrag, strikte Eingabepolicies, forklose AO-Sicht/Bestellung; explizite idempotente Stilllegung mit serverseitiger Sichtbarkeits-/Bestellsperre; versionierte direkte/Freigabe-Policy mit unveraenderlichem Instanz-Snapshot | Aktivierung der neuen Migrationen und vollstaendige Kundenveroeffentlichungsabnahme unter autoritativ verifizierter Tenantbindung (#91); kein automatischer Application-Apply |
| [#93](https://github.com/stackitcloud/stackit-landing-zone/issues/93) | Versionierter nicht geheimer Plattformvertrag, SA-gebundene PE-Freigabe, persistente idempotente Bestellungen, verifizierte Owner-Bindung und erneuter Plan-Input-Check; lokal qualifizierter eigener Application-Quell-Pin/Provider-Lock, Opt-in-Paket und Worker-Root-/Instanz-State-Isolation; explizite neue Quellversion, idempotente vorbereitete Jobs mit SQL-abgeleiteten unveraenderlichen Grant-Snapshots und Widerruf; explizite sessiongebundene PE-S3-Backend-Freigabe mit festem Instanz-Key ohne AO-Credential-Zugriff | Freigegebener Application-Dispatch mit einmaliger technischer Credential-Freigabe, eigener realer State/Lock, Cloud-Plan, Quoten und ausdruecklicher Upgrade-Pfad |
| [#94](https://github.com/stackitcloud/stackit-landing-zone/issues/94) | Betreiber-Binding fuer Model Serving | Begrenzter Backend-/UI-Assistent, Wissensstand, validierter Vorschlag mit bestaetigtem Diff sowie Sicherheits- und echter Model-Serving-Nachweis |
| [#95](https://github.com/stackitcloud/stackit-landing-zone/issues/95) | Lokale Lint-/Typ-/Build-Gates, Unit-/Browser-/native Nachweise und dokumentierte Laufzeitgrenzen | Finale Revision/CI, Zwei-Org- und Betriebsabnahme, Restore/Rotation, PR/Branchschutz/Deployment-Entscheidung und ausdruecklicher Merge-Entscheid |

Zu #93 ist die interne einmalige Credential-Freigabe lokal qualifiziert:
nur die echte PE-Freigabesession, atomarer Verbrauch vor technischer Pruefung,
feste Source-/Profil-/Schluesselversion und erneute Live-Autorisierung nach dem
Secret-Zugriff. Rotation, Replay, Source-Abweichung, Parallelzugriff und
Rechteentzug werden abgefangen. Interne gehashte Runner-Tickets binden jetzt
Paket, Quelle, Provider-Lock und die echte Freigabesession. Der vollstaendige
Plan-Input verwendet nur immutable Job-Variablen und den freigegebenen Instanz-
S3-Key. Der interne Dispatch-Kern ist mit Fake-Runner lokal geprueft: eine aktive
Reservierung pro Instanz, keine Doppelstarts oder automatischen Wiederholungen;
ungewisse Startfehler sperren Instanz und Ticket zur Reconciliation. Es gibt
weiterhin keinen oeffentlichen Claim- oder isolierten Credential-Endpunkt.
Migration 033 speichert Planartefakte und CLI-Ausgaben verschluesselt und
unveraenderlich unter der tatsaechlichen Bestellerbindung; erfolgreiche Ergebnisse
erfordern exakt den gespeicherten Plan-Hash, die Summary und die Paketbindung.
Die Stage-Folge ist strikt; Upload-Konflikte, terminale Replays und Doppelstarts
auch waehrend `planning` werden abgefangen. Unknown-Start nach begonnener Arbeit
bleibt zur Reconciliation gesperrt und darf nicht automatisch erneut starten.

Die neuen `/api/application-runner/*`-Endpunkte haben eine serverseitige feste
Paketbindung und bleiben ohne explizite Konfiguration geschlossen. Der Worker
trennt sie vom Plattform-Broker und verweigert domainfremde Eingaben vor Engine-
Zugriff. Der lokale Application-Paket-Fingerprint umfasst auch dessen Root und
Geschwistermodule; Plattform-Paketidentitaeten werden nicht umgebunden.
Der session-/tenant-/origin-/CSRF-geschuetzte Dispatch-Endpunkt verlangt eine
ausdrueckliche Plan-Bestaetigung. Lokaler Startup erfordert zusaetzlich
`LZC_APPLICATION_EXECUTION_ENABLED=true` und einen expliziten separaten
`LZC_APPLICATION_RUNNER_PACKAGE_DIR`; kein Default-Paket wird still ausgewaehlt.
Diese Verkabelung ist nur lokal mit HTTP-, Prozess- und PostgreSQL-Fixtures
qualifiziert, nicht im aktiven Paket ausgerollt. Operator-Reconciliation,
Quoten, gespeicherter Application-Apply samt Recovery und Upgrade-Pfad bleiben
vor der vollstaendigen #93-Abnahme offen. Kein Kunden-Cloud-Lauf wurde gestartet.

Verbindliche Architekturgrenze: Der Accelerator bleibt ohne Configurator nutzbar.
Der CLI-Pfad fuer neue getrennte Platform-/Application-Phasen hat jetzt einen
nicht geheimen `platform_contract`-Export, manuell ausgefuellte JSON-/Backend-
Beispiele und eine eigene Accelerator-CI-Pruefung. Ressourcen mit Label-Support
erhalten `landing_zone_accelerator=true`; Configurator-generierte Inputs ergaenzen
`landing_zone_configurator=true`. CLI braucht keine Configurator-Session, Grants
oder Template Engine. Lokal bestanden 9 native Plattform-/Regional-/Management-Label-Faelle und
16 Application-/3 Netzwerkfaelle. Noch offen: echte Zwei-Phasen-CLI-/S3-/IAM-
Abnahme, bestehende kombinierte State-Migration und aktive Promotion der neuen
Application-Quellversion. `c4b43c3` ist jetzt lokal als eigene unveraenderliche
Publikation und neues inaktives natives Application-Paket qualifiziert. Kein
automatischer Wechsel vorhandener Publikationen oder gebundener Runner.

Aktuelle lokale Gates: `npm run check` mit **370 bestandenen Unit-Tests** und
33 bewusst uebersprungenen umgebungsabhaengigen Tests; die isolierte
PostgreSQL-Plan-/Apply-/State-/Grant-Suite separat mit **31 bestandenen Tests**;
Identitaets-/Katalog-/Policy-/Bindungssuite mit **29 bestandenen PostgreSQL-Tests**;
vollstaendige
Playwright-Suite zuletzt mit **152 bestandenen Desktop-/Mobilfaellen** vor den
backend-/runnerseitigen Schritten. Die Web-Oberflaeche
verwendet Deutsch oder Englisch nach Browserpraeferenz mit gespeicherter
expliziter Sprachwahl im Header. Auch gespeicherte dynamische Meldungen wechseln
die Sprache; Benutzerwerte mit literalem Interpolationstext bleiben unveraendert.
Konfiguration, Vorbereitung, Plan, Apply und
Gesamtverlauf sind getrennt; Navigation und Sprachwechsel starten keine
Bereitstellung. HTTP-Fixtures sind kein Live-Kunden- oder Live-S3-Nachweis.

Der Feature-Zwischenstand und die Application-Inkremente sind nach ausdruecklicher
Freigabe lokal committed und als externe Git-Bundles gesichert. Kein automatischer
Push, Release oder Merge. Die laufende API und das
native Paket `runner-local-20261004-opentofu-completeness` bleiben unveraendert.

Der vom Benutzer gezeigte Bootstrap-Plan enthaelt am Management-Projekt nur
`managed_by=opentofu`, nicht die vereinbarten Herkunftslabels. Der seit
2026-10-04 laufende API-Prozess verwendet noch den Stand vor der Compiler-
Korrektur. Der bisherige gepinnte Terraform-Root reicht `var.labels` an das
Management-Modul durch; ein Quell-Pin-Wechsel allein ist hier nicht die Loesung.
Neue Vorbereitungen muessen jetzt exakt den aktuellen kanonischen Export ihres
gespeicherten Dokuments binden. Fehlende oder manipulierte Pflichtlabels werden
abgewiesen; Kundenlabels bleiben erhalten. Der native Management-Projekt-Test
prueft die tatsaechlich geplanten Labels, nicht nur Root-Locals.
Der alte Plan und seine Vorbereitung werden nicht umgeschrieben oder angewendet.
Nach freigegebener API-Aktivierung sind eine neue Vorbereitung und ein neuer Plan
derselben Konfiguration erforderlich. Das lokale Startskript fuehrt ausstehende
Migrationen aus; dieser breitere Aktivierungsschritt braucht eine gesonderte
Freigabe und Sicherung, bevor die Kundendatenbank angefasst wird. Kein Cloud-Apply.

Alle sieben GitHub-Beschreibungen und Audit-Kommentare wurden aktualisiert und
anschliessend zurueckgelesen. Kein Gesamt-Issue ist bereits vollstaendig abgenommen;
deshalb bleiben #89 bis #95 offen. Implementierte Teilkriterien sind abgehakt,
die urspruenglichen offenen MVP-Anforderungen bleiben erhalten. Der erste neue
Umsetzungsschritt ist die Erstplan-State-Sperre in #89: gleiche Source-Sperre und
Legacy-Pruefung wie die Plattformausfuehrung, erneute Pruefung vor Runner-Input,
verstaendlicher Sperrhinweis in Deutsch und Englisch. Dieser Fix ist lokal
validiert, aber noch nicht in der laufenden API aktiviert. Anschliessend wurden
Stilllegung und Deployment-Policy aus #92 lokal umgesetzt und validiert.
Migrationen 021/022 sind noch nicht in der laufenden Kunden-API aktiviert;
die Oberflaeche blendet nicht unterstuetzte Publisher-Steuerungen aus.

### Historische Bestandsaufnahme vom 2026-10-02

| Bereich | Nachgewiesen | Noch nötig |
|---|---|---|
| Plattform | CF, PostgreSQL, Secrets Manager, Model-Serving-Token, getrennte IaC-/Release-Pipelines | Restore-/Rotation-/Fehlerfallabnahme und Betriebslimits |
| Login / GitHub | Primärer STACKIT-Device-Login mit verifizierter menschlicher Identität; optionaler GitHub-Connector und Fork-Speicherung | Eigener produktiver OAuth-Client beziehungsweise ausdrückliche produktive Client-Freigabe |
| Editor | Gemeinsames Schema v3, Module, Regionen/SNAs, VPN-Assistent, Graph, Produktkataloge | Fehlende Kataloganbindungen nach Bedarf; Editorumfang ist keine Ausführungsfreigabe |
| Zugänge | Tenantgebundene eigene PE-Profile, sichere Secret-Ablage, SA-Organisationszugriffstest und Nachweis bei Vertragsfreigabe | Eng begrenzter technischer Job-Grant ohne AO-Schlüsselzugriff |
| Plan | Isolierter CF-Task aus vorab gestagtem Droplet, gepinnter Code, Status und aggregiertes Ergebnis | Neuer Editor: Governance inklusive Organisations-/Ordnerrechten und konservative Standalone-Teilmenge; echter persönlicher Kunden-Plan noch nicht abgenommen |
| Apply / State | Bootstrap-Lebenszyklus beschrieben | Dauerhafter Initial-State, gespeicherter freizugebender Plan, Apply, Migration, Folgeplan und Recovery |
| Organisationen | Rollen, Einladungen, Mitgliederverwaltung, Arbeitsbereichswechsel, Archivierung leerer Entwürfe; lokal gepruefte ausdrueckliche menschliche Owner-Bindung mit Audit | Neue Bindungsmigrationen noch nicht live; Zwei-Organisations-/Widerrufsabnahme und begrenzte technische Job-Grants fehlen; keine pauschale Ausfuehrungsfreigabe |
| Application-Self-Service | Unveränderliche Template-/Plattformversionen, SA-gebundene PE-Freigabe, forklose Bestellungen, verifizierte Owner-Bindung und erneut geprüfter eigener Plan-Input | Realer Application-Cloud-Plan, isolierter State mit Locking und Live-Abnahme; Apply/Upgrades bleiben Folgearbeit |
| Chat | Betreiber-Token per IaC und CF-Bindung | Backend, Oberfläche, begrenzter Wissensstand, validierte Vorschläge und Abnahme |

Referenz vor diesem Arbeitspaket: Release `dde3379`, erfolgreiche
[Release-Pipeline](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36846494967),
118 Unit-, 21 PostgreSQL- und 32 Browserprüfungen. Browserprüfungen ersetzen keine
Live-Abnahme mit zwei echten Benutzern oder einen echten Kunden-Plan.

## Arbeitspakete und Abhängigkeiten

| Reihenfolge / Strang | Arbeitspaket | Abnahmekriterium |
|---|---|---|
| A1 · Ausführung | [#89 Gemeinsamer Editor → Plan](https://github.com/stackitcloud/stackit-landing-zone/issues/89) | Export, Vorbereitung und Broker verwenden denselben geprüften Datensatz; nicht unterstützte Komponenten werden serverseitig abgelehnt; echter Plan erfolgreich |
| A2 · Ausführung | [#90 State, Apply und Recovery](https://github.com/stackitcloud/stackit-landing-zone/issues/90) | Runner-Verlust/Teilfehler ohne State-Verlust; genau freigegebener Plan; Backend-Migration und Folgeplan nachgewiesen |
| B1 · Self-Service | [#91 Verifizierte Tenants und STACKIT-Identitäten](https://github.com/stackitcloud/stackit-landing-zone/issues/91) | Vertrauenswürdige Org-/Owner-Bindung, Credential-Grants, zwei getrennte Organisationen, Widerruf funktioniert |
| B2 · Self-Service | [#92 Veröffentlichte Application Templates](https://github.com/stackitcloud/stackit-landing-zone/issues/92) | Unveränderliche Versionen; AO sieht nur freigegebene Templates/Eingaben; Cross-Tenant-Zugriff scheitert |
| A+B · Integration | [#93 Application-Instanzen](https://github.com/stackitcloud/stackit-landing-zone/issues/93) | Plattformvertrag, eigener State je Instanz, idempotente Bestellung, Policy-Prüfung und ausdrückliches Upgrade |
| C · Assistenz | [#94 Model-Serving-Chat](https://github.com/stackitcloud/stackit-landing-zone/issues/94) | Rückfragen und validierter Vorschlag mit bestätigtem Diff; keine Secrets im Modell, keine autonomen Ressourcenaktionen |
| D · Fortlaufend | [#95 Betrieb und Merge-Abnahme](https://github.com/stackitcloud/stackit-landing-zone/issues/95) | Aktuelle CI-Nachweise, Recovery-/Rollout-Runbook, geprüfter PR und ausdrücklicher Merge-Entscheid |

A1 und B1 können parallel laufen. B2 kann mit deaktivierter Ausführung vorbereitet
werden; Veröffentlichung für reale Kunden benötigt B1. C kann den vorhandenen
Editorvertrag nutzen und muss später dieselben Template-Policies wie das Formular
prüfen. #93 benötigt Ergebnisse aus A2, B1 und B2. D begleitet alle Stränge.

Die erste Application-Vorlage sollte ein **Anwendungsprojekt mit Basisdiensten**
sein. VM, eigener Kubernetes-Cluster und Namespace sind unterschiedliche Angebote
und dürfen erst so heißen, wenn der Accelerator sie tatsächlich bereitstellt.
Für restriktive Application-Owner-Rechte ist [#69](https://github.com/stackitcloud/stackit-landing-zone/issues/69)
zu klären: Produktrolle und STACKIT-Projekt-Owner sind nicht dasselbe.

## Korrektur: Projekt-Templates statt Projektinstanzen

Neue Plattformentwürfe definieren [Projekt-Templates](project-template-drafts.md).
Der Plattformexport enthält keine konkreten Anwendungsprojekte. Die bisherige
Projektbearbeitung bleibt nur für Altbestände erhalten; eine ausdrückliche Kopie
überführt sie in den neuen Ablauf. Zusätzlich sind tenantgebundene Versionen und
persistente Application-Owner-Bestellaufträge lokal implementiert, standardmäßig
per Featureflag deaktiviert. Dies ist ein Testkatalog mit gesperrter Cloud-Ausführung,
keine produktive Instanziierung oder Abnahme von #91–#93; siehe
[Testkatalog und Bestellungen](template-parameters-and-bindings.md#tenantgebundener-testkatalog-und-bestellungen).

## Begonnenes Umsetzungspaket

- [x] Ist-Zustand anhand produktiver Aufrufer und Tests geprüft; offene Fähigkeiten als #89–#95 erfasst.
- [x] Alle 17 vorhandenen Accelerator-Issues nach Wichtigkeit und Aufwand eingeordnet; bestehende Labels erhalten.
- [x] Governance-Freigabe für Organisationsrollen und Ordner ergänzt, gegen das gepinnte Modul mit nativen OpenTofu-Mockplänen geprüft. Null/leere Beschreibungen blockieren nicht; befüllte Beschreibungen bleiben bis #82 gesperrt.
- [x] Optionalen Service-Account-Föderationseditor für CI/CD mit erklärten Claims und exakter GitHub-Vorlage ergänzt; Ausführung weiterhin separat gesperrt.
- [x] Standalone-v3-Planpfad implementiert: gemeinsamer Datensatz für Vorbereitung/Broker, strukturelle Freigabe statt Template-Namen.
- [x] Frontend verwendet dieselben Ausführungskriterien und zeigt Sperrgründe.
- [x] Einladungslinks bei bereits geöffneter App und blockiertem Browser-Speicher robuster verarbeitet.
- [x] Lokal: 123 Unit-, 22 PostgreSQL- und 38 Desktop-/Mobil-Browserprüfungen bestanden; echter OpenTofu-Plan-Summary-Test sowie 4 native Application-Vertragstests mit OpenTofu 1.12.6 erfolgreich.
- [x] Native Application-Vertragstests in den bestehenden Release-CI-Schritt `npm run test:plan` integriert (temporäre Kopie, ohne Cloud-Credentials und Backend).
- [x] Commit `9aa3322`: [Validate Configurator](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36849188417) und [Release](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36849188406) erfolgreich. CF-/Datenbank-/Secrets-/Runner-Prüfungen erfolgreich; öffentlicher Smoke-Test: Health und SPA-Routen 200, geschützte APIs anonym 401, neues Bundle `/assets/index-tcjYrzmJ.js` bestätigt.
- [x] Persönlichen Kunden-Plan abnehmen: erfolgreicher Kunden-Plan, zuletzt `6fb07c43-bd5d-47e7-bf30-3a14eb10b605`; OpenTofu-1.12.6-Completeness nativ und lokal abgesichert.
- [x] Lokale Implementierung des Plattform-Apply-/State-/Recovery-Pakets #90 samt gespeicherter Planbindung und unabhaengigem CLI-Zugang.
- [ ] Ausdrücklich freigegebene Kunden-Abnahme fuer Apply, Migration, Folgeplan und Recovery durchfuehren.

Die erste v3-Ausführungsfreigabe umfasst nur die tatsächlich geprüfte Teilmenge:
eu01, explizit Public-Projekte und Sandboxes mit den unterstützten Grundeinstellungen.
Zusätzliche Netzwerk-, Kubernetes-, Firewall- und Plattformdienste bleiben gesperrt.
Der vollständige Editor/Export bleibt nutzbar. Diese Teilfreigabe schließt #89 nicht.
Organisationstenants erlauben inzwischen eigene PE-Credentials und Produktkataloge;
Cloud-Ausführung bleibt separat gesperrt. Die Zugangsfunktion hebt diese Grenze nicht auf.

## Checkliste vor dem gewünschten MVP-Merge

- [ ] #89–#94 anhand ihrer Abnahmekriterien abgeschlossen; Restumfang nicht stillschweigend verschoben.
- [ ] Zwei echte Benutzer in zwei Organisationen durchlaufen ihre jeweilige Rolle; fremde Daten/Jobs/Secrets bleiben unzugänglich.
- [ ] Ein Platform Engineer veröffentlicht eine Version; ein Application Owner bestellt eine Instanz; Änderung/Upgrade erfolgt nur ausdrücklich.
- [ ] Kunden-Plan, ausdrücklich genehmigter Apply, Folgeplan und unterbrochener Lauf mit Recovery nachgewiesen.
- [ ] Model-Serving-Assistent hilft bei einer unvollständigen Eingabe und zeigt einen überprüfbaren Vorschlag.
- [ ] Finale Revision: Lint/Build/Unit, Browser, echte PostgreSQL-RLS/Migrationen, native OpenTofu-Verträge und Template-Konsistenz grün.
- [ ] Source-Pins, Lockfiles, IaC-/App-Trennung, CODEOWNERS und Diff zu aktuellem main geprüft; keine Secrets/States im Commit.
- [ ] Backup/Restore, Rotation, Runner-Kapazität/Cleanup sowie Rollback mit DB-Kompatibilität dokumentiert und getestet.
- [ ] Native Application-Vertragstests zusätzlich als verpflichtenden PR-/main-Check verdrahten (aktuell Release-CI und lokal).
- [ ] CI-Übergang geklärt: automatischer App-Release läuft derzeit nur auf dem Featurebranch; auf main existiert manueller Dispatch. Trigger nicht unbemerkt ändern.
- [ ] PR beschreibt vorhandene Grenzen und belastbare Tests; Branchschutz und erforderliche Reviews geprüft.
- [ ] Benutzer gibt den Merge als nächsten Schritt frei.

Ein früherer Merge der klar als Vorabversion gekennzeichneten Grundlage ist eine
separate bewusste Entscheidung. Er darf nicht als abgeschlossener MVP bezeichnet
werden. Aktueller Vergleich: main `2bb7c75`, Featurestand vor diesem Paket 74
Commits voraus, 0 zurück, 295 geänderte Dateien. Vor PR erneut vergleichen.

## Danach: Accelerator-Backlog

Die [Priorisierung](backlog-priorities.md) enthält alle vorhandenen Issues mit
Abhängigkeiten. Zuerst Korrektheit (#84, #81, #82), dann Self-Service-Verträge,
Plattformreferenzen und komplexere Netzwerk-/Kubernetes-Fähigkeiten. Wichtigkeit
geht vor bloßer Einfachheit; #59 ist klein, aber weniger dringlich.

Keine automatische Kundenlöschung. [#22](https://github.com/stackitcloud/stackit-landing-zone/issues/22)
bleibt eine externe Lifecycle-Grenze: laut dem verlinkten
[Provider-Issue #1075](https://github.com/stackitcloud/terraform-provider-stackit/issues/1075)
werden Projekte bei Destroy zunaechst zur Loeschung vorgemerkt und koennen bis
zu sieben Tage als Folder-Kinder bestehen bleiben. Folder-Delete kann dann mit
409 scheitern; eine Loeschvormerkung ist kein Nachweis vollstaendiger Bereinigung.
Der verlinkte Issue dokumentiert keinen bestaetigten Fix. Kein automatischer
Folder-Destroy, kein State-Remove als Ersatz fuer Cloud-Loeschung und keine
automatische Wiederholung eines fehlgeschlagenen Destroy.

Fuer die gemeinsam freigegebene #93-Cloud-Abnahme gilt: bestehende Landing-Zone-
Organisation und bestehende Folder verwenden, neue getrennte Application-
Testinstanz mit eigenem State-Key. Zuerst prueft der Benutzer die Konfiguration,
danach erstellen wir gemeinsam den Cloud-Plan; Apply erfolgt erst nach seiner
ausdruecklichen Freigabe des konkreten gespeicherten Plans. Bestehende Folder
werden dabei weder geloescht noch ersetzt. Die neue lokale Plan-Auswertung
sperrt Folder-Delete/Replace; sie ist noch nicht im aktiven Runner-Paket ausgerollt.
Testprojekt-Loeschung ist ein gesonderter, ausdruecklicher Lifecycle-Schritt;
eine Vormerkung darf weder als vollstaendige Bereinigung noch als freier Test-
Namensraum fuer eine sofortige Neuerstellung behandelt werden.

Bekannte private Kubernetes-/regionale
Namespace-Grenzen (#37/#80) werden durch passende Ausführungssperren berücksichtigt,
nicht durch eine erfolgreiche Login- oder Credential-Prüfung aufgehoben.

## Persönliche Prüfung des veröffentlichten Pakets

1. Im persönlichen Arbeitsbereich eine **neue** Standalone-Konfiguration in eu01
   erstellen, Organisation und Verantwortliche setzen, im eigenen Fork speichern.
2. „Deployment vorbereiten“ wählen, passenden Zugang prüfen und Vorbereitung
   speichern. Danach **nur bei noch nicht existierender Landing Zone ohne State**
   einen Erstbereitstellungsplan starten; Ergebnis nach Reload prüfen. Bei neuen
   Plattformentwürfen plant dieser ausschließlich die Plattform, keine Projekte
   aus den enthaltenen Template-Entwürfen.
3. Eine Konfiguration mit nicht freigegebener Connectivity-/Kubernetes-Komponente
   auswählen: Speichern/Export bleiben möglich, die Vorbereitung nennt Sperrgründe.
4. Optional einen neuen Einladungslink bei bereits geöffneter App öffnen: Die
   aktuelle Einladung erscheint. Vor einem Beitritt bleibt die Bestätigung nötig.

Kein Kunden-Apply, keine Kundenressourcenanlage und kein Merge wurden durch dieses
Release ausgeführt. Der Kunden-Plan ist noch nicht persönlich abgenommen.

## Template-Parameter und Verknüpfungen (2026-10-01)

- [x] Optionaler versionierter Parametervertrag ohne Umdeutung bestehender Entwürfe.
- [x] Stage, Secrets Manager, Observability-Aktivierung, Leistungsklasse und explizite ACL-Auswahl mit festen Vorgaben oder begrenzten Bestelleingaben.
- [x] Gemeinsamer Resolver für Editorvorschau und Application-Vertragsprototyp; Default-/Override-/Typ-/Tenantprüfungen.
- [x] Stage-Naming im separaten Application-Root, bestehendes Naming ohne Stage unverändert.
- [x] Symbolische Projektnetzbindung mit ausdrücklicher Ausführungssperre und [Issue #96](https://github.com/stackitcloud/stackit-landing-zone/issues/96) für Egress-Qualifikation.
- [ ] Weitere Parameterfelder und Sandbox-Vertrag qualifizieren.
- [ ] Unveränderliche Veröffentlichung, Application-Owner-Bestellung und produktive Ausführung weiterhin #92/#93.

[Vertrag, Grenzen und Prüfungen](template-parameters-and-bindings.md).
