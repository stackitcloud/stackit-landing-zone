# Erstbereitstellungspläne

Stand: 2026-10-02. Umsetzung auf `feature/landing-zone-configurator`.

## Was der Benutzer testen kann (nach erfolgreichem Release)

1. **Deployments** öffnen und im Abschnitt **Erstbereitstellung planen** eine
   gespeicherte Vorbereitung auswählen.
2. Nur für eine neue Landing Zone bestätigen, dass noch keine Ressourcen und kein
   bestehender State zu dieser Konfiguration existieren. Bestehende/teilweise
   erzeugte Landing Zones sind in diesem Ablauf nicht unterstützt.
3. **Erstbereitstellung planen** starten. Erwartete Stationen: Runner vorbereiten,
   initialisieren, validieren, planen und abgeschlossen/fehlgeschlagen.
4. Seite neu laden: Auftrag und Ergebnis bleiben erhalten. Anlegen, Ändern,
   Ersetzen, Löschen, Datenlesen und geänderte Ausgaben werden getrennt gezählt.
5. Optional einen weiteren Plan abbrechen. Abbruch entzieht sofort den Broker-
   Zugriff; das Stoppen des CF-Tasks durch Cleanup erfolgt zeitversetzt.

**Keine Kunden-Ausführung in dieser Abnahme.** Der Benutzer verlangt ausdrücklich
eine neue Freigabe vor jedem Kunden-Apply; Infrastrukturfreigaben gelten nicht dafür.
Der ältere Erstbereitstellungsplan bleibt plan-only. Der neue Plattformpfad besitzt
einen gated Apply-Endpunkt: nur bei aktivierter Execution, passendem unveränderlichem
Planartefakt/Hash, bestätigter Zielorganisation und erneut geprüften Zugriffs-,
Quell- und State-Bindungen. Ein Export ist keine Apply-Freigabe. Kein Destroy-Pfad.

## Plattformentwürfe mit Projekt-Templates

Neue Editor-Konfigurationen enthalten Projekt-Template-Entwürfe statt konkreter
Anwendungsprojekte. Ihr tfvars-Export und damit ihr Erstbereitstellungsplan enthalten
**nur die Plattform**, keine Instanzen dieser Vorlagen. Alte Gesamtkonfigurationen
behalten ihre bisherigen Projekte. [Details und Bestandsschutz](project-template-drafts.md).

## Application-Plan-Input und Plattformvertrag

Der lokal aktivierte Application-Katalog hat einen eigenen Freigabe- und Bestellpfad.
Er startet **noch keinen CF-Task** und legt keinen State an. `Plan-Input prüfen`
ist eine erneute serverseitige Qualifikation und zeigt Terraform-Variablen,
Entrypoint und Ausführungssperre, kein berechnetes Ressourcenergebnis.

Ein Platform Engineer kann im Application-Katalog einen JSON-Vertrag aus bereits
angewendeten, geprüften Plattform-Outputs laden. Das Dokument ist kein Terraform-State
und enthält keine Credentials. Minimaler Importvertrag:

```json
{
  "schema_version": 1,
  "organization_id": "00000000-0000-4000-8000-000000000001",
  "targets": {
    "public": {
      "folder_id": "00000000-0000-4000-8000-000000000002",
      "region": "eu01",
      "corporate": false,
      "network_area_id": null,
      "firewall_next_hop_ip": null,
      "ipv4_nameservers": null
    }
  }
}
```

Die UUIDs sind Platzhalter und müssen aus der tatsächlich angewendeten Plattform
kommen. Die Freigabe ist eine bewusste PE-Prüfung der Outputs, **keine automatische
Bestätigung, dass ein angegebener Ordner existiert oder zur Organisation gehört**.
Diese Ressourcenprüfung bleibt vor einer zukünftigen Job-/Credential-Freigabe nötig.

- GET/POST `/api/v1/applications/platform-contracts`: aktuelle Tenant-Mitgliedschaft;
  POST zusätzlich PE-Rolle, gültige menschliche STACKIT-Identität, Origin/CSRF,
  `confirmApproval: true` und gespeicherten SA-Zugang. Optional `credentialProfileId`;
  bei genau einem gespeicherten Profil automatische Auswahl. Organisationszugriff
  wird technisch geprüft, ohne eine zweite menschliche OAuth-Anmeldung zu verlangen.
- Tenant und Revision werden serverseitig bestimmt. Migration 014 persistiert
  unveränderliche Vertragsversionen mit Forced RLS und technischem Prüf-/Versionsnachweis.
  Ein Zugangstest oder Vertrag ist keine Apply-Freigabe.
- POST `/api/v1/applications/templates` kann `platformRevision` und `targetKey`
  gemeinsam binden. Region und Projektart müssen zum Vertragsziel passen;
  tenantfremde Vertrags-IDs werden nicht sichtbar. Änderung erzeugt eine neue Version.
- POST `/api/v1/applications/instances/:id/plan-input` akzeptiert nur `{}`.
  Der Besitzer wird aus Session und Bestellung ermittelt; fremde Bestellungen und
  Client-Identitäts-/Backend-Overrides werden abgewiesen. Identitätsablauf, Widerruf,
  Rollenentzug und geänderte Besteller-E-Mail werden erneut geprüft.
- Der Compiler verwendet exakt die Vertrags- und Template-Version der Bestellung,
  feste Parameterregeln und den eigenen Instanz-State-Key. Die MVP-Teilmenge ist
  Public mit lokalem Netz, ohne Observability-Ausführung oder Namespace-Dienste.
  Die Antwort meldet ausdrücklich `cloudPlanExecuted: false` und
  `executionEnabled: false`; keine Schlüssel werden an den Browser geliefert.
  Die unveraenderliche Versions-/Bestellpolicy wird als `applyPolicy` uebernommen
  (`approval-required` oder `direct`); `requiresExplicitApplyApproval: true`
  bleibt fuer beide gesetzt. Eine direkte Policy ist keine Ausfuehrungsfreigabe.

Für den tatsächlichen eigenen Cloud-Plan fehlen noch ein unveränderlich freigegebenes
Application-Runner-Artefakt, getrenntes State-Backend mit Locking und eng begrenzte
serverseitige Nutzung des PE-Zugangs durch genau den autorisierten Job. Der bisherige
Runner-Pin enthält kein Application-Root. Er wird nicht auf ungeprüften Arbeitsbaumcode
umgestellt. Application-Apply bleibt deaktiviert; der freigabegebundene
Plattform-Apply-Pfad ist davon getrennt.

## Gemeinsamer Editor und Ausführungsumfang

Schema v3 wird für eine konservative Standalone-Teilmenge unterstützt: eu01,
Organisations-Owner/Auditor, Ordner samt Namen und Owner-/Leseberechtigungen,
optional ein übergeordneter Ordner (UUID), explizit Public-Projekte in bestehenden
Gesamtkonfigurationen, Sandbox-Projekte, Grundeinstellungen und die bisherige
Secrets-Manager-Option. Leere oder nicht gesetzte Ordnerbeschreibungen sind zulässig;
gefüllte Beschreibungen werden bis zur Behebung von #82 gezielt abgewiesen, weil der
Accelerator sie nicht übernimmt. Netzwerk, Kubernetes, Firewall und zusätzliche Plattform-
oder Projektdienste bleiben für diesen Runner gesperrt. Die Prüfung erfolgt anhand
der effektiven Konfiguration, nicht anhand des Template-Namens. UI, Vorbereitung
und Broker verwenden `initialPlanIssues`; vor Übergabe der Zugangsdaten an den
Runner wird erneut geprüft. JSON und tfvars bleiben an dieselbe Git-Revision und
den unveränderten Export-Hash gebunden. Legacy-Dokumente bleiben unterstützt.

Die Organisationstenant-Sperren gelten weiter. Der ältere Erstbereitstellungsplan
verwendet leeren State. Im neuen Plattformpfad wird bestehender State ausschließlich
über die geprüfte Backend-Bindung verwendet; fehlende oder widersprüchliche Bindungen
dürfen keinen stillen Neustart mit leerem State auslösen.
Erweiterte Ausführung: [#89](https://github.com/stackitcloud/stackit-landing-zone/issues/89).

## Ablauf und Grenzen

**Private Kubernetes-APIs:** Der aktuelle CF-Runner hat keinen nachgewiesenen
Zugriff auf Kunden-SNAs. Ein erfolgreicher STACKIT-Zugangstest belegt diesen
Netzwerkpfad nicht. Auch Plan/Refresh mit Kubernetes-/Helm-Providern kann ihn
benötigen. Die zweistufige Ausführung aus
[#37](https://github.com/stackitcloud/stackit-landing-zone/issues/37) ist noch offen
und wird separat umgesetzt. Anforderungen an Ausführungssperren bei Erweiterung
des bisherigen Standalone-Vertrags stehen im
[Grenzenregister](accelerator-limitations.md#private-kubernetes-api-ausführungsgrenze).


- POST `/api/v1/plans` verlangt Session, exakten Origin, CSRF-Token und
  `confirmNewDeployment: true`. Nur eine eigene Vorbereitung mit eigenem
  gespeichertem Credential und Rolle admin/deployer wird akzeptiert.
- GitHub-Fork-Zugriff, festgehaltener Head und generierter tfvars-Export werden
  mit dem GitHub-Benutzertoken erneut geprüft. Geänderter Fork-Head erfordert eine
  neue Vorbereitung; es wird keine andere Version still übernommen.
- SQL 004/005 persistiert Aufträge mit Forced RLS, Vorbereitung, Status, Engine-
  und Provider-Lock-Version sowie CF-Droplet-Referenz. Ein aktiver Auftrag pro
  Benutzer/Mandant, höchstens 20 Starts in 24 Stunden; Liste zeigt letzte 100.
- Der Dispatcher verwaltet ausschließlich die separate Organisation
  `lzc-dev-runners`, Space `plans`, SSH deaktiviert. Für jeden Auftrag erstellt er
  eine App ohne Route/Service-Bindings und kopiert das geprüfte Runner-Droplet.
  CF-Manager-Credentials verbleiben im vertrauenswürdigen API-Backend/Release.
- Der Runner erhält drei App-Variablen: Auftrags-ID, feste Broker-URL, zufälliges
  256-Bit-Ticket. In PostgreSQL liegt nur dessen Hash. Gültigkeit maximal 25 Minuten.
  Eine eng begrenzte SECURITY-DEFINER-Funktion löst das Ticket auf genau einen
  aktiven Auftrag auf; danach gelten Eigentümer-/Tenant-RLS und Rollenprüfung.
- Eingaben werden einmal ausgegeben, nach erneuter Rollen-, Profil-, Versions-
  und Organisationsprüfung. Andere Profile oder Mandanten sind nicht auswählbar.
  Die Terraform-Unterprozesse erhalten eine explizite Umgebung ohne Broker-Ticket.
- Fester Accelerator-Commit `a256f6896d11134fdc351786f1be5eba4e56b2e2`, OpenTofu
  1.12.6, Provider-Lock SHA-256
  `a52433c424472d6e618caa3a94579bbcd19b60b759d053cf0d5caf9ac6872888`.
  CI baut nur Upstream-Code dieses Commits und einen Linux-Provider-Mirror.
- OpenTofu 1.12.6 exportiert im Saved-Plan-JSON 1.2 kein Terraform-Feld `complete`.
  Der Worker darf Vollständigkeit für dieses genaue Format nur nach Prüfung der
  gepinnten Engine und seinem festen vollständigen Plan-Befehl ohne Targeting
  bestätigen. Der Summary-Parser verlangt diesen expliziten Engine-Kontext;
  fehlender Kontext, unbekannte Versionen/Formate oder Deferred-Metadaten bleiben
  `not-reported`, ein gemeldeter Teilplan bleibt `incomplete`. Fehlerstatus,
  offene/fehlgeschlagene Checks und alle Artefakt-/State-/Freigabebindungen
  sperren Apply weiterhin. Vorher gespeicherte Summaries werden nicht umgeschrieben.
- Direkte Befehle in `deploy/runner/run-plan.sh`: init mit readonly Lock, validate,
  plan mit detailed exit code und show. Kein frei wählbarer Befehl. Der neue
  Plattformpfad darf Apply nur mit dem freigegebenen gespeicherten Plan ausführen.
- Ergebnisprojektion enthält nur Zahlen, Status und feste Fehlercodes; keine
  Adressen, Attributwerte, Output-Namen, Rohdiagnosen oder Geheimnisse. Auch nicht
  als sensitive markierte Werte werden nicht in diese Summary exportiert.
  Separat zeigt der native lokale Runner dem berechtigten Plan-Eigentümer unter
  **OpenTofu-Ausgabe** die normale CLI-Textdarstellung: Live-Logs aus dem privaten
  aktiven Job oder `tofu show -no-color` des exakt hash-/paketgebundenen,
  verschlüsselt gespeicherten Planartefakts. Sitzung, Deployment-Rolle und
  Eigentümer-/Tenant-RLS werden vor jedem Zugriff geprüft; Antworten sind
  `no-store`. Ressourcenadressen und normale Attributwerte sind dort sichtbar,
  sensitive Werte bleiben durch OpenTofu maskiert. Bekannte Credential-Felder
  werden aus Live-Logs zusätzlich entfernt. Plan-Binary und `show -json` bleiben
  serverseitig. Es laufen kein neuer Cloud-Plan, kein Apply und kein Backend-Init;
  die Inspektion verwendet nur backendfreies Init und Show ohne geerbte Secrets.
  Die Apply-Ablauffrist bleibt unabhängig von der read-only Anzeige, solange das
  verschlüsselte Artefakt vorhanden ist. CF-Live-Ausgabetransport bleibt offen.
- Vor dem terminalen Ergebnis sichert der Worker den redigierten CLI-Mitschnitt
  von Init/Validate/Plan/Apply/Migration über `POST /api/runner/output`. Das
  auftragsspezifische Ticket muss gültig und die Eingabe bereits beansprucht sein;
  der Text darf nur einmal vor Abschluss geschrieben werden. Migration 020 legt
  dafür private Output-Spalten unter der bestehenden Eigentümer-/Tenant-RLS an.
  Der Broker verschlüsselt maximal 2 MiB mit AEAD und auftragsspezifischer AAD.
  Erfolgs- und Fehlerausgaben bleiben nach Cleanup und Reload lesbar, ohne laufenden
  Runner. Kürzungen sind gekennzeichnet. Ein harter Prozessabbruch oder gescheiterter
  Upload kann weiterhin historische Ausgabe verlieren; die best-effort Sicherung
  löst weder einen Apply-Retry aus noch ersetzt sie den dauerhaften State-Recovery-
  Empfangsnachweis. Apply-Nachweise zeigen den exakten Plan, SHA-256,
  Zielorganisation, das State-Backend des Auftrags und die Abschlusszeit.
  Ein inkompatibles natives Runner-Paket sperrt Apply bereits vor Dispatch;
  ein neuer Plan mit erneuter Prüfung und Freigabe ist erforderlich.
- Task: 1 GiB RAM, 4 GiB Disk, 18 Minuten Engine-Frist, private Dateien begrenzt.
  SQL-Frist: 25 Minuten. Maintenance alle 30 Sekunden, Cleanup nach mindestens
  30 Sekunden terminalem Status. Auch nach API-Neustart werden Aufträge abgeräumt.
  Bei CF-/Netzfehlern kann Cleanup länger dauern; Ticket-Ablauf bleibt unabhängig.
- Kein automatischer Dispatch-Wiederholungsversuch. Ein Prozessverlust vor Start
  führt zu Abbruch/Ablauf statt stiller Neuausführung. Es gibt noch keinen allgemeinen
  Queue-Scheduler und keine dauerhafte Runner-Heartbeat-Überwachung. Der neue
  Plattformpfad speichert Planartefakte verschlüsselt und bindet sie an Quelle,
  Engine und State-Version. CF-Quoten begrenzen die Gesamtkapazität zusätzlich.
- Vorbereitungen mit Plan-Nachweisen werden nicht gelöscht. Archivierung und
  Aufbewahrungsfristen der Metadaten sind ein nachfolgender Schritt.

## State-Lebenszyklus gemäß LZA

Entscheidung des Benutzers: bestehenden
[LZA-Bootstrap](https://github.com/stackitcloud/stackit-landing-zone/blob/main/docs/getting-started.md)
übernehmen. Der gespeicherte Zugang ist der Bootstrap-Service-Account; Projekt und
Account werden nicht erneut angelegt. Ein Plan legt weder Management-Projekt noch
Bucket an. Im neuen Plattformpfad dient das dauerhafte, verschlüsselte HTTP-Backend
nur dem Bootstrap, nicht als permanenter Ersatz für den Kunden-S3-State.

Beim separat freigegebenen ersten Apply erzeugt das Management-Modul den
Kunden-State-Bucket samt Credentials. Danach migriert der Runner mit
`tofu init -migrate-state`; die API bestätigt die Migration erst nach Abgleich von
State-Hash und Remote-Version/ETag sowie gebundener State-Version. Erst danach
wird der HTTP-Primärstate entfernt. Anschließend wird der verifizierte
Management-Service-Account verwendet. Das S3-Backend nutzt `use_lockfile = true`.
Application-Instanzen erhalten jeweils eigene Keys
`applications/<tenant-id>/<instance-id>/terraform.tfstate`; Plattform-,
Application- und Configurator-Infrastruktur-States bleiben getrennt.

Legacy-State-Zuordnungen sind mit `legacy_state_migration_required` gesperrt und
benötigen eine explizite Zuordnung/Migration, keinen neuen leeren State. Bei
`state_failed` oder unbestätigter Migration ist vor Wiederaufnahme der Recovery-
Export des vorhandenen States erforderlich. Der Runner übermittelt einen geprüften,
verschlüsselten Recovery-Nachweis und entfernt lokale Fehlerstates erst nach
passender dauerhafter Empfangsbestätigung. Das garantiert keine automatische
vollständige Wiederherstellung nach jedem harten Runner-Verlust; Abgleich und
operative Recovery bleiben erforderlich. Ein echter Cloud-S3-Lock-Test wurde
nicht durchgeführt. Kein Kunden-Apply wurde in dieser Umsetzung ausgeführt.

## Portabler GitHub-Export

Der Export schreibt atomar `landing-zone.json`, `landing-zone.tfvars` und eine
kurze CLI-Anleitung unter `src/config/custom/<configuration-id>/`. Bei einer
serverseitig verifizierten S3-Bindung kommt `backend.tf.json` hinzu: vollständige
Standard-Terraform-Backend-Konfiguration ohne AWS-/SA-Schlüssel oder State-Datei.
Nur `backend_not_found` erlaubt einen neuen Bootstrap-Export ohne Backend;
Service- und Berechtigungsfehler brechen das Speichern ab. Eine vorhandene
Backend-Datei muss exakt dem deterministischen Git-Blob-Hash des geprüften
Deskriptors entsprechen. Andernfalls gilt `backend_configuration_changed`;
fehlt die Bindung, gilt `backend_configuration_missing` statt Metadatenverlust.

Beim ersten DB-zu-GitHub-Export bleibt die Konfigurations-ID erhalten. Eine
bereits geöffnete Git-Konfiguration behält ihre eigene ID. Bei abweichender
Quell-ID exportiert der Server den gebundenen Deskriptor ohne Alias- oder
State-Mutation; eine neue Vorbereitung muss den registrierten Backend-ID
ausdrücklich auswählen. Für unabhängigen CLI-Betrieb: geprüften Accelerator-Code
verwenden, ursprünglichen Backend-Block in `src/backend.tf` deaktivieren,
exportierte Backend-Datei nach `src/backend.tf.json` kopieren und genau einen
aktiven Backend-Block behalten. AWS-Zugang aus dem Management Secrets Manager
gemäß LZA in die Umgebung laden, dann `tofu init` und
`tofu plan -var-file=config/custom/<configuration-id>/landing-zone.tfvars`.
Ohne S3-Bindung zuerst LZA-Bootstrap und verifizierte State-Migration abschließen.

## Abnahme

- [x] API: Session/CSRF, striktes Eingabeschema, Erstbereitstellungsbestätigung,
  persönliches GitHub-Token und kein Apply-Endpunkt getestet.
- [x] PostgreSQL: fremde Aufträge, konkurrierender Start, Ticket-Replay, Status-
  Reihenfolge, Ablauf und gezieltes Cleanup getestet.
- [x] CF-Client: eigene App, feste Befehle, nur drei Job-Variablen und keine Route.
- [x] Desktop/Mobil: Plan-Start, laufender Status, Ergebnis nach Reload, kein Apply.
- [x] Lokaler echter OpenTofu-Vertragstest ohne Cloud-Zugang und ohne Apply.
- [x] Separate CF-Organisation samt Manager per Plattform-IaC erstellt.
- [x] Runner-Space/Rollen per Runtime-IaC erfolgreich angewendet.
- [x] Linux-Paket, Provider-Mirror und CF-Engine-Test erfolgreich.
- [x] Live-App: separaten Runner ohne Service-Bindings prüfen, ungültiges Ticket
  darf keinen Kundenauftrag ausführen; Probe-App entfernen.
- [ ] Erster persönlicher Kunden-Plan durch den Benutzer.

## Live-Abnahme vom 2026-09-30

[Release 36727211809](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36727211809)
für `b5686ef` erfolgreich: CF-Engine init/validate, Datenbankmigrationen,
PostgreSQL-/Secrets-Manager-Verbindungen, separate Probe-App und öffentliche
Route. Runner-Verwaltungsidentität hat keinen Zugriff auf die Configurator-App;
Probe-App ohne Routen oder Service-Bindings. Zufälliges, nicht registriertes Ticket
führte zu einem fehlgeschlagenen Task. Dies ist eine Infrastruktur-/Isolationsprobe,
noch kein erfolgreicher persönlicher Kunden-Plan.

Gemessen vom Dispatch bis zur Task-Erstellung: **3.907 ms**; bis zum beobachteten
Task-Ende: **12.244 ms**. Ein Einzelwert, keine Latenzgarantie. Die Probe nutzt die
vorab gestagte Vorlage, keinen `cf push` pro Auftrag. Reguläre Jobausführung hat
zusätzlich Eingabe-/Zugriffsprüfung und OpenTofu-Laufzeit. Kein Kunden-Apply.

## Quellen

[OpenTofu JSON-Format](https://opentofu.org/docs/internals/json-format/),
[Plan-Exitcodes](https://opentofu.org/docs/cli/commands/plan/),
[CF V3 Droplet-Kopie](https://v3-apidocs.cloudfoundry.org/version/3.199.0/index.html#copy-a-droplet),
[CF V3 Tasks](https://v3-apidocs.cloudfoundry.org/version/3.199.0/index.html#create-a-task).

## Release des v3-Standalone-Planpfads (2026-10-01)

Commit `9aa3322`, [Release 36849188406](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36849188406)
und [Validierung 36849188417](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36849188417)
erfolgreich. Lokal 123 Unit-, 22 PostgreSQL- und 38 Browserprüfungen; echter
OpenTofu-Plan-Summary-Test und vier native Application-Root-Verträge mit 1.12.6.
Die Datenbankprüfung umfasst Legacy/v3 und die erneute Sperrprüfung im Broker.
Die Live-App liefert das neue Bundle, Health 200 und anonym geschützte APIs 401.
Dies ist keine persönliche Kunden-Plan-Abnahme und kein Kunden-Apply.

## Governance-Qualifikation und Service-Account-Föderation (2026-10-01)

Die Freigabe der Governance-Eingaben wird zusätzlich mit dem tatsächlich
verwendeten Governance-Modul geprüft: `npm run test:plan` ruft den separaten
`test-governance-contract.sh` auf. Quellhashes binden die Prüfung an den
Accelerator-Pin. OpenTofu 1.12.6 plant mit Mock-Providern in bereinigter Umgebung,
ohne Cloud-Credentials und ohne Apply. Geprüft werden Organisationsrollen
`owner`/`organization.auditor`, Ordnerrollen `owner`/`auditor`, das Auslassen
doppelter Ordnerzuweisungen für Organisations-Owner sowie beide Elternvarianten.
Diese lokale Qualifikation ersetzt keinen Plan gegen die konkrete Kundenorganisation.

**Service-Account-Föderation für CI/CD** ist eine optionale Editor-Komponente.
Sie regelt, welche OIDC-Tokens externer Pipelines den Management-Service-Account
nutzen dürfen; sie ist keine Benutzeranmeldung am Configurator.
`issuer` ist der vertrauenswürdige Aussteller, `aud` die Token-Zielgruppe und
`sub` beispielsweise das konkrete GitHub-Repository mit Branch. Bedingungen
verwenden den vom gepinnten Provider unterstützten Vergleich `equals`; `aud`
ist erforderlich. Die GitHub-Vorlage begrenzt `sub` auf einen angegebenen Branch
und gilt nicht unverändert für Jobs mit GitHub Environments.

Die Komponente richtet keinen Workflow oder Token-Austausch ein und entfernt
keine bestehenden Schlüssel. Für den aktuellen Configurator-Runner und einen
kleinen Erstbereitstellungsplan ist sie nicht erforderlich. Ihre Ausführung
bleibt bis zur gesonderten Runner-Qualifikation gesperrt; Speichern und Bearbeiten
der Konfiguration bleiben möglich.

Quelle: [STACKIT Provider 0.114.0 – Service Account Federated Identity Provider](https://registry.terraform.io/providers/stackitcloud/stackit/0.114.0/docs/resources/service_account_federated_identity_provider).

### Release-Nachweis

- Quellstand `64e33cb`, [Release 36856248765](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36856248765) und [Validierung 36856248770](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36856248770) erfolgreich.
- Lokal: 140 Unit-Tests, Desktop-/Mobil-Browserprüfung einschließlich Überlaufprüfung, drei Governance-Mockpläne sowie die vorhandenen OpenTofu-Plan-/Application-Vertragstests erfolgreich.
- Live: SPA und Assets HTTP 200 (`index-CnPzJNzo.js`, `index-DoULK2fp.css`), `/healthz` HTTP 200, anonyme Session HTTP 401. Release-Verbindungstests erfolgreich.
- Kein Kunden-Apply, keine Abnahme eines echten Kunden-Plans und kein Merge nach main.

## Begrenzte Plattform-Credential-Grants

Lokal implementiert am 2026-10-05, noch nicht in der laufenden Kunden-API
aktiviert: Migration `025_plan_credential_grants.sql` legt bei ausdruecklichem
Plan-Start beziehungsweise bestehender ausdruecklicher Apply-Freigabe einen
Grant in derselben Transaktion an. Es gibt keine allgemeine Credential-
Delegation und keine automatische Nachruestung fuer alte wartende Jobs.

Der unveraenderliche Beleg bindet Job, Tenant, Benutzer, Vorbereitung,
Organisation, Credential-Profil, Secret-Version, Key-ID, Manifest-Hash und
Operation (`plan` oder `apply`). Seine Gueltigkeit endet spaetestens mit
Job-Ticket oder ausstellender Sitzung. Er enthaelt keine Schluessel oder Tokens.
SQL prueft die Bindung an den echten Job und dessen Vorbereitungsdaten;
RLS begrenzt Zugriff auf den eigenen aktuell autorisierten Deployment-Benutzer.

Der Runner beansprucht den Grant einmalig, bevor die technische Credential-
Pruefung oder der Secret-Abruf stattfinden. Fehlende, abgelaufene, widerrufene
oder abweichende Grants sperren diese Nutzung. Vor Rueckgabe von Schluessel,
Backend und gegebenenfalls gespeichertem Plan werden Grant, Ablauf und
initialisierender Job erneut geprueft. Ein fehlgeschlagener Claim wird nicht
zurueckgesetzt; ein neuer Auftrag verlangt eine neue ausdrueckliche Freigabe.
Parallele Input-Anfragen koennen nur einmal Credentials erhalten.

`POST /api/v1/plans/{id}/credential-grant/revoke` verlangt Origin, CSRF, den
aktuellen `x-lzc-tenant` und ausschliesslich
`{"confirmCredentialGrantRevocation":true}`. Wiederholter Widerruf liefert
denselben Beleg. Normales Plan-Abbrechen widerruft einen noch ungenutzten
Grant ebenfalls. Bereits beanspruchte Grants liefern
`credential_grant_already_consumed`; bereits uebertragene Credentials koennen
nicht aus einem Runner zurueckgeholt werden. Laufender Worker, Cloud-IAM-
Schluesselrotation und Recovery muessen bei einem solchen Vorfall gesondert
behandelt werden. Ticketgebundene Ergebnis-/Recovery-Endpunkte bleiben
unveraendert und sind nicht erneut Credential-Ausgabe.

Diese Grenze beschraenkt den Credential-Abruf, nicht die Cloud-IAM-Rechte des
Schluessels oder eine bereits laufende Operation. Least-Privilege-Qualifikation,
Application-Root-/Instanz-Dispatch mit eigenem State und Grant sowie echte
Zwei-Organisations-/Widerrufsabnahme bleiben #91/#93. AO erhalten durch diesen
Schritt keinen Zugriff auf Plattform-Credentials. 31 echte isolierte PostgreSQL-
Broker-/Grantfaelle und der kanonische Gesamtcheck bestehen.

## Lokaler Application-Runner-Root (2026-10-05)

Der Feature-Zwischenstand ist lokal als `4ad9367` gesichert. Der separate
Application-Quell-Pin ist `4d15d7870afa323badd93559d8b37c5a8d138dcf`;
Backend, Provider und Versionsanforderungen liegen in getrennten Dateien.
Der bisherige Plattform-Pin `a256f6896d11134fdc351786f1be5eba4e56b2e2`
und bereits gebundene Runner-Pakete bleiben unveraendert.

Mit `LZC_LOCAL_RUNNER_PACKAGE=true` und `LZC_PACKAGE_APPLICATION_ROOT=true`
packt das Build-Skript zusaetzlich ausschliesslich `src/application` und
`src/modules/landing-zone` aus dem festen Git-Pin als `application-src`.
Ein neuer, noch nicht existierender `LZC_RUNNER_PACKAGE_DIR` ist zu verwenden.
Der eigene Provider-Lock pinnt STACKIT 0.114.0 und time 0.14.1, mit geprueften
Checksummen fuer Darwin ARM64 und Linux AMD64. Seine SHA-256 ist
`d40debbff204aee590c2a76d09f6ad3234643329b438fd5c6497de60687f6fa5`.
Die Application-Paketierung ist fuer den produktiven Build bewusst gesperrt.

Die neuen Worker-Modi `application-plan` und `application-apply` verlangen
den festen Application-Pin/Lock und eine strikte Bindung aus `tenantId` und
`instanceId`. Der S3-Key muss exakt
`applications/<tenantId>/<instanceId>/terraform.tfstate` sein; Lockfile ist
verpflichtend. Bootstrap-/Plattform-State und freie Root-Pfade werden abgewiesen.
Das Arbeitsverzeichnis behaelt den relativen Modulpfad, liegt aber getrennt
vom Plattform-Root. Apply verwendet nur den gespeicherten Plan, ohne Replan
oder Bootstrap-Migration. Bei fehlgeschlagener Recovery-Uebertragung bleiben
nur der private Application-Recovery-State und seine Verzeichnisse erhalten.

Dies ist noch kein Application-Broker-Dispatch oder Cloud-IAM-Scope:
`executionEnabled: false` bleibt bestehen. Instanz-Jobs, eigene echte Locks,
PE-autorisierte Credential-Grants, Ablauf/Widerruf, Quoten und explizite Upgrades
muessen noch angebunden werden. Der neue Quell-Pin braucht eine ausdrueckliche
neue Template-Veroeffentlichung; gespeicherte Versionen/Plans werden nicht
umgebunden. Kein aktives Paket wurde ausgetauscht und keine Kundenoperation
gestartet. Die Worker-Tests verwenden eine kontrollierte Engine, waehrend
Paket-Init/Validate und die nativen Mock-Vertragstests echtes OpenTofu verwenden.

## Vorbereitete Application-Jobs und Grant-Belege (2026-10-05)

Der Begriff Quell-Pin bezeichnet eine feste Git-Commit-ID des Accelerator-
Terraform-Codes, keine Zugangsdaten oder persoenliche PIN. Neue Publikationen
koennen `acceleratorRevision` ausdruecklich auf den qualifizierten Application-
Commit `4d15d7870afa323badd93559d8b37c5a8d138dcf` setzen. Dies erzeugt eine neue
immutable Template-Version; der bisherige Default und alle Altversionen bleiben
unveraendert. Andere Commits werden abgewiesen. Die API-Pin-Auswahl ist noch
nicht als zusaetzlicher UI-Publikationsschritt angebunden.

Migration 026 speichert Jobs mit Status `prepared` und SQL-abgeleitete Grant-
Belege. `POST /api/v1/applications/instances/{id}/jobs` verlangt genau
`{"idempotencyKey":"<uuid>","confirmPlan":true}`. Session, aktueller Tenant,
Origin und CSRF werden geprueft; Rolle, verifizierte Bestelleridentitaet,
Eigentum, Version/Policy und Compiler-Eingaben werden erneut aus den gespeicherten
Datensaetzen gelesen. Nur der qualifizierte Application-Quellstand wird angenommen.
Ein transaktionaler Lock serialisiert den Idempotenzschluessel. Wiederholung
liefert denselben gueltigen Auftrag; abgelaufener oder widerrufener Grant wird
nicht durch Retry erneuert. Ein frischer Auftrag braucht einen neuen Schluessel
und eine erneute ausdrueckliche Bestaetigung.

Der SQL-Trigger prueft die echte Session, die verifizierte Organisation,
aktuelle PE-Mitgliedschaft des Vertragsfreigebers und aktuelle Bestelleridentitaet.
Er leitet Organisation, Profil-/Secret-Version/Key-ID, Besteller, Instanz,
Template-/Vertragsversion, Quellstand, Compiler-Hash, Operation und State-Key
ab. Der Ablauf ist durch echte Session, Human-Token und maximal 25 Minuten
begrenzt. Die App-Rolle darf keine Grants direkt einfuegen oder Bindungen
veraendern; Tenant-/Owner-RLS und unveraenderliche Belege bleiben erzwungen.

`POST /api/v1/applications/jobs/{id}/credential-grant/revoke` verlangt genau
`{"confirmCredentialGrantRevocation":true}` mit denselben HTTP-Grenzen.
Besteller oder vertragsfreigebender aktueller PE duerfen innerhalb des Tenants
widerrufen. Wiederholung liefert denselben Zeitbeleg; Widerruf kann nicht
zurueckgesetzt werden.

Die Job-Antwort enthaelt nur ID, Instanz, Status und Ablauf sowie
`executionEnabled:false` und `cloudPlanExecuted:false`. Keine Credentials,
kein Ticket und kein Runner-Start. Ein Grant-Beleg ist noch keine einmalige
Credential-Uebergabe, State-Datei oder Cloud-Operation. Die einmalige Ausgabe
unter erneuter Autoritaets-/Profilpruefung und der echte instanzgebundene
S3-State-/Lock-Zugang muessen vor Dispatch weiter integriert werden.

## Explizite Application-Backend-Freigabe (2026-10-05)

Migration 027 ergaenzt einen unveraenderlichen Backend-Beleg fuer einen gueltigen
vorbereiteten Application-Job. `POST /api/v1/applications/jobs/{id}/backend-approval`
verlangt genau `{"stateBackendId":"<uuid>","confirmBackendApproval":true}` mit
Session-/Origin-/CSRF-/Tenant-Pruefung. Nur der aktuelle PE, der den Plattform-
Vertrag freigegeben hat, darf bestaetigen. SQL prueft erneut Job- und Grant-Ablauf,
Widerruf, Besteller-Session, Mitgliedschaften, Organisation und beide aktuellen
menschlichen Identitaeten. Der Backend-Datensatz muss zum selben Tenant gehoeren.

Der S3-Descriptor wird aus dem registrierten Backend abgeleitet, sein Key ist
zwingend `applications/<tenantId>/<instanceId>/terraform.tfstate`, Lockfile bleibt
verpflichtend. Freigabe-Session und Backend-Bindung sind immutable. Die Laufzeit
ist das Minimum aus Grant, echter PE-Session und PE-Identitaet. Parallele gleiche
Freigaben sind idempotent; Backend-Wechsel liefert 409. Abgelaufene oder nicht
mehr aktive Freigabesessions werden auch mit einer neuen Session nicht erneuert.

Die Antwort enthaelt nur Job-/Backend-ID, State-Key, Ablauf und
`executionEnabled:false`. AO kann den nicht geheimen Beleg lesen, aber weiterhin
keine Backend-Credentials. Die SQL-Funktion liest weder Credentials noch echten
S3-State. Die API validiert den gespeicherten Descriptor mit dem vorhandenen
S3-Vertrag. Ein Freigabebeleg ersetzt keine einmalige Credential-Ausgabe, echte
S3-Zugriffs-/Lock-Pruefung, Runner-Ticket oder Cloud-Plan/Apply.

## Interner einmaliger Application-Claim (2026-10-05)

Migration 028 stellt die atomare Verbrauchsstufe bereit. Die interne
`claimJobGrant`-Methode benoetigt die tatsaechliche weiterhin gueltige
PE-Backend-Freigabesession, nicht eine rekonstruierte PE-Identitaet aus dem
AO-Aufruf. SQL prueft alle Backend-/Grant-Autoritaetsgrenzen erneut und sperrt
die Grant-Zeile, bevor der immutable Claim-Beleg erzeugt wird. Zwei konkurrierende
Claims ergeben einen Erfolg und einen Konflikt. Eine andere echte Session
desselben PE darf den Claim nicht uebernehmen.

Claim und Widerruf serialisieren dieselbe Zeile; nur eines kann erfolgreich sein.
Nach Verbrauch wird kein Widerruf mit behaupteter Credential-Rueckholung bestaetigt,
sondern 409 zurueckgegeben. Retry der urspruenglichen Job-Vorbereitung liefert
keinen falschen `prepared`-Beleg. Die App-Rolle darf Claims weder direkt schreiben
noch zuruecksetzen oder loeschen.

Kein Browser-/Runner-Endpunkt fuer diese Methode ist registriert. Sie gibt nur
Job-ID, Claimzeit und Ablauf zurueck; keine Credentials, Ticket oder Runner-Start.
Die anschliessende technische Profil-/Version-/Key-Pruefung, sichere Secret-
Ausgabe, abschliessende Autoritaetspruefung und ticketgebundene Dispatch-Integration
sind weiterhin erforderlich. Der interne Claim allein aktiviert keine Ausfuehrung.
