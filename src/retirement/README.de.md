# Nativer gestufter Rückbau

[English](README.md) | [Deutsch](README.de.md)

Dieses separate OpenTofu-Root-Modul entfernt Projekte und Ressourcen eines bestehenden
Accelerators. `module.governance` und die ursprünglichen Ordneradressen bleiben dabei
erhalten. Ein späterer normaler Plan entfernt die Ordner, nachdem STACKIT die Projekte
endgültig gelöscht hat. Es verschiebt keine Projekte, importiert die Installation
nicht in den Configurator, entfernt keine State-Einträge und benötigt keinen neuen
Backend-Dienst. Während der Wartezeit läuft kein automatischer Prozess.

Der Adapter unterstützt derzeit State-Ressourcen mit dem STACKIT-Root-Provider
(Standard, `eu01`, `eu02`), Random und Time. Workloads mit privaten Providern zuerst
mit ihrer ursprünglichen Quelle und erreichbaren APIs entfernen. Die Inventarisierung
weist verbleibende verwaltete Vault-, OPNsense-, Kubernetes-, Helm- und modullokale
Grafana-Provider ab. Keine Ressourcen aus dem State entfernen, um diese Prüfung zu
umgehen. Historische oder angepasste Quellen benötigen eine separate Qualifikation.
Bestehende Terraform-Installationen behalten ihre Engine bis zu einer separat
geprüften Migration; diese Anleitung richtet sich an OpenTofu.

## Vor dem Start

- Ein benannter Operator verantwortet den gesamten Rückbau. Normale Apply-Pipelines,
  Project-Factory-Dispatch, alte Freigaben und alle weiteren State-Schreiber über
  sämtliche zugehörigen Application- und Plattform-States hinweg stoppen. Der
  Rückbauvermerk gilt zwischen Befehlen und während der Purge-Wartezeit weiter.
  Ein State-Lock allein genügt nicht.
- Betroffene Application-Verantwortliche informieren und benötigte Daten exportieren.
  Abhängige Applications vor gemeinsamen Plattformabhängigkeiten entfernen. Der
  Platform Owner darf den autorisierten Rückbau ausführen; eigenständiges Löschen
  durch den Besteller ist optional.
- Prüfen, dass Backend-Bucket und dessen Projekt, Verschlüsselungsschlüssel,
  Bereinigungs-Service-Account und Arbeitsumgebung den Rückbau überleben. Falls nötig
  das Backend zuvor in unabhängige Infrastruktur migrieren und die State-Identität
  anschließend prüfen. Der Adapter schützt kein Backend automatisch, das im zu
  löschenden Management-Projekt liegt.
- Ursprüngliche Quelle, Eingaben, Provider-Versionen/-Hashes, Backend-Deskriptor,
  Workspace, Verschlüsselungskonfiguration und Schlüssel erhalten. Aufbewahrung,
  versionierte/nicht leere Buckets und gemeinsame Organisations-IAM prüfen. Kein
  Force-Delete aktivieren oder Aufbewahrungssperren entfernen, nur damit der Vorgang
  erfolgreich wird.

Den [State-Locking-Vertrag](../../docs/state-locking.de.md) beachten: STACKIT S3
liefert das qualifizierte Conditional-Write-Locking nicht. Nativer Betrieb verlangt
den organisatorischen Ein-Schreiber-Ablauf; `use_lockfile` nicht als Schutz voraussetzen.

## Ursprünglichen State erfassen und binden

Ein absolutes privates Verzeichnis außerhalb des Deployments verwenden. State- und
Plan-Dateien können Zugangsdaten enthalten; niemals in Issues oder CI-Artefakte laden.
Die folgenden Pfade sind Platzhalter. Im Repository-Root des geprüften Checkouts arbeiten.

```sh
umask 077
mkdir -p /absolute/private/retirement
# Im URSPRÜNGLICHEN initialisierten Arbeitsverzeichnis und Workspace ausführen:
tofu -chdir=/absolute/original/src state pull > /absolute/private/retirement/before.tfstate
python3 src/retirement/guard.py inventory \
  --state /absolute/private/retirement/before.tfstate \
  --out /absolute/private/retirement/inventory.json
```

In `/absolute/private/retirement/retirement.tfvars.json` exakt die ursprünglichen Werte
für `organization_id`, `owner_email`, `region`, `rm_folder_parent_id`, `rm_folders`,
`organization_owners` und `organization_auditors` hinterlegen. Ordnerschlüssel, Namen
und Zuweisungen unverändert lassen. Weggelassene bestehende Zuweisungen können
Löschungen auslösen; die Prüfung von Phase A weist sämtliche Governance-Löschungen ab.
Keine neuen Standard-Ordnernamen einsetzen.

Gleichen Backend-Typ und exakt dasselbe Objekt/denselben Workspace wie ursprünglich
verwenden. Für S3 `backend.tf.example` wie unten kopieren; bei anderen Backends den
ursprünglichen Backend-Block verwenden. Die ursprüngliche Verschlüsselung separat
übernehmen. Bei nicht entschlüsselbarem State nicht fortfahren. Für eine bestehende
Remote-Installation niemals stillschweigend das lokale Standard-Backend verwenden.

```sh
cp src/retirement/backend.tf.example src/retirement/backend.local.tf
export TF_DATA_DIR=/absolute/private/retirement/tofu-data
tofu -chdir=src/retirement init -input=false -reconfigure \
  -backend-config=/absolute/private/retirement/backend.hcl
tofu -chdir=src/retirement state pull > /absolute/private/retirement/current.tfstate
python3 src/retirement/guard.py verify-state \
  --inventory /absolute/private/retirement/inventory.json \
  --state /absolute/private/retirement/current.tfstate
```

Mit geprüftem Provider-Lockfile initialisieren. Das Root-Modul benötigt die gleichen
festgelegten STACKIT-, Time- und Random-Versionen wie die qualifizierte Quelle. Beim
Initialisieren können ungenutzte Provider-Anforderungen aus einem kopierten
ursprünglichen Lockfile entfernt werden. Diese Änderung prüfen; Provider beim
Rückbau niemals aktualisieren. Das qualifizierte reduzierte Lockfile für spätere
`init -lockfile=readonly` verwenden. Vor Planung muss die State-Identitätsprüfung
erfolgreich sein. Einen neu angelegten leeren State niemals als Ersatz akzeptieren.

## Phase A: Ressourcen und Projekte, Ordner bleiben bestehen

```sh
tofu -chdir=src/retirement plan -input=false \
  -var-file=/absolute/private/retirement/retirement.tfvars.json \
  -var=retirement_phase=remove_projects \
  -out=/absolute/private/retirement/projects.tfplan
tofu -chdir=src/retirement show -json /absolute/private/retirement/projects.tfplan \
  > /absolute/private/retirement/projects.plan.json
python3 src/retirement/guard.py check-plan \
  --inventory /absolute/private/retirement/inventory.json \
  --state /absolute/private/retirement/current.tfstate \
  --plan /absolute/private/retirement/projects.plan.json --phase remove_projects
# Menschenlesbaren gespeicherten Plan und genauen Umfang unabhängig prüfen.
tofu -chdir=src/retirement show /absolute/private/retirement/projects.tfplan
tofu -chdir=src/retirement apply /absolute/private/retirement/projects.tfplan
```

Die Prüfung weist Neuanlagen, Änderungen, Ersetzungen, ungeprüfte Identitäten,
Governance-Löschungen und ein Verschwinden beim Refresh ab. Insbesondere kann der
festgelegte Projekt-Provider ein Projekt bei HTTP 403 aus seinem aktualisierten
State entfernen. Dies mit autorisierten Cloud-Abfragen untersuchen und nicht als
erfolgreiche Löschung zählen. Der Guard hilft bei der Offline-Prüfung; er bestätigt
weder Cloud-Berechtigungen noch Purge.
Python ist optional: Die Infrastrukturvorgänge erfolgen allein mit OpenTofu. Ohne
den Guard müssen State-Identität, Ressourcen-IDs, Refresh-Abweichungen und die reine
Löschungswirkung vor jedem Apply eigenständig geprüft und dokumentiert werden.
Der Verzicht auf das Hilfsprogramm hebt diese Prüfungen nicht auf.

Ein fehlgeschlagener Apply bleibt fehlgeschlagen. Teil-State und Ausgabe erhalten,
tatsächlich abgeschlossene Schritte abgleichen und einen frischen Plan in derselben
Phase erstellen. Keine ursprüngliche aktive Konfiguration erneut anwenden, keinen
alten gespeicherten Plan wiederverwenden, keinen unbekannten Schreiber zwangsweise
entsperren und Fehler nicht mit `-refresh=false` oder `state rm` verbergen.

## Warten und abschließen

Projekte können nach Phase A noch auf ihre endgültige Entfernung warten. Sperre,
State, ursprüngliches Projekt-/Ordnerinventar und unabhängige Zugangsdaten erhalten.
Es muss kein OpenTofu-Prozess laufen. Sieben verstrichene Tage oder das Verschwinden
eines Projekts aus dem State beweisen keinen Purge. Fremde Kindressourcen oder
fehlende Berechtigungen müssen untersucht werden.

Nach autorisierter Prüfung `current.tfstate` mit `state pull` aktualisieren und erneut
`verify-state` ausführen. Einen **frischen normalen Plan** mit
`-var=retirement_phase=finalize_folders` erstellen, als `folders.tfplan` speichern,
sein JSON erzeugen und `check-plan --phase finalize_folders` mit demselben Inventar
und aktuellem State ausführen. Er darf ausschließlich erfasste Ordner und deren
ordnerbezogene Zuweisungen löschen. Gespeicherten Plan wie in Phase A ausdrücklich
prüfen und anwenden.

Meldet die Ordner-API den erwarteten HTTP 409, fehlgeschlagenen Apply und Teil-State
erhalten, weiter warten und später einen neuen Abschlussplan erstellen. Keine
Projekte verschieben und beliebige Fehler nicht automatisch wiederholen. Ein
erfolgreicher Folder-Delete und die autorisierte Prüfung der gewünschten finalen
Hierarchie schließen diesen Umfang ab. Leerer State, HTTP 403/404 allein oder ein
Plan ohne Änderungen ersetzen diesen Nachweis nicht. Erhaltene Organisationsrollen
bleiben in diesem State verwaltet. Die Entfernung geteilter Organisations-Owner/
Auditoren ist eine separate geprüfte Übergabe, kein globaler `destroy` zum Abschluss.
Rückbaunachweise archivieren und die alte Factory-Veröffentlichung gesperrt lassen.

## Lokale Qualifikation

```sh
tofu -chdir=src/retirement init -backend=false
tofu -chdir=src/retirement validate
tofu -chdir=src/retirement test
python3 -m unittest discover -s src/retirement -p 'test_*.py'
LZC_TEST_TOFU_BIN=/absolute/path/to/tofu \
  python3 -m unittest discover -s src/tests -p test_retirement_native.py
```

Die Tests verwenden gemockte Ressourcen oder eine isolierte Loopback-API mit
synthetischem lokalem State. Der Test mit echtem Provider prüft Projektlöschung im
selben State, unveränderte Ordneridentität, Abweisung des falschen Verschwindens bei
HTTP 403, Warten bei HTTP 409 und spätere Ordnerlöschung. Es werden keine STACKIT-
Ressourcen erzeugt. Vor Behauptung einer Live-Qualifikation ist ein freigegebener
Dev-Pilot mit Wegwerf-Ressourcen erforderlich. Das
[Lifecycle-Konzept](../../docs/destroy-lifecycle-concept.de.md) beschreibt den
vollständigen Configurator-Koordinator sowie Berechtigungs- und Benachrichtigungsvertrag.
