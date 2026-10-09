# Ubuntu-Uebernahme vom 2026-10-09

## Uebertragener Stand

Ziel: Ubuntu 26.04.1 LTS, Linux x86_64, Benutzer `developer`.
Repository: `/home/developer/projects/stackit-landing-zone`.
Urspruenglicher Quellcode-Checkpoint:
`368288e6e891607c71533da3139b07ce4841115a`.

- Quellcode und `.git` ueber SSH kopiert, ohne vorhandene Zielprojekte zu ersetzen.
- Private `.local`-Ablage einschliesslich historischen Runner-Paketen, State,
  Credential-Secrets und Artifact-Key uebernommen. Dateien und Symlinks wurden
  anschliessend per rsync-Pruefsummenvergleich ohne Unterschiede verifiziert.
- Externe Job-/Recovery-Verzeichnisse nach
  `/home/developer/.local/share/landing-zone-configurator` uebertragen.
- Lokale PostgreSQL-Datenbank `configurator_local` als konsistenter Custom-Format-
  Stream direkt per SSH in einer einzigen Restore-Transaktion migriert.
  Kein zusaetzlicher Dump und kein separates DB-Backup erstellt.
- Inhalte aller 42 Tabellen und die drei privaten Schluesseldateien stimmen mit
  der Quelle ueberein. Die Quelle wurde dabei nicht veraendert.
- Docker installiert, `developer` der Docker-Gruppe hinzugefuegt. Der neue
  Container `lzc-local-stackit-login` verwendet PostgreSQL 17.11 und ist nur auf
  Loopback erreichbar; Label `io.stackit.lzc.local-login=true` gesetzt.
- Node/npm-Systemversionen auf Ubuntu bleiben 22.22.1 / 9.2.0. Die App benutzt
  die gepinnten Versionen 24.21.0 / 11.19.0 ueber `npm exec`.
- npm-Abhaengigkeiten neu aus dem Lockfile installiert. `npm run check` bestanden:
  Lint ohne Fehler, Typpruefung, Build und 433 Unit-Tests; 53 umgebungsgebundene
  Tests uebersprungen. Bestehende Lint-/Bundle-Warnungen bleiben erhalten.

Nicht uebernommen: macOS-App-Abhaengigkeiten, `.venv`, `.terraform`-Caches,
Build-/Test-Ausgaben, Python-Bytecode und `openai.token`. Browser-Sessions muessen
auf Ubuntu durch eine erneute Anmeldung hergestellt werden. Dies ist keine
vollstaendige Kopie des macOS-Benutzerverzeichnisses.

## Linux-Paket

Das qualifizierte Release aus Run `37929894997` wurde heruntergeladen, per SSH
uebertragen und auf Ubuntu anhand seiner SHA-256-Dateien erneut geprueft.
Unveraenderter Paketpfad:

```text
/home/developer/projects/stackit-landing-zone/landing-zone-configurator/.local/ubuntu-release-37929894997/runner
```

Das enthaltene OpenTofu-Binary meldet auf Ubuntu Version 1.12.6. Platform-Quelle
ist `c4b43c36af198985980b17626c48d357795e3fbd`, Application-Quelle
`57ad1f6a651c1787694b74ff8aa8b241a3dcd16f` mit Maintenance-Unterstuetzung.
Alte macOS-Pakete bleiben als historische Daten erhalten, werden aber nicht fuer
neue Ubuntu-Ausfuehrungen benutzt. Alte Saved Plans niemals an das Linux-Paket
umbinden: neue Ausfuehrungen brauchen einen neuen passenden Plan und Freigabe.

## Noch nicht bestaetigt

Die API/UI wurden auf Ubuntu noch nicht gestartet. Neue SSH-Verbindungen lieferten
nach dem abgeschlossenen Transfer wiederholt einen Transport-Timeout. Der
bereitgestellte Connector nutzt einen Interface-Proxy; direktes SSH ohne Proxy
wurde zurueckgesetzt. Kein VPN, keine Route und kein Connector wurden veraendert.

Der alte native Worker-Test mit `initial-plan-only` und Revision `a256...` wurde
vom gepinnten Platform-Paket vor Init korrekt wegen abweichender Source abgewiesen.
Das ist kein erfolgreicher nativer Test. Backendfreies Init/Validate der passenden
Roots und der Anwendungseinstieg bleiben auf Ubuntu noch zu bestaetigen. Das Paket
selbst besitzt bereits die dokumentierte gruene Linux-CI-Qualifikation.
Keine Kunden-Cloud-Plan/Apply/Destroy-Aktion wurde ausgefuehrt.

## Auf Ubuntu starten

Vorher gegebenenfalls neu anmelden, damit die Docker-Gruppenzugehoerigkeit aktiv ist.
Diese Befehle laufen auf Ubuntu, nicht im macOS-Repository. Zunaechst die
datenhaltende Container-Instanz pruefen:

```sh
docker ps --filter name=lzc-local-stackit-login
cd /home/developer/projects/stackit-landing-zone/landing-zone-configurator/app
```

Terminal 1, API mit echtem lokalen Login und beiden nativen Runner-Pfaden:

```sh
cd /home/developer/projects/stackit-landing-zone/landing-zone-configurator/app
LZC_STACKIT_CLI_CLIENT_APPROVED=true \
LZC_RUNNER_PACKAGE_DIR=../.local/ubuntu-release-37929894997/runner \
LZC_APPLICATION_EXECUTION_ENABLED=true \
LZC_APPLICATION_RUNNER_PACKAGE_DIR=../.local/ubuntu-release-37929894997/runner \
npm exec --yes --package=node@24.21.0 --package=npm@11.19.0 -- npm run dev:execution
```

Terminal 2, bereits erfolgreich gebautes UI:

```sh
cd /home/developer/projects/stackit-landing-zone/landing-zone-configurator/app
npm exec --yes --package=node@24.21.0 --package=npm@11.19.0 -- \
  npm run preview --workspace=@lzc/web -- --port 4181 --strictPort
```

Browser auf Ubuntu: `http://127.0.0.1:4181`. Die Anwendung und Datenbank werden
nicht oeffentlich freigegeben. Die CLI-Anmeldung verwendet einen lokalen Callback
auf dem ersten freien Port 8000 bis 8020. Ein Browser auf einem anderen Rechner
braucht passende SSH-Weiterleitungen fuer UI, API und den tatsaechlichen Callback;
die bisherige macOS-Instanz belegt dort bereits 3000 und 4181. Keinen gehosteten
CLI-Client oder abweichenden Origin als Abkuerzung konfigurieren.

Nach weiteren Quellcode-Aenderungen `npm run build` mit den gepinnten Versionen
erneut ausfuehren. Der Starter verwendet die uebernommene, gelabelte Datenbank und
deren vorhandene Schluessel, nicht eine neue leere DB. Er rotiert beim Start die
lokalen Rollenpasswoerter, ohne Nutzer/Entwuerfe zu loeschen. Migrationen 001-050
bleiben unveraenderlich; ab 051 neue Migrationen anlegen.

Das gehostete CF-Dev bleibt unabhaengig davon bis zur bereits angeforderten
oeffentlichen Web-Client-ID gesperrt. Die weiteren Grenzen stehen in der
[Entwicklungsuebergabe](development-handoff-2026-10-09.md).