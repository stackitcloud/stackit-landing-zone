<a id="pinned-accelerator-for-customer-plans"></a>

# Gepinnter Accelerator für Kunden-Pläne

[English](README.md) | [Deutsch](README.de.md)

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
Linux-Checksummen sind erfasst. Die Release-Pipeline prüft init/validate und die
CF-Isolation vor der Abnahme; aktueller Status steht im Abnahmedokument. Der opnsense-
Provider wurde vom Registry-Download ohne GPG-Signatur angeboten; Checksummen sind
gepinnt, dies ist kein Signaturnachweis dieses Providers.

`package.sh` baut ein separates Binary-Paket mit Node, OpenTofu und
Provider-Mirror; `manifest.yml` staged ein task-only CF-Template ohne Bindings.
Der finale Image-Buildpack wird über `LZC_IMAGE_BUILDPACK` auf den freigegebenen
Release-Commit gepinnt; die geschützte Pipeline liefert die Runner-Variablendatei.
Hosted-Archive enthalten die qualifizierte Image-SHA statt der großen QCOW2-Datei.
Beim Staging wird diese aus STACKIT Object Storage geladen, SHA-geprüft und
ohne zusätzliche Dateikopie am ursprünglichen Pfad ins Droplet verschoben.
Das unveränderliche CF-Droplet ist der dauerhafte Cache; ein redundantes großes
Buildpack-Cache-Archiv wird vermieden.
CI prüft dafür die bytegleiche Wiederherstellung und unveränderte Paketidentität.
Lokale Archive bleiben vollständig. Es gibt keinen Download pro Nutzer oder Plan.
Details und Grenzen: [CF-Staging und Cache](../cloud-foundry/README.de.md#image-staging-and-caching).
Der Dispatcher kopiert dessen Droplet in eine neue App pro Auftrag. Direkte
OpenTofu-Schritte stehen in `run-plan.sh`. Ablauf und Freigabegrenzen: [Plan-Ausführung](../../docs/plan-execution.de.md).
