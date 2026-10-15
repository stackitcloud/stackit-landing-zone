# OpenTofu-Runner

Isolierte Laufzeit und Run-Protokoll; getrennt von API und Worker. Gepinnte Engine, Provider und Accelerator-Revision. Die Implementierungssprache des kleinen Supervisors bleibt offen; eigene Go-Laufzeit nur bei nachgewiesenem Vorteil.

Keine Backend-/Model-Serving-Bindings; nur runbezogene Kunden-Credentials und State-Zugriffe. CF-Eignung, Limits und private Konnektivität vor Implementierung nachweisen.

## Plattform-Plan und freigegebener Apply

Der Worker startet nur durch seinen expliziten Prozesseinstieg. Der importierbare
Supervisor unter `app/apps/worker/src/runner.ts` startet beim Import keine Jobs.
Es gibt keinen `AllowApply`-Umgebungsschalter. Ausschließlich ein vom Broker
ausgestellter `platform-apply`-Auftrag darf einen gespeicherten Plan ausführen.
Die API muss davor eine explizite Freigabe prüfen und das Artefakt an Auftrag,
Mandant, Konfigurationshash, Accelerator-Commit, Engine und Provider-Lock binden.
Diese Bindung und die Verschlüsselung werden nicht durch den Worker ersetzt.

`POST /api/runner/input` verwendet das runbezogene Bearer-Ticket. Fehlender Modus
bedeutet weiterhin `initial-plan-only`; dieser Modus bleibt backendlos und kann
nicht anwenden. `platform-plan` und `platform-apply` verwenden das vom Broker
gelieferte Backend. `kind:"s3"` wird durch den gemeinsamen Vertrag validiert:
`{kind:"s3",descriptor:{bucket,endpoint:"https://object.storage.eu01.onstackit.cloud",region:"eu01",key,useLockfile:true},credentials:{accessKeyId,secretAccessKey}}`.
Vor `init` ersetzt der Worker ausschließlich in der privaten Arbeitskopie die
gehashte Quelldatei durch `backend.tf.json` aus dem gemeinsamen Renderer, mit
nativem S3-Backend und `use_lockfile:true`. AWS-Credentials stehen nur in der
expliziten Child-Umgebung (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`AWS_REGION`, `AWS_DEFAULT_REGION`), nicht in Backend-Datei oder CLI-Flags.
Native S3-Jobs erhalten keine `TF_HTTP_*`-Variablen oder geerbten AWS-Profile.

Das temporäre `kind:"bootstrap"` benötigt exakt die stabilen Broker-Adressen
`/api/runner/state`, `/api/runner/state/lock`
und `/api/runner/state/unlock`, Benutzer `runner` und dem eigenen Ticket als
Passwort. Fremde Origins, Query-Parameter und andere Credentials werden vor
`init` abgewiesen. Der bekannte gepinnte `backend.tf` wird ausschließlich in
einem privaten temporären Arbeitsverzeichnis durch ein HTTP-Backend ersetzt.
Ein Backend ohne `kind` wird nur nach derselben strikten Bootstrap-Prüfung akzeptiert.
HTTP-Authentifizierung wird nur per Child-ENV gesetzt, nicht per Backend-Datei
oder CLI-Konfiguration. Engine **1.12.6**, immutable Accelerator-Commit und
Provider-Lock bleiben unverändert; `init` nutzt `-lockfile=readonly`.

`platform-plan` meldet `initializing`, `validating`, `planning` und erzeugt
`plan.bin`. Nur dessen bereinigte Zählwerte gehen in die Zusammenfassung.
Unmittelbar vor der Erfolgsmeldung lädt der Worker das binäre Artefakt über
`POST /api/runner/artifact` als `{data:base64,summary}` hoch. Die vom Broker
zurückgegebene SHA256 muss exakt stimmen. Erst danach meldet er
`{status:"succeeded",summary,artifactSha256}`. Uploadfehler berechtigen nicht
zum Apply. Artefakte sind auf 16 MiB begrenzt.

`platform-apply` erhält zusätzlich `plan:{data:base64,sha256}`. Kanonisches
Base64, Größe und SHA256 werden vor `init` geprüft. Nach `initializing` und
`validating` folgt `applying`; OpenTofu erhält nur `saved-plan.bin`, niemals
einen neuen Plan, `-auto-approve` oder ein Apply-Varfile. Es gibt keinen
automatischen Apply-Retry, Force-Unlock, Destroy oder Cancel. Provider-Logs,
Plan-JSON und Secrets bleiben privat und werden anschließend entfernt.
Der Worker meldet beim Apply nur Erfolg oder einen festen Fehlercode, keine
Provider-Ausgabe oder Planwerte.

Nur nach erfolgreichem Bootstrap-Apply ruft der Worker
`POST /api/runner/migration` mit `{phase:"prepare"}` auf. Die Antwort muss
`{backend:S3RunnerBackend}` enthalten; Ziel, Credentials und leeres bzw.
verifiziert übereinstimmendes Ziel werden vom Broker aus dem Management-State
bestimmt, nicht vom Browser. Der Worker validiert den vollständigen S3-Vertrag,
schreibt das native Backend und führt ausschließlich
`tofu init -migrate-state -force-copy -input=false -no-color -lockfile=readonly`
mit bisheriger HTTP- und neuer AWS-Umgebung aus. Kein Replan oder weiterer Apply.
Erst nach erfolgreichem `POST /api/runner/migration` mit `{phase:"complete"}`
folgt `{status:"succeeded"}`. Migrationsfehler melden `state_failed`.

Der HTTP-Broker muss State dauerhaft und verschlüsselt in PostgreSQL speichern
und State/Artefakte ausschließlich im gebundenen Auftrag bereitstellen. Ein
lokaler State ist nicht das reguläre Backend. Auch bei einem fehlgeschlagenen
Apply darf der Broker bereits gespeicherten State nicht löschen. Eine vorhandene
`errored.tfstate` wird vor der terminalen Fehlermeldung auf höchstens 16 MiB,
State-Version 4, UUID-Lineage und nichtnegative ganzzahlige Serial geprüft.
`POST /api/runner/recovery` erhält `{data:<kanonisches Base64>,sha256:<SHA256 der Dateibytes>}`
und muss nach dauerhafter verschlüsselter Speicherung `{sha256:<derselbe Hash>}`
bestätigen. Erst dann löscht der Worker die lokale Notfallkopie. Der Auftrag
bleibt fehlgeschlagen (`{status:"failed",errorCode:"state_failed"}`), auch wenn
Tofu trotz Recovery-Datei mit Exit-Code 0 endet. Ein Recovery-Upload hat auch
nach Job-Timeout ein eigenes, begrenztes Zustellfenster von 60 Sekunden.
Bei fehlender/falscher Bestätigung oder ungültiger Datei bleibt ausschließlich
die private `errored.tfstate` erhalten; Credentials, Logs und übrige Dateien
werden entfernt. Der Broker muss daraus `recovery_required` ableiten und das
CF-Cleanup verhindern. Ohne bestätigte Zustellung besteht kein Nachweis gegen
harten Runner-Verlust; die lokale Kopie ist keine persistente CF-Ablage.
Bei Zeitablauf beendet der Worker die Prozessgruppe zunächst mit SIGTERM,
danach gegebenenfalls SIGKILL. Remote-State und Locks werden dabei nicht gelöscht;
Recovery und eine eventuelle Lock-Freigabe erfordern eine bewusste Prüfung.

## Lokale Entwicklung

Die gewöhnlichen Worker-Unit-Tests verwenden ein ausführbares Fake-Tofu und einen
gemockten Broker. Keine echten Kunden-Credentials, kein Cloud-Apply und kein
echter Runner-Dispatch für die lokale Validierung:

```sh
cd landing-zone-configurator/app
npm exec --yes --package=node@24.21.0 --package=npm@11.19.0 -- node node_modules/vitest/vitest.mjs run tests/platform-worker.test.ts
npm exec --yes --package=node@24.21.0 --package=npm@11.19.0 -- node --test ../infra/ci/runner-evidence.test.mjs
```

Vor einer echten Inbetriebnahme sind API-Freigabe, additive Stage-/Result-
Schemas, verschlüsselter State-/Artefakt-Broker einschließlich Job-Bindung,
State-Lock-Verhalten und das gepinnte staged Runner-Paket gemeinsam abzunehmen.
Ein älterer Broker ohne diese Erweiterungen ist nicht apply-fähig.

## Erstbereitstellung: qualifizierte Plattformdienste

Die gemeinsame Ausführungsprüfung erlaubt zusätzlich zum bisherigen
Governance-/Public-Projekt-Umfang in **eu01**:

- `audit_logs`: Logs-Instanz, Lese-/Schreibtoken, Telemetry Router mit
  Logs- und S3-Archivziel sowie sensibler Ablage im Secrets Manager.
  Ohne `link_scopes` gilt die nachgewiesene Organisation; explizite Ziele
  müssen dieselbe Organisation sein. Ordner-, Projekt- oder fremde
  Organisationsziele bleiben ohne eigenen Zugehörigkeitsnachweis gesperrt.
  Der native Object-Lock-Standard bleibt unverändert: `{}` aktiviert
  GOVERNANCE-Retention, `s3_object_lock = false` deaktiviert sie ausdrücklich.
- `observability`: Instanz, Aufbewahrung/ACL und generierte Zugangsdaten
  einschließlich sensibler Ablage im Secrets Manager.
- `connectivity`: Einzelbereich (`network_area`) oder mehrere
  `network_areas`, bereichsgebundene DNS-Zonen sowie einzelne und
  bereichsgebundene Firewall-Appliances einschließlich HA als
  **Infrastruktur-Plan ohne Apply**. Ein VPN-Gateway ohne Verbindungen
  benötigt keine PSKs und ist ebenfalls qualifiziert.
- `devops`: DevOps-Projekt und optional STACKIT Git mit Flavor und ACL.
  Dies benötigt weder ein GitHub-Repository noch ein GitHub-Token.

Firewall-API-Policy/Bootstrap, Appliance-Apply, VPN-Verbindungen mit PSKs, regionale Connectivity,
Kubernetes, Federation und zusätzliche Corporate-/Projektfunktionen bleiben
gesondert gesperrt. Die Diagnose benennt bei Connectivity jetzt die konkrete
Policy-/Bootstrap-/VPN-Abhängigkeit statt die gesamte Komponente zu sperren.
Gespeicherte Konfigurationen und Exporte werden dabei nicht umgeschrieben.

Es gibt keine neuen Ausführungs- oder Credential-Nebenwege: dieselben
gespeicherten Eingaben und Hashes durchlaufen Vorbereitung, Organisations-/
Identitätsprüfung, Credential-Versionierung, Mandantenprüfung, einmaliges
Runner-Ticket und explizite Plan-/Apply-Freigaben. Der vorhandene native Root
enthält diese Dienste bereits; es werden keine Ersatzressourcen generiert.

`deploy/runner/package.sh` qualifiziert vor dem Archivieren den tatsächlich
gepackten Root samt Provider-Lock. Zwölf freigegebene native **Mock-Provider-Planläufe**
prüfen die Ressourcen einschließlich Audit-Routing/Archiv, sensibler
Vault-Ablage, Git-ACL, mehrerer Netzwerkbereiche, Legacy-Einzelbereich und
Governance-Baseline, VPN-Gateway sowie einzelne, HA- und gemischte
bereichsgebundene Firewalls. Diese Appliance-Pläne verwenden den tatsächlichen,
vorher SHA256-geprüften QCOW2-Pfad, niemals `/dev/null`.
Zwei zusätzliche, weiterhin gesperrte Firewall-/HA-Policy-Planproben belegen
die während Bootstrap fehlende Policy; eine erwartete native Validierungsverletzung belegt die
PSK-Pflicht für VPN-Verbindungen. Root-Dateien müssen in beide Richtungen mit dem gepinnten
Git-Commit übereinstimmen. Keine Kunden-Credentials, Cloud-Pläne oder Applies
werden dafür verwendet; alle Provider sind gemockt, die Umgebung ist bereinigt.
Ein weiterer **realer Vault-Provider-Test** verwendet dieselbe gepackte
Userpass-Konfiguration mit erst nach Apply bekannten Login-Ausgaben, ersetzt
aber ausschließlich die Adresse durch einen verweigernden Loopback-Server.
Vault 5.11.0 kann neue Secret-Ressourcen dabei ohne Authentifizierungsversuch
planen (null HTTP-Anfragen). Das widerlegt einen pauschalen
Vault-Bootstrap-Planblocker, qualifiziert aber weder Live-Authentifizierung,
Berechtigungen, Erreichbarkeit noch eine bestehende Vault-Secret-Abfrage.
Die Provider-Version und Prüfsummen stammen aus dem gepackten Lock; für den
isolierten Test bleibt nur dessen Vault-Eintrag erhalten.
Ein zusätzlicher **realer STACKIT-Provider-Test** mit dem gepackten
0.114.0-Lock plant das tatsächliche QCOW2 und weist einen fehlenden Image-Pfad
nativ zurück. Er verwendet ausschließlich synthetische Test-Authentifizierung,
einen verweigernden Loopback-IaaS-Endpunkt und Loopback-Proxies; alle
API-/Proxy-Aufrufe müssen null bleiben. Die Image-ID bleibt berechnet, es wird
keine vorhandene oder erfundene Cloud-Image-ID eingesetzt. Der Provider
validiert die Datei im Plan; Image-Erzeugung und Upload erfolgen erst im
weiterhin gesperrten Apply.
Das sind je gepinnter Revision 15 native Vertragsfälle und drei reale
Offline-Provider-Proben. Zusätzlich prüfen zwei artefaktgebundene Tests die
positive Paketinspektion und den tatsächlich gepackten Worker mit dem echten
Image in beiden Planmodi; nur dessen Engine/Broker sind dabei Fakes.
Diese zwei Tests laufen automatisch beim Paketieren und sind in gewöhnlichen
Unit-Läufen ohne `LZC_FIREWALL_IMAGE_PACKAGE` bewusst übersprungen.
Dies ist kein Nachweis eines live provisionierten Dienstes oder eines Plans
gegen einen echten STACKIT-Endpunkt. Ein realer Runner-Plan benötigt weiterhin
die vorhandenen, organisations-/auftragsgebundenen STACKIT-Berechtigungen
und Provider-Erreichbarkeit; diese Prüfung ersetzt keine Live-Abnahme.

### Verifiziertes Appliance-Image und verbleibende Plan-/Apply-Grenzen

- **Appliance-Image:** Beide freigegebenen nativen Revisionen verwenden in
  `src/modules/connectivity/5-firewall.tf:6,47` ohne
  `firewall-image.qcow2` tatsächlich `/dev/null` als Image-Quelle.
  Deshalb übernimmt `package.sh` über `scripts/prepare-firewall-image.mjs`
  genau das bereits in `.github/workflows/verify-deployment.yml` gepinnte
  öffentliche Image:
  `https://opnsense.object.storage.eu01.onstackit.cloud/opnsense-26.1-amd64-21-05-2026.qcow2`,
  SHA256 `5d0fb1cb4375eb258859cafc688f1e5e6f830f54f8d86b9e8bb815611bae1068`
  (993525760 Bytes, rund 948 MiB).
  Der private, ignorierte Cache liegt unter `.local/firewall-images/<sha256>.qcow2`.
  Download, vorhandener Cache und jede immutable Root-Kopie werden
  streaming-basiert geprüft; falsche Bytes oder Symlinks brechen ab.
  `platform-source.json` bindet Commit und Image-SHA. Die lokale
  Paketinspektion und der Worker prüfen die tatsächlichen Image-Bytes;
  CF übernimmt die Capability nur aus dem inspizierten, an das Droplet
  gebundenen Paket. Alte Pakete ohne qualifiziertes Image dürfen weiterhin
  Governance-/Dienstpläne, aber keine Appliance-Pläne ausführen
  (`runner_firewall_image_unavailable`).
  Die automatische Qualifikation prüft außerdem das vollständige Paket
  plus unabhängige initialisierte Image-/Root-/Provider-Arbeitskopie und
  256 MiB Reserve gegen das unveränderte 4096-MiB-Droplet-Limit.
  Reflink-Einsparungen werden dabei nicht vorausgesetzt.
  Gemessen inklusive Application-Root: maximal 1362223503 Bytes Paket,
  1377552902 Bytes initialisierte Arbeitskopie und 268435456 Bytes Reserve,
  insgesamt 3008211861 Bytes (2,80 GiB) von 4294967296 Bytes.
  Die Release-Pipeline übernimmt weiterhin den vollständigen Root per
  `cp -R` nach `inspection` und vergleicht ihn vor Deployment bytegleich.
  Lokale, vollständige Archive haben etwa 1,17 GB. Hosted-Archive lassen nur
  die QCOW2-Datei aus und müssen kleiner als 384 MiB bleiben. Der auf den
  freigegebenen Release-Commit gepinnte finale Buildpack stellt die Datei
  beim Staging aus dem regionalen Object Storage SHA-geprüft wieder her.
  Der temporäre Download wird ohne zweite Dateikopie in die Anwendung verschoben;
  eine zusätzliche große CF-Build-Cache-Kopie entfällt. Das gespeicherte Droplet
  ist der dauerhafte Image-Cache und enthält die vollständige
  Datei; es gibt keinen Laufzeit-Download pro Auftrag. Die API-Inspektionskopie
  wird identisch behandelt. CI vergleicht beide wiederhergestellten Roots
  bytegleich mit dem qualifizierten Paket und prüft dieselbe Paketidentität.
  Damit bleibt das gemessene Laufzeit-Diskbudget unverändert. Cache und
  Downloadfehler brechen Staging ab, bevor die Web-Anwendung ersetzt wird.
- **HA ist nicht selbst ein Plan-Authentifizierungsblocker:** Die zwei
  `terraform_data.firewall_ha_*`-Provisioner in `5-firewall.tf` verwenden den
  Administrationszugang erst beim Apply; CARP-Zugänge entstehen nativ.
  Appliance-/HA-Infrastrukturpläne sind mit dem qualifizierten Image möglich.
  Damit ist weder ein sicherer Administrationszugang beim Apply noch eine
  vollständige Firewall-Policy bereitgestellt. Die API zeigt solche Pläne
  nicht als apply-fähig an und weist selbst eine explizite Apply-Freigabe mit
  `configuration_apply_not_supported` zurück. Der Worker akzeptiert den
  gebundenen Appliance-Vertrag ausschließlich für Plattform-Planmodi.
- **Konfigurierte Policy:** `_firewall-bootstrap.tf:30-34,41-61,88-96`
  schaltet bei `firewall_bootstrap=true` die Policy im ersten Plan ab und
  plant erst den Apply-Provisioner, der API-Zugänge erzeugt. Ohne Bootstrap
  wird stattdessen ein vorhandenes Secrets-Manager-Secret gelesen. Deshalb
  kann die unveränderte native Greenfield-Root-Konfiguration nicht sämtliche
  konfigurierte Policy schon im ersten Plan abbilden. Kleinste erforderliche
  Produktentscheidung ist ein sichtbar mehrstufiger, jeweils neu bestätigter
  Infrastruktur-/Credential-/Policy-Workflow; alternativ wäre eine Änderung
  des nativen Bootstrap-Vertrags nötig. Policy still auszulassen oder
  `unset`-Zugänge als vollständig zu deklarieren ist keine Lösung.
- **VPN-Verbindungen:** `modules/connectivity/variables.tf:274-285` verlangt
  pro Connection beide PSKs; `7-vpn.tf` indiziert genau diese Schlüssel.
  Öffentliche Konfigurationen schließen `vpn_pre_shared_keys` aus
  (`features.ts`), und `credentials/key.ts` sowie der Worker binden derzeit
  einen STACKIT-Service-Account-Key, keinen VPN-Secret-Satz. Die bereinigte
  Child-Umgebung übernimmt keine geerbten `TF_VAR_*`. Kleinste Voraussetzung
  ist daher ein eigener autorisierter, versionierter, mandanten-/auftrags-
  und Connection-Key-gebundener PSK-Vertrag. Weder erfundene PSKs noch Werte
  im Entwurf, Chat oder allgemeiner Umgebung dürfen diesen ersetzen.

Manuell gegen ein bestehendes, unverändertes **image-qualifiziertes** Runner-Paket:

```sh
cd landing-zone-configurator/app
npm run build:packages
LZC_TEST_RUNNER_ROOT=/absolute/path/to/runner bash scripts/test-initial-plan-contract.sh
```

## Nativer lokaler Runner

Der lokale Starter kann mit `npm run dev:execution` denselben Worker-Vertrag
gegen den festgelegten Broker `http://127.0.0.1:3000` betreiben. Nur der explizite
lokale Modus erlaubt diese Origin; CF-Worker bleiben an die feste HTTPS-Origin
gebunden. `LZC_LOCAL_RUNNER_PACKAGE=true` erzeugt über das bestehende
Paketierungsskript ein natives `runner-local`-Paket mit OpenTofu 1.12.6 und
Host-Provider-Mirror. Paketinhalt, Zod, Node-Laufzeit und Provider-Mirror werden
vor dem Dispatch fingerprint-geprüft; Änderungen invalidieren die Paketbindung.

Der Dispatcher speichert seine Identität vor dem Start, erbt keine Cloud- oder
Backend-Credentials aus dem API-Prozess und verwirft rohe Prozessausgaben.
Credentials kommen nur über das gebundene Job-Ticket. Private Job-Verzeichnisse
liegen unter `~/.local/share/landing-zone-configurator/runner-jobs`. Recovery
bleibt dort bis zur dauerhaften Bestätigung erhalten und verhindert Cleanup.
Nach einem API-Verlust erfordern unklare Prozesse einen operativen Abgleich;
der Adapter signalisiert keine ungeprüften Prozess-IDs und wiederholt kein Apply.

Die Kunden-State-Lifecycle bleibt unverändert: Accelerator-Bootstrap mit dem
ausgewählten Service Account, anschließend Migration zum Terraform-verwalteten
Management-S3-Bucket. Ein lokaler erfolgreicher Dispatch belegt nicht den echten
Kunden-Apply oder die Live-S3-Migration. Der native Adapter ist eine lokale
Entwicklungsfunktion, keine produktive Sandbox-Isolation.
