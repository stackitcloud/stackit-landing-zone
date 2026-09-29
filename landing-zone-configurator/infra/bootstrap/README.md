# State-Bootstrap

Dieser Root erstellt drei Ressourcen: State-Bucket, Credential-Gruppe und befristeten S3-Zugang. Die erste Bucket-Erstellung aktiviert Object Storage automatisch im vorhandenen Projekt.

Dieser Root nutzt den separaten, bereits per Seed-IaC erstellten Verwaltungs-Bucket als verschlüsseltes S3-Backend. Der nachgelagerte [Backend-Root](../backend/README.md) aktiviert die Versionierung mit den dann verfügbaren S3-Credentials. Der Plattform-Root nutzt anschließend den geschützten Bucket.

Erster echter Plan am 2026-09-29 für lzc-dev/eu01 erfolgreich: **3 anlegen, 0 ändern, 0 löschen**. Geplantes Credential-Ablaufdatum: 2026-12-28. Kein Apply ausgeführt. Der gespeicherte Plan liegt verschlüsselt und Git-ignoriert unter `.local/bootstrap/review.tfplan` und ist nur 24 Stunden verwendbar.

[Operator-Anleitung](../README.md). Mock-Tests weisen die Struktur nach; Aktivierung, S3-Kompatibilität und Berechtigungen zum Schreiben sind erst durch den anschließenden Integrationstest belegt.

Aktuell: Remote-Backend initialisiert, echter Plan mit 3 Create erfolgreich; für diesen Root weiterhin kein Apply.

## Erster CI-Apply erfolgreich

Am 2026-09-29 wurde Bootstrap auf dem Feature-Branch über [Run 36601941540](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36601941540) angewendet: drei Ressourcen erstellt, keine Änderungen oder Löschungen. Der verschlüsselte State im Verwaltungs-Bucket enthält alle drei Ressourcen. Die einmalige Commit-Freigabe wurde anschließend entfernt. Die zuvor genannten Angaben „kein Apply“ beschreiben den früheren Planungsstand.

Der nächste Infrastruktur-Schritt ist der separate Backend-Root zur Versionierung des neu erstellten Workload-State-Buckets. Dieser Root wurde noch nicht angewendet.
