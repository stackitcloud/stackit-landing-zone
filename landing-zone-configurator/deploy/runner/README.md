# Gepinnter Accelerator für Kunden-Pläne

Quelle: `stackitcloud/stackit-landing-zone`, Commit
`a256f6896d11134fdc351786f1be5eba4e56b2e2` (derselbe Stand wie Vorbereitungen).
Engine: OpenTofu **1.12.6**. `accelerator.lock.hcl` wurde aus einem sauberen
`git archive` dieses Commits mit `tofu init -backend=false` und
`tofu providers lock -platform=linux_amd64 -platform=darwin_arm64` erzeugt.
Der Quellcommit enthält kein eingechecktes Root-Lockfile. Der Configurator besitzt
deshalb einen separaten Lock für genau diese Code-Version; das Accelerator-Original
wird nicht verändert. Provider-Updates verlangen eine neue gemeinsame Qualifizierung.

Im späteren Build wird die Datei als `src/.terraform.lock.hcl` in das isolierte
Accelerator-Paket kopiert. Anschließend ausschließlich `tofu init -lockfile=readonly`.
Linux-Checksummen sind erfasst; ein Linux-Runner-Lauf und dessen Isolation sind noch
nicht abgenommen. Lokales readonly-init und validate erfolgreich. Der opnsense-
Provider wurde vom Registry-Download ohne GPG-Signatur angeboten; Checksummen sind
gepinnt, dies ist kein Signaturnachweis dieses Providers.

Noch kein produktiver Runner, kein Docker-Image und kein CF-Deployment. Geplanter
Ablauf und Freigabegrenzen: [Plan-Ausführung](../../docs/plan-execution.md).
