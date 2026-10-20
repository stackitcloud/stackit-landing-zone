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

## Optionaler einmaliger Warm-Pool

Der Warm-Pool ist standardmäßig deaktiviert (`LZC_RUNNER_POOL_SIZE=0`; die geplante
Betreibereinstellung akzeptiert 0..4). Ein warmer Runner hält einen wartenden
Node-Prozess im selben CF-Container bereit, mit ausschließlich unveränderlichen
Paketdateien. Vor der Zuweisung entstehen weder Auftragszugangsdaten noch
Konfiguration oder Arbeitsverzeichnis. Veränderliche Arbeitsverzeichnisse werden
weder geteilt noch zwischen Aufträgen wiederverwendet.

Der Pool-Bootstrap benötigt gemeinsam `LZC_POOL_RUNNER_ID` (UUID) und
`LZC_POOL_TICKET` (opakes Bootstrap-Token mit 43 Base64url-Zeichen) sowie den
bestehenden vertrauenswürdigen `LZC_BROKER_ORIGIN`. Der Pool-Modus lehnt
`LZC_RUN_ID`, `LZC_RUN_TICKET` und den lokalen Runner-Modus ab. Das Bootstrap-Ticket
authentifiziert ausschließlich `POST /api/internal/runner-pool/{id}/claim`;
es ist kein Auftragsticket. Nur ein unzugewiesener Status `204` wird ungefähr
sekündlich wiederholt. Eine strikt validierte `200`-Zuweisung liefert genau eine
Auftrags-ID, ein Auftragsticket und das Broker-Profil platform/application,
niemals einen neuen Origin, Quellcode oder Paketpfad. Anfragen einschließlich
Antwortinhalt laufen nach höchstens 10 Sekunden ab. Weiterleitungen, ungültige
Zuweisungen, Autorisierungs-/Konfliktfehler und Netzwerkfehler beenden den Prozess
ohne Wiederholung, weil eine verlorene Antwort die Zuweisung bereits verbraucht
haben könnte.

Wartende Runner laufen nach 15 Minuten ab; SIGTERM oder SIGINT brechen wartende
Anfragen und Pausen ab. Nach einer Zuweisung ruft der Prozess den bestehenden
Worker genau einmal auf und endet, auch bei Auftrags- oder Ergebnis-Callback-Fehlern.
Er akzeptiert niemals einen zweiten Auftrag. Ohne Pool-Bootstrap-Variablen bleibt
das Verhalten des kalten und lokalen `main.js`-Einstiegspunkts unverändert. Diese
Bootstrap-Semantik stellt keine Infrastruktur bereit: API-/CF-Lifecycle-Integration
und Hosted-Qualifizierung bleiben separate Betreiberaufgaben. Die Quellcode-
Fähigkeit erteilt keine Freigabe für ein Cloud-Deployment.

Der Worker lässt das 993.525.760 Byte große Image in Arbeitsverzeichnissen ohne
Firewall weg. Firewall-Plan und Apply des gespeicherten Plans prüfen die reguläre,
nicht symbolisch verknüpfte Paketdatei gegen ihre gepinnte SHA-256 und behalten
`firewall-image.qcow2` am ursprünglichen relativen Pfad. Für Quelldateien werden
Dateisystem-Reflinks angefordert; andernfalls entsteht eine unabhängige Kopie.
Veränderliche Auftragsdateien erhalten niemals Hardlinks. Die Image-Prüfsumme und
die plattformseitige Droplet-Kopie pro Auftrag entfallen dadurch nicht.

Die Paketierung entpackt gepinnte Provider-Archive einmalig in das entpackte
Layout des Dateisystem-Mirrors, entfernt die Archive und setzt den Mirror auf
schreibgeschützt. Anschließend belegt sie Offline-Init/Validate mit unveränderten
Lockdateien und `-lockfile=readonly`. Aufträge können diese Provider symbolisch
verknüpfen, statt sie erneut zu entpacken. Es gibt keinen direkten Registry- oder
Netzwerk-Fallback; fehlende Provider oder abweichende Prüfsummen verhindern
weiterhin die Initialisierung.
Die bestehende Paketqualifizierung führt diesen Test mit dem echten Mirror neben
den Worker-Tests für das verifizierte Image gegen das vollständige Runner-Paket aus.

Lokale Linux-Messungen mit OpenTofu **1.12.6** und allen acht gepinnten Providern
verwendeten je Mirror-Layout drei frische Arbeitsverzeichnisse für ein
Offline-`init -backend=false -input=false -lockfile=readonly`. Der Dateisystem-Cache
war warm und wurde nicht geleert; Quellkopien und Mirror-Vorbereitung lagen
außerhalb der Zeitmessung, während parallel weitere Prüfungen liefen. Die mediane
Init-Dauer betrug **2,391 s** für gepackte Archive gegenüber **0,286 s** für den
entpackten Mirror. Alle acht Provider-Verzeichnisse wurden symbolisch verknüpft;
der durch Init erzeugte reguläre Dateiinhalt sank von 383.566.252 auf 1.745 Byte.
Die Bytes der ursprünglichen Lockdatei blieben unverändert.
Der Kompromiss sind **263.440.768 zusätzliche logische Bytes** im entpackten Mirror
(120.125.808 → 383.566.576 Byte).
Dies sind ausschließlich lokale Offline-Init-Beobachtungen mit warmem Cache und
deaktiviertem Backend: Sie messen keine Kaltstarts im Hosting und belegen nicht,
dass eine minutenlange Startverzögerung im Hosting behoben ist. Droplet-Aufbau und
-Kopien, Firewall-Image-Prüfsummen, unabhängige Image-Kopien ohne Reflink-Unterstützung,
Provider-Prüfsummen und Backend-Initialisierung bleiben separate Kosten, die
Messungen im Hosting erfordern.

Die authentifizierte Runner-Ausgabe enthält feste Bezeichnungen für Startphasen,
deren Dauer und kumulierte verstrichene Millisekunden aus einer monotonen Uhr.
Dies sind Beobachtungen, keine Fortschrittsprozente und kein Nachweis einer
gemessenen Beschleunigung im Hosting.
Für Firewall-Infrastruktur übermittelte Administrationsdaten werden strikt
validiert und ausschließlich über die Unterprozess-Umgebung
`TF_VAR_firewall_admin_username` / `TF_VAR_firewall_admin_password` bereitgestellt.
Keiner der Werte wird öffentlichen tfvars, Hashes oder Befehlsargumenten
hinzugefügt; beide werden auch bei fehlgeschlagenen Befehlen aus Ausgaben
entfernt. Apply verwendet den exakt geprüften gespeicherten Plan ohne Neuplanung;
Application-Aufträge lehnen diese Fähigkeiten ab.
