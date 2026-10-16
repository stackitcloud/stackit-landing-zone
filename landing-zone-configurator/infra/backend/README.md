# Remote-State-Absicherung

Dieser Root verwaltet `aws_s3_bucket_versioning` am STACKIT-S3-Endpunkt. Es werden keine AWS-Ressourcen angelegt. Voraussetzung sind der Bucket und S3-Credentials aus dem bereits angewendeten Bootstrap-Root.

Der echte Erstplan hat gezeigt, dass der S3-Provider existierende Credentials bereits zur Planung benötigt. Deshalb ist diese Konfiguration ein eigener Root und kein `-target`-Sonderlauf innerhalb des Bootstrap-Roots.

Der Wrapper übergibt Credentials ausschließlich im Prozessumfeld. Dieser Root nutzt einen eigenen State-Key im Verwaltungs-Bucket. Provider-Zugang zum Workload-Bucket und Backend-Zugang zum Verwaltungs-Bucket werden getrennt übergeben. Der Plattform-Root darf erst nach angewendeter Versionierung sein Remote-Backend initialisieren. [Operator-Anleitung](../README.md).

Dieser Root wurde noch nicht angewendet. Der gleichartige Seed-Protection-Root hat Versionierung am Verwaltungs-Bucket erfolgreich aktiviert; Versionswiederherstellung wurde dort geprüft. Konkurrierende OpenTofu-Zugriffe und vollständiges Disaster Recovery bleiben zu testen.
