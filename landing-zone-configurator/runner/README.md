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

Die Tests verwenden ausschließlich ein ausführbares Fake-Tofu und einen
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
