# HCL-Importadapter

Kleiner Go-Adapter mit [HashiCorp HCL v2](https://pkg.go.dev/github.com/hashicorp/hcl/v2/hclparse).
Er liest die eingecheckten `.tfvars` aus `src/config`, wertet ausschließlich
Ausdrücke ohne Variablen-/Funktionskontext aus und erzeugt den versionierten
JSON-Katalog für die Web-App. Kein Terraform/OpenTofu-Aufruf, kein Netzwerkdienst
und keine Secret-Auflösung. Fachregeln bleiben im TypeScript-Domain-Paket.

Aus diesem Verzeichnis:

```sh
# Einmal vor den Roundtrip-Tests: in ../../app npm ci und npm run build:packages
go test ./...
go run .          # Katalog aktualisieren
go run . -check   # CI: veralteten Katalog erkennen, keine Dateien ändern
```

`go.mod`/`go.sum` pinnen die Abhängigkeiten. CI verwendet Go 1.27.1.
Der Katalog enthält `schemaVersion: 1` und pro Template ID, Repository-Pfad,
SHA-256 der unveränderten Quelldatei sowie alle aktiven Attributwerte.
Kommentare sind keine Konfiguration und werden nicht importiert. Nicht unterstützte
Referenzen, Funktionen, HCL-Blöcke und Syntaxfehler brechen die Generierung ab.

Der derzeitige Adapter verarbeitet nur vertrauenswürdige Repository-Vorlagen
beim Entwickeln/Build. Er ist keine API zum Ausführen beliebiger Benutzerdateien.
Es werden keine Defaultwerte aus `variables.tf` automatisch materialisiert.
Unberührte Attribute bleiben bei der Erstellung eines Standalone-Entwurfs erhalten.

Bei Änderungen an `src/config` den Katalog neu erzeugen und gemeinsam committen.
Validierung und Release prüfen den Katalog gegen die Quellen; ein veralteter Stand
wird nicht veröffentlicht. Die Accelerator-Dateien selbst werden nicht verändert.

## Accelerator-Eingabeinventar

Alle Root-Variablen einschließlich verschachtelter Typen, optionaler Defaults und
Validierungsblöcke lassen sich aus dem vertrauenswürdigen Accelerator extrahieren:

```sh
go run . -variables-source ../../../src/variables.tf -output ../../docs/accelerator-inputs.json
go run . -variables-source ../../../src/variables.tf -output ../../app/packages/domain/src/accelerator-inputs.json
go run . -variables-source ../../../src/variables.tf -output ../../docs/accelerator-inputs.json -check
```

Sensible Defaults werden ausgelassen. Der Typ `dynamic` bleibt ausdrücklich
unaufgelöst und benötigt ein fachliches Schema aus der Modulverdrahtung.
`nestedDefaults.children[""]` bezeichnet den Elementtyp einer Map/Liste. Das Inventar
ersetzt keine fachlichen Abhängigkeiten und erzeugt kein Terraform-Variablen-UI.

Die zweite Inventardatei ist das Build-Artefakt im Domain-Paket. CI prüft beide
Dateien gegen dieselbe Quelle. Gemeinsamer Compiler und Legacy-Migration sind in
[Domain-README](../../app/packages/domain/README.md) beschrieben.
