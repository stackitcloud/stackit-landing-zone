# Produktionsbetrieb

[English](production.md) | [Deutsch](production.de.md)

Produktion verwendet ein eigenes STACKIT-Projekt, eigene Verschlüsselungsschlüssel,
Datenbanken, Secrets Manager, Modell-Token, Storage-Buckets, CF-Organisationen und
GitHub-Environments. Die öffentliche Origin lautet
`https://app.landing-zone.runs.onstackit.cloud`. Der native Accelerator in `src/`
bleibt unabhängig nutzbar.

## Bereitstellung und Verfügbarkeit

Die geprüfte Stage `lzc-prod` definiert drei Web/API-Instanzen, zwei gemeinsam
verwaltete warme Einmal-Runner und PostgreSQL 17 mit dem Replica-Set-Tarif
`2.4-replica`. Die Datenbank erhält 20 GB Speicher, tägliche Backups um 02:00 UTC
und 32 Tage Aufbewahrung. Anwendungs- und Runner-Organisation verwenden jeweils
die öffentliche CF-Plattform in EU01 mit einer separat ausgewählten Quote;
`small` bietet 10 GB Arbeitsspeicher ohne Begrenzung auf drei Instanzen. Kapazität
für Staging, Migration, Prüfungen und den zusätzlichen Web-Prozess beim Rolling
Deployment berücksichtigen. PostgreSQL-Sperren begrenzen die warmen Reserven
gemeinsam; jede API-Replik erzeugt keinen eigenen zusätzlichen Pool.
Infrastrukturjobs und Release-Aktivierung verwenden
`configurator-lzc-prod-mutation` als gemeinsamen einzelnen Schreiber.

Laufende STACKIT-Anmeldungen und Organisationsnachweise verwenden denselben
PostgreSQL-Dienst wie Sitzungen und werden mit dem dauerhaften
Anwendungs-Artefaktschlüssel verschlüsselt. Der Geheimtext ist an öffentlichen
Origin, Flow-Zweck und gehashte Browser-/Sitzungskennung gebunden. Jeder Vorgang
belegt eine kurze Datenbank-Lease und gibt die Verbindung vor Aufrufen des
Identitätsdienstes zurück. Anschließend wird der Flow gespeichert oder gelöscht.
Keine zweite Instanz kann denselben Autorisierungscode gleichzeitig einlösen.
Abgeschlossene Anmeldungen und abgebrochene Flows werden gelöscht; abgelaufene
Datensätze sind sofort unzugänglich und werden beim nächsten Flow-Start entfernt.
Geht ein Prozess während des Austauschs verloren, bleibt der Flow bis zum Ablauf
(höchstens 15 Minuten) gesperrt. Dann mit einem neuen Browser-Flow anmelden,
statt einen möglicherweise bereits ausgeführten Token-Austausch zu wiederholen.
Das Schließen einer API-Instanz bricht gemeinsam gespeicherte Flows nicht ab.
Lokale Aufbauten ohne Artefaktschlüssel behalten den Speicher-Fallback für einen
Prozess.

Login-Zustand, Sitzungen und Job-Datensätze liegen in PostgreSQL. Sitzungsbindung
an eine bestimmte Web-Instanz ist nicht erforderlich. Laufzeitbenutzer besitzen
keine Datenbank-Administrationsrechte. Anwendungs- und Runner-Zugänge entstehen
als getrennte Dienste `space-scoped-service-account` mit Tarif `space-deployer`.
Release-Jobs erhalten weder Organisationsmanager noch State-Schlüssel oder
S3-Zugriff. Die Provisionierung verwendet einen eigenen Service Account mit auf
das Betreiberprojekt begrenzten Owner-Rechten und einem 90-Tage-Schlüssel.

Beim Rolling Deployment laufen bestehende Web-Prozesse weiter, bis ihre Nachfolger
bereit sind. Die Erstbereitstellung startet drei Prozesse. Die Aktivierung prüft
alle drei und schlägt bei abgebrochenen oder unvollständigen Deployments fehl.
Diese Konfiguration allein belegt weder die Verteilung über Verfügbarkeitszonen
noch Datenbank-Failover oder eine getestete Wiederherstellungszeit. Solche Übungen
vor Zusage eines Verfügbarkeitsziels protokollieren.

Die Bereitschaftsprüfung wartet nach Start oder rollender Aktivierung bis zu fünf
Minuten: CF kann `start` beenden, während eine Instanz noch startet. Alle drei Instanzen
müssen laufen. Eine geänderte Instanzanzahl, ungültige Statusdaten oder das abgelaufene
Zeitlimit lassen den Release fehlschlagen.

## Bestehendes Projekt initialisieren

OpenTofu 1.12.6 und die im Anwendungs-README gepinnten Node/npm-Versionen verwenden.
Alle folgenden Befehle laufen in `landing-zone-configurator/`. Eine private Datei
`.local/lzc-prod/operator.json` mit Modus `0600` nach diesem Schema erstellen und
Platzhalter ersetzen:

```json
{
  "projectId": "00000000-0000-4000-8000-000000000001",
  "existingProjectContainerId": "operator-project-readable-id",
  "parentContainerId": "parent-folder-readable-id",
  "ownerEmail": "owner@example.com",
  "centralServiceAccountEmail": "bootstrap@sa.stackit.cloud",
  "centralKeyPath": "/private/bootstrap-service-account.json",
  "credentialExpiration": "2027-02-08T00:00:00Z",
  "cfPlatformId": "00000000-0000-4000-8000-000000000002",
  "cfQuotaId": "00000000-0000-4000-8000-000000000003",
  "reviewer": "github-operator",
  "stackitClientId": "registered-production-public-client"
}
```

Der Projektimport verwendet die **Container-ID**, nicht die Projekt-UUID. Er
bewahrt vorhandene Billing-/Scope-Labels und den initialen Owner. Der Lifecycle
verhindert die Projektlöschung. Die lokalen Roots `operator-project`, `seed` und
`seed-protection` sind die Bootstrap-Ausnahme; die vier Remote-Roots niemals lokal
anwenden. Für jeden Bootstrap-Root die getrennte Umgebung vorbereiten, den
gespeicherten Plan prüfen und anschließend genau diesen Plan anwenden:

```sh
node infra/ci/prepare-production-bootstrap.mjs operator-project .local/lzc-prod/operator.json
. .local/lzc-prod/operator-project/environment.sh
tofu -chdir=infra/operator-project init -lockfile=readonly -backend-config=../../.local/lzc-prod/operator-project/backend.hcl
tofu -chdir=infra/operator-project plan -out=../../.local/lzc-prod/operator-project/review.tfplan
# Plan vor dieser separaten Änderung prüfen:
tofu -chdir=infra/operator-project apply ../../.local/lzc-prod/operator-project/review.tfplan
umask 077
tofu -chdir=infra/operator-project output -json > .local/lzc-prod/operator-project/outputs.json
```

Dieselbe Sequenz zuerst für `seed`, danach für `seed-protection` wiederholen und
den Root in allen Pfaden ersetzen. Die Seed-Vorbereitung liest die Projektausgabe
und schreibt den neuen projektbegrenzten Provisionierungsschlüssel privat.
Seed-protection aktiviert Bucket-Versionierung. Die Ausgaben jedes Roots privat
speichern. Verschlüsselte Bootstrap-States separat als Betreiber-Backup und ihre
Passphrasen getrennt in einem Secret Store sichern; `.local` ist kein Backup.
Ausgaben und Passphrasen niemals committen oder protokollieren.

Produktionszugänge für die Infrastruktur mit der GitHub-Admin-Sitzung des
Betreibers veröffentlichen. Werte werden über stdin übertragen:

```sh
node infra/ci/configure-production.mjs infrastructure .local/lzc-prod/operator.json
```

Dies erstellt getrennte Plan-/Apply-Environments, beschränkt auf `main`. Apply
benötigt den benannten Reviewer; Administratoren dürfen die Freigabe nicht
umgehen. **Configurator Bootstrap** mit `environment=lzc-prod` zuerst für Root
`bootstrap`, danach `backend` starten. Anschließend **Configurator Platform** und
**Configurator Runtime** ausführen. Jeder Workflow erstellt einen an Quelle und
Workflow-Lauf gebundenen verschlüsselten Plan. Bei `apply=true` wartet der
Apply-Job auf dessen Freigabe. Nur den gespeicherten Plan desselben Laufs anwenden;
Wiederholungen, abgelaufene Pläne und Wiederverwendung über Stages hinweg scheitern.

## Domain, Anmeldung und Release-Bindings

Runtime-IaC erstellt die Zone `landing-zone.runs.onstackit.cloud`, ihren `app`-CNAME
auf `console.apps.01.cf.eu01.stackit.cloud.` sowie die private CF-Anwendungsdomain.
Nach dem Route-Mapping stellt STACKIT das TLS-Zertifikat asynchron aus. Die
öffentliche Bereitschaftsprüfung wartet mit regulärer Zertifikatsprüfung; TLS wird
nie umgangen. Bei der Erstbereitstellung öffentliche DNS-Delegation und
Zertifikatsausstellung prüfen.

Einen eigenen **öffentlichen** STACKIT-IDP-Client mit PKCE S256 und diesen exakten
Redirects registrieren. Ein STACKIT-Client-Secret wird nicht benötigt:

- `https://app.landing-zone.runs.onstackit.cloud/auth/stackit/callback`
- `https://app.landing-zone.runs.onstackit.cloud/auth/stackit/proof-callback`

Jeder über den STACKIT IDP authentifizierbare Benutzer kann sich anmelden.
Workspace-Isolation und verifizierte Organisations-/Landing-Zone-Rechte regeln
weiterhin Zugriff und Ausführung. Das Produktionsrelease aktiviert keinen
Entwicklungslogin.

Plattform-/Runtime-Ausgaben mit ihren jeweiligen Produktions-State-Schlüsseln
privat nach `.local/lzc-prod/platform/outputs.json` und
`.local/lzc-prod/runtime/outputs.json` lesen. Dazu die Remote-State-Vorbereitung
im [CI-Workflow](../infra/ci/README.de.md) verwenden, ohne lokalen Apply.
Einmalig einen dauerhaften, unabhängigen Base64-Artefaktschlüssel mit 32 Bytes
in `.local/lzc-prod/artifact.key` erstellen (Modus `0600`) und getrennt sichern.
`stackitClientId` in der privaten Konfiguration ergänzen, dann das ausdrücklich
auf erlaubte Felder begrenzte Binding veröffentlichen:

```sh
node infra/ci/configure-production.mjs release .local/lzc-prod/operator.json
```

Die Veröffentlichung schließt Organisationsmanager und Assistant-Testzugänge aus.
Nach Zugangsrotation wiederholen; den Artefaktschlüssel nicht neu erzeugen. Eine
Rotation ohne Wiederherstellung/Neuverschlüsselung macht bestehende Artefakte
unlesbar.

## Version veröffentlichen und aktivieren

1. Geprüfte Quelle nach `main` zusammenführen.
2. **Configurator Release** mit `build_only=true` und ausgewähltem `release_mode`
   starten. Alle Prüfungen für Anwendung, Browser, Datenbank, native Verträge und
   Paketierung bleiben verpflichtend. Der Build veröffentlicht sein unveränderliches
   Artefakt und den geschützten, quellgebundenen Image-Buildpack-Tag.
3. **Configurator Production Release** auf derselben `main`-Revision starten:
   `version=v2.0.0`, erfolgreicher Build-Lauf und dessen exakter Release-Modus.
4. Der Workflow prüft das Artefakt und veröffentlicht ein stabiles GitHub Release
   mit kurzen Hinweisen, Prüfsummen, Herkunftsnachweis und dauerhaft verfügbaren
   Anwendungs-/Runner-Paketen. Anschließend wartet `lzc-prod-release` auf
   **manuelle Freigabe**.
5. Veröffentlichte Quelle, Hinweise und bekannte Einschränkungen prüfen, dann in
   GitHub freigeben. Der Job lädt dieselben veröffentlichten Bytes, validiert
   Runner und Datenbankmigration und aktiviert erst nach Erfolg aller
   Staging-Zweige. Danach prüft er HTTPS, STACKIT PKCE, die Zugriffssperren ohne
   Anmeldung und den getrennten Runner.

Ein durch einen Menschen veröffentlichtes GitHub Release mit denselben Assets
startet diesen Workflow ebenfalls. Die Veröffentlichung im Workflow setzt direkt
mit dem geschützten Job fort, da durch `GITHUB_TOKEN` erzeugte Ereignisse keinen
weiteren Workflow starten. Beliebige Actions-Artefakte, Pre-Releases und Artefakte
aus der Dev-Ausnahme können nicht nach Produktion deployt werden.

Beim ersten Release ist `accepted-assistant-limitations` eine ausdrückliche
Betreiberentscheidung: Das Manifest enthält `assistantQualified: false` und
verlinkt [Issue #225](https://github.com/stackitcloud/stackit-landing-zone/issues/225).
Der Assistant ist aktiviert; sporadische HTTP-400-Fehler des Modelldienstes und die
vollständige Qualifikation bleiben offen. Dieser Modus behauptet keine erfolgreiche
Qualifikation. `qualified` erfordert weiterhin die wiederholte Live-Suite.
`dev-skip-assistant-qualification` bleibt auf Dev beschränkt und nicht promotierbar.

## Wiederherstellung und Rotation

Vorherige veröffentlichte Release-Assets und ihre geschützten Buildpack-Tags
aufbewahren. Die Wiederholung eines fehlgeschlagenen Jobs wird bewusst abgelehnt:
Einen neuen Workflow starten und einen neuen Plan-/Release-Lauf prüfen. Für ein
Anwendungs-Rollback **Configurator Production Release** mit `publish=false` und
einem bereits veröffentlichten kompatiblen Versionstag starten. Datenbank,
Artefaktschlüssel und Kunden-State erhalten. Schema-Migrationen sind
Vorwärtsänderungen. Zuerst Rückwärtskompatibilität prüfen und bei Bedarf einen
getesteten Datenbank-Restore verwenden. Keine alte Anwendung blind auf ein
inkompatibles Schema setzen oder Kundeninfrastruktur automatisch zurückändern.

Vor Produktionsabnahme Datenbank-Restore in ein getrenntes Ziel sowie die
Wiederherstellung von Bootstrap-State, Secrets und Artefaktschlüssel erproben.
Tatsächliche Wiederherstellungszeiten protokollieren. Backup-Aufbewahrung und
Bucket-Versionierung allein sind kein Restore-Nachweis. Den 90-Tage-Schlüssel der
Provisionierung, ablaufende State-Storage-Zugänge und begrenzte Modell-Token vor
Ablauf rotieren; nur betroffene geschützte Zugänge erneut veröffentlichen.
Drei Web-Repliken, Datenbankzustand, fehlgeschlagene Jobs, Runner-Kapazität,
HTTP-Fehler und Backup-Alter überwachen. HA-Topologie ersetzt weder Alarme noch
einen Bereitschaftsprozess.
