# MVP-Abnahme und Weg zum Merge

Stand: 2026-10-01. Dies ist die aktuelle Arbeitsliste; die ausführliche
[Architekturplanung](planning.md) bleibt das Entscheidungsprotokoll.
**Der fachliche MVP ist noch nicht erreicht. Ein Merge ist noch nicht freigegeben.**

## Was MVP hier bedeutet

Der ursprüngliche Umfang umfasst Editor, benutzergebundene Fork-Speicherung,
sichere persönliche Zugänge, grafische Darstellung, Plan **und Apply**, einen
STACKIT-Model-Serving-Assistenten sowie Betrieb auf CF mit IaC. Hinzu kommt die
bestätigte Trennung zwischen Platform Engineer und Application Owner:
organisationseigene veröffentlichte Projekt-Templates, unabhängige Instanzen,
unveränderliche Versionen und ausdrückliche Upgrades. Mehrere voneinander
unabhängige Kundenorganisationen müssen von Anfang an sicher getrennt sein.

Eine nutzbare Editor-/Plan-Vorabversion ist ein Zwischenstand. Sie ersetzt weder
diesen Umfang noch die Abnahme des Application-Self-Service. Optionale Drift
Detection/Correction, eigener Terraform-Code aus Forks und private Kubernetes-
Runner bleiben eigene Ausbaustufen. STACKIT-IdP-Login ist optional; ein belastbarer
Nachweis der STACKIT-Organisation und des Projektverantwortlichen ist es nicht.

## Bestandsaufnahme

| Bereich | Nachgewiesen | Noch nötig |
|---|---|---|
| Plattform | CF, PostgreSQL, Secrets Manager, Model-Serving-Token, getrennte IaC-/Release-Pipelines | Restore-/Rotation-/Fehlerfallabnahme und Betriebslimits |
| Login / GitHub | Persönliche GitHub-Verbindung, interne Benutzeridentität, Forks, atomare JSON+tfvars-Ablage | GitHub bleibt Connector; STACKIT-OIDC-Ticket offen |
| Editor | Gemeinsames Schema v3, Module, Regionen/SNAs, VPN-Assistent, Graph, Produktkataloge | Fehlende Kataloganbindungen nach Bedarf; Editorumfang ist keine Ausführungsfreigabe |
| Zugänge | Persönliche Secret-Ablage, Organisationszugriffstest, unveränderliche Vorbereitung | Organisationsgebundene Credential-Nutzung und verifizierte menschliche Identität |
| Plan | Isolierter CF-Task aus vorab gestagtem Droplet, gepinnter Code, Status und aggregiertes Ergebnis | Neuer Editor zunächst nur konservative Standalone-Teilmenge; echter persönlicher Kunden-Plan noch nicht abgenommen |
| Apply / State | Bootstrap-Lebenszyklus beschrieben | Dauerhafter Initial-State, gespeicherter freizugebender Plan, Apply, Migration, Folgeplan und Recovery |
| Organisationen | Rollen, Einladungen, Mitgliederverwaltung, Arbeitsbereichswechsel, Archivierung leerer Entwürfe | Organisationen sind **unverifiziert**; Ausführung dort ist absichtlich gesperrt |
| Application-Self-Service | Architektur und isolierter Compiler/Root als Prototyp | Veröffentlichung, Katalog, Plattformvertrag, Instanzen, Ausführung und Upgrades |
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
überführt sie in den neuen Ablauf. Das ist der Entwurfsteil von #92, noch keine
tenantgebundene Veröffentlichung oder Application-Owner-Bestellung.

## Begonnenes Umsetzungspaket

- [x] Ist-Zustand anhand produktiver Aufrufer und Tests geprüft; offene Fähigkeiten als #89–#95 erfasst.
- [x] Alle 17 vorhandenen Accelerator-Issues nach Wichtigkeit und Aufwand eingeordnet; bestehende Labels erhalten.
- [x] Standalone-v3-Planpfad implementiert: gemeinsamer Datensatz für Vorbereitung/Broker, strukturelle Freigabe statt Template-Namen.
- [x] Frontend verwendet dieselben Ausführungskriterien und zeigt Sperrgründe.
- [x] Einladungslinks bei bereits geöffneter App und blockiertem Browser-Speicher robuster verarbeitet.
- [x] Lokal: 123 Unit-, 22 PostgreSQL- und 38 Desktop-/Mobil-Browserprüfungen bestanden; echter OpenTofu-Plan-Summary-Test sowie 4 native Application-Vertragstests mit OpenTofu 1.12.6 erfolgreich.
- [x] Native Application-Vertragstests in den bestehenden Release-CI-Schritt `npm run test:plan` integriert (temporäre Kopie, ohne Cloud-Credentials und Backend).
- [x] Commit `9aa3322`: [Validate Configurator](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36849188417) und [Release](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36849188406) erfolgreich. CF-/Datenbank-/Secrets-/Runner-Prüfungen erfolgreich; öffentlicher Smoke-Test: Health und SPA-Routen 200, geschützte APIs anonym 401, neues Bundle `/assets/index-tcjYrzmJ.js` bestätigt.
- [ ] Persönlichen Kunden-Plan mit einer neuen Standalone-Konfiguration abnehmen.
- [ ] Apply-/Recovery-Paket #90 implementieren und ausdrücklich freigegebene Kunden-Abnahme durchführen.

Die erste v3-Ausführungsfreigabe umfasst nur die tatsächlich geprüfte Teilmenge:
eu01, explizit Public-Projekte und Sandboxes mit den unterstützten Grundeinstellungen.
Zusätzliche Netzwerk-, Kubernetes-, Firewall- und Plattformdienste bleiben gesperrt.
Der vollständige Editor/Export bleibt nutzbar. Diese Teilfreigabe schließt #89 nicht.
Organisationstenants bleiben bis #91 von Credentials und Ausführung ausgeschlossen.

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
bleibt eine externe Lifecycle-Grenze. Bekannte private Kubernetes-/regionale
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
