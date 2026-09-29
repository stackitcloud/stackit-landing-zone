# Plattform-Vorbereitung nach Bootstrap und Backend

## Abgeschlossen

- [x] Bootstrap-State-Bucket und S3-Zugang via CI erstellt.
- [x] Versionierung dieses Buckets via Backend-Root aktiviert: [Run 36602706599](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36602706599), Commit `d68c0a1a1199c34cf529ef0a87d62943c35a0585`.
- [x] `Enabled` direkt über S3 API sowie verschlüsselten Backend-State unabhängig geprüft.
- [x] Einmalige Commit-/Root-Freigaben nach Apply entfernt.
- [x] Begleitende App-/IaC-Validierung erfolgreich: [Run 36602706648](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36602706648).

## Aus Katalogen vorbereitete Entwicklungsparameter

Die folgenden Werte wurden anhand der Projektkataloge ausgewählt, noch nicht provisioniert. Eine lokale `platform-selection.tfvars.json` enthält die IDs und Datenbankparameter; sie enthält bewusst noch keine Netzwerk-ACL und ist kein vollständiger ausführbarer Plattform-Plan.

| Parameter | Auswahl | Grund |
| --- | --- | --- |
| Foundation | Öffentliche CF `01.cf.eu01` | Geplante Anwendung für unabhängige Kunden |
| CF Quota | small: 10 GiB RAM, 10 Service-Instanzen | Raum für Web/API/Worker und zusätzliche Instanzen bei Deployments; default ist auf drei App-Instanzen begrenzt |
| PostgreSQL | Version 17, Flavor 2.16 | Verfügbar: 2 CPUs und 16 GiB RAM |
| Speicher | 20 GiB, premium-perf2-stackit | Im Katalog verfügbar, gültiger Größenbereich 5–4000 GiB |
| Backups | Täglich 02:00, Retention 32 Tage | Entwicklungsdefault; Produktivziele separat festlegen |

## Vor dem Plattform-Plan offen

- [ ] Verbindliche Egress-CIDRs der öffentlichen CF-Foundation ermitteln und dokumentieren.
- [ ] Zugangsweg für Migrationen/Operator-Zugriffe festlegen; dynamische GitHub-Runner-IPs nicht pauschal freigeben.
- [ ] Plattform-CI mit getrennten Environments und eigenem State-Key anbinden.
- [ ] Konkreten Plattform-Plan prüfen und anschließend deployen.

Aktuell sind noch keine CF-Organisation, PostgreSQL-Instanz, Secrets-Manager-Instanz oder Model-Serving-Tokens durch den Plattform-Root erstellt. Alle Arbeiten verbleiben auf `feature/landing-zone-configurator`.
