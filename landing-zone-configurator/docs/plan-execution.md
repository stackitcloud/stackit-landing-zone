# Kunden-Plan: Umsetzung und Abnahme

Stand: 2026-09-30. Der Benutzer hat Zugangstest und gespeicherte Vorbereitung mit
passender Organisation und persönlichem Service Account erfolgreich getestet.

## Verbindliche Ausführungsgrenze

**Plan darf getestet werden. Kunden-Apply benötigt eine ausdrückliche, gesonderte
Benutzerfreigabe. Kein Destroy.** Die Freigabe für den Aufbau des Configurators ist
keine Kunden-Apply-Freigabe. Auch ein erfolgreicher oder unveränderter Plan erteilt
keine solche Freigabe. Der Benutzer nennt fehlenden Folder-Destroy als Grund.

Aktuell existieren weiterhin weder Kunden-Plan-Endpunkt noch produktiver Worker.
Die neue Auswertung ist eine getestete Grundlage, keine ausführbare UI-Funktion.
`applyAllowed: false` im Ergebnis beschreibt diese Grenze; es ersetzt keine
Autorisierung. Solange Plan-only gilt, darf der Dispatcher keinen Apply-Auftrag
annehmen, und es wird kein Apply-/Destroy-Ausführungspfad bereitgestellt.

## State-Lebenszyklus entsprechend dem LZA

Benutzerentscheidung: den bestehenden Ablauf aus
[Getting Started](https://github.com/stackitcloud/stackit-landing-zone/blob/main/docs/getting-started.md)
übernehmen. Kein zusätzlicher dauerhafter zentraler Kunden-State-Bucket.

1. **Neuanlage / Bootstrap-Plan:** Den bereits gespeicherten persönlichen Bootstrap-
   Service-Account verwenden. Temporäres Projekt und Account müssen nicht erneut
   angelegt werden. Plan gegen explizit leeren lokalen State im isolierten Runner;
   UI bezeichnet ihn als Erstbereitstellungsplan. Kein Apply, keine Cloud-Ressourcen.
2. **Erster Apply (separate Freigabe):** Der Accelerator erzeugt unter anderem das
   Management-Projekt, den tfstate-Bucket und die zugehörigen Credentials. Der noch
   lokale State muss während und nach dem Lauf dauerhaft gesichert werden. Ein
   flüchtiges CF-Dateisystem reicht nicht; Recovery muss auch nach Teilfehlern und
   hartem Prozessverlust funktionieren. Vor Umsetzung des ersten Apply ist dafür
   ein getesteter, verschlüsselter Checkpoint-/Persistenzmechanismus erforderlich.
3. **Backend-Migration:** Bucket aus `management_bucket_name_tfstate`, Backend-
   Credentials aus dem Management Secrets Manager. Unter exklusiver Deployment-
   Sperre `tofu init -migrate-state` ausführen. Quelle sichern, Ziel anhand Lineage,
   Serial und Inhalt prüfen. Erst danach das Kunden-S3-Backend als aktiv markieren.
4. **Management-Identität übernehmen:** Den vom Accelerator erzeugten Management-
   Service-Account sicher übernehmen; danach einen normalen Plan zur Verifikation
   ausführen. Bootstrap-Zugang nicht vor erfolgreicher Verifikation widerrufen.
5. **Folgeläufe:** Ausschließlich das registrierte Kunden-Backend nutzen. Bei
   fehlendem/nicht lesbarem State abbrechen; niemals still auf leeren State wechseln.

Neuanlage ist kein Import bereits vorhandener Ressourcen. Für bestehende oder
teilweise erzeugte Landing Zones ist ein vorhandener State-/Recovery-Pfad zwingend.
Der Status gehört zur stabilen Deployment-Identität, nicht zu jeder neuen
Vorbereitung. Neue Git-Versionen dürfen keinen neuen leeren State auslösen.

Die Anleitung erzeugt den Ziel-Bucket durch IaC, verlangt Migration und Credential-
Wechsel aber als anschließende Schritte. Diese orchestriert künftig der Configurator.
Bootstrap-Projekt löschen, State migrieren oder Kundenressourcen anwenden ist durch
die derzeitige Plan-Freigabe nicht autorisiert.

## Technischer Stand

- [x] Wertfreie Auswertung von `tofu show -json` implementiert.
- [x] Create, Update, Delete, beide Replacement-Reihenfolgen, Read und No-op zählen.
- [x] Drift separat zählen; Output-only-Änderungen berücksichtigen.
- [x] Check-Status und gemeldete/unbekannte Vollständigkeit unterscheiden.
- [x] Nicht unterstützte Aktionen/Formatversionen, Fehler und widersprüchliche
  Exitcodes abweisen. Keine Fehlerdetails aus dem Rohplan zurückgeben.
- [x] Unmarkierte Geheimwerte ebenso wie sensitive Werte aus der Zusammenfassung
  ausschließen: keine Attribute, Adressen, Output-Namen oder Diagnosetexte exportieren.
- [x] Echter lokaler OpenTofu-1.12.6-Plan mit eingebautem `terraform_data`-Provider:
  init, validate, plan (Exit 2), show und Auswertung. Kein Cloud-Zugriff, kein Apply.
- [x] Separaten Provider-Lock für den festen Accelerator-Commit erzeugt, inklusive
  Linux-amd64-Checksummen; lokales readonly-init und validate erfolgreich.
- [ ] Accelerator-Paket im isolierten Linux-Runner qualifizieren.
- [x] D07: LZA-eigenes Kunden-Backend nach initialem Bootstrap übernehmen.
- [ ] Erstbereitstellung und vorhandenen State serverseitig unterscheiden.
- [ ] Dauerhafte Bootstrap-State-Sicherung und Migration vor erstem Apply nachweisen.
- [ ] Dauerhafte Queue und Lease pro serverseitiger State-Identität implementieren.
- [ ] CF-Runner-Isolation nachweisen: keine DB-, Vault-, Model- oder Betreiber-Secrets
  im Runner; nur kurzlebiger, auf einen Auftrag begrenzter Secret-/Artefaktzugriff.
- [ ] Vollständigen Auftrag an Vorbereitung, Eigentümer, Tenant, Code- und Config-Hash,
  Engine, Provider-Lock, State-Identität und Credential-Version binden.
- [ ] Vor Start Profilbestand, Rollen, Secret-Version und Ziel erneut prüfen.
- [ ] Feste Schritte init/validate/plan/show mit Frist, Abbruch, Größenbegrenzung und
  privaten Artefakten. Keine frei eingebbaren CLI-Argumente oder Benutzer-Terraform.
- [ ] Autorisierte API und UI für Start, Status, Fehlerkategorien und Zusammenfassung.
- [ ] Erster echter Kunden-Plan mit dem bestätigten persönlichen Zugang.
- [ ] Fremdzugriff, gelöschtes Credential, veraltete Version, paralleler Auftrag,
  Prozessabbruch und fehlendes Backend als Integrationsfälle prüfen.

Die Auswertung alleine belegt weder isolierte Ausführung noch Mandantenschutz.
Insbesondere dürfen rohe stdout/stderr-Ausgaben und `show -json` nicht automatisch
ins CI-Log, in den Browser oder in den Chat weitergereicht werden. Für Betreiber
bleiben die direkten `tofu`-Schritte nachvollziehbar; Kunden erhalten Fortschritt
und explizit freigegebene Diagnosekategorien.

## Reproduzierbarer lokaler Vertragstest

Im Verzeichnis `landing-zone-configurator/app` mit der festgelegten Node-Version:

```sh
LZC_TEST_TOFU_BIN=/absoluter/pfad/zu/tofu npm run test:plan
```

Das Skript prüft Engine 1.12.6, erstellt ein temporäres Arbeitsverzeichnis, ruft
OpenTofu direkt auf und entfernt sämtliche Test-Artefakte beim Beenden. Es ist ein
lokaler Vertragstest, kein produktiver Runner und kein Kunden-Deployment.

## Quellen

[OpenTofu JSON-Format](https://opentofu.org/docs/internals/json-format/):
Major-Version prüfen, Änderungsaktionen und Checks auswerten; unbekannte ergänzende
Felder nicht exportieren. [Plan-Befehl](https://opentofu.org/docs/cli/commands/plan/):
Exitcodes mit `-detailed-exitcode` unterscheiden. Ein gespeicherter Plan ist ein
vertrauliches Artefakt und wird nicht als öffentliche Zusammenfassung behandelt.

## Prüfstand dieses Umsetzungsschritts

61 Anwendungstests, Typecheck, Lint und Build erfolgreich. Der reproduzierbare
Engine-Vertragstest läuft mit direkten `tofu`-Befehlen erfolgreich. Keine persönlichen
Kundenzugänge verwendet, kein Kunden-Plan gestartet und kein Cloud-Apply ausgeführt.
Provider-Lock und Code-Referenz: [Runner-Paket](../deploy/runner/README.md).
