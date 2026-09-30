# Fachmodell

Gemeinsame Logik für UI, API und Chat-Vorschläge. Keine Secret-Auflösung in diesem
Paket. Die bisherige Anwendung verwendet weiterhin den Standalone-Vertrag v1/v2;
das gemeinsame Modell wird vor der UI-/API-Umschaltung separat getestet.

## Gemeinsames Modell (v3, noch nicht an die Produkt-API angeschlossen)

- `features.ts`: alle 28 Root-Eingaben in fachlichen Gruppen; Feldkatalog inklusive
  verschachtelter Typen und separat ausgewiesener geschützter Eingaben.
- `common-document.ts`: alle acht Templates importieren, Version 1/2 migrieren,
  stabile Objektidentitäten, gemeinsame Projekt-/Bereichsprojektionen und Export.
- `common-validation.ts`: Referenzen, Konfigurationskombinationen und bekannte
  Ausführungsgrenzen getrennt beurteilen. Kein Ersatz für Provider-Prüfung oder Plan.
- `accelerator-inputs.json`: generierter Typvertrag, keine handgepflegte zweite
  Terraform-Typdefinition. Aktualitätsprüfung in CI; siehe HCL-Adapter-README.

`createCommonConfiguration(templateId, id)` kopiert eine vertrauenswürdige Vorlage.
`migrateCommonConfiguration(legacy)` kompiliert zunächst mit dem alten Vertrag;
anschließender Export bleibt bytegleich, auch für Ordneränderungen in v2.
`readCommonConfiguration` prüft Form, Herkunft, Eingaben und Objektidentitäten.
Unvollständige fachliche Angaben dürfen für die weitere Bearbeitung bestehen bleiben.

Intern enthalten die Feature-Gruppen die expliziten Engine-Eingaben. Die Oberfläche
soll darauf fachliche Editoren aufsetzen, kein generisches Terraform-Variablenformular.
`commonProjects` liefert Public, Corporate und Sandbox in derselben Sicht mit
Zielordner und Bereichsbezug. `commonNetworkAreas` liefert einzelne und regionale
Bereiche ohne deren Quellen beim Lesen umzuschreiben.

`setCommonInput` ändert Werte, **nicht** die Identitätsliste von Sammlungen.
Sammlungsänderungen brauchen explizite Operationen mit konsistenter Identitätsliste.
`renameCommonProject` erhält die UI-Identität und passt Namespace-Referenzen an;
Terraform-Adressen ändern sich dabei trotzdem. Die spätere UI muss das bestätigen
lassen. `removeCommonNetworkArea` blockiert bestehende Projekt-/Dienstreferenzen.
Weitere Anlegen-/Ändern-Operationen folgen mit dem gemeinsamen Editor.

`compileCommonConfiguration` / `exportCommonTfvars` erhalten ausgelassene Werte,
explizites `null` und explizite Konfiguration. `effectiveInput` liefert ausschließlich
Anzeige-/Validierungswerte mit Defaults; diese Projektion darf nicht zurückexportiert
werden. Regionale `map(any)`-Eingaben werden nur für tatsächlich im Root verdrahtete
Felder akzeptiert; ihre Defaults werden nicht pauschal aus dem Einzelregionsmodell
übernommen. Unbekannte Attribute und deklarierte Secret-Eingaben werden abgelehnt,
nicht still entfernt. Ein freies Textfeld ist dadurch kein Secret-Scanner.

`assessCommonConfiguration` liefert Konfigurationsfehler, Warnungen, bekannte
Ausführungsgrenzen und benötigte Phasen. Ein leeres Ergebnis ist **keine**
Deployment-Freigabe. Vor produktiver v3-Ausführung fehlen noch API-Anbindung,
Credential-Bindings, vollständige fachliche Prüfungen, Provider-/Modultests und
serverseitig durchgesetzte Runner-Capabilities. Der bestehende Plan-Endpunkt nimmt
weiterhin ausschließlich v1/v2 an. Kunden-Apply bleibt separat freigabepflichtig.

## Prüfungen

Aus `landing-zone-configurator/app` mit Node 24 und installiertem `node_modules`:

```sh
npm run check
node scripts/prepare-common-contract.ts
tofu -chdir=../.local/common-contract init -backend=false -input=false -no-color
tofu -chdir=../.local/common-contract test -no-color
```

Die zehn nativen Tests prüfen den unveränderten Root-Variablenvertrag ohne Provider,
Backend oder Cloud-Zugriff: acht Vorlagen plus zwei Object-Lock-Defaultfälle.
Standalone erwartet gezielt den bekannten Validierungsfehler aus Issue #84.
Dies sind keine vollständigen Modul-/Ressourcenpläne. Der native HCL-Roundtrip in
`tools/hcl-adapter` vergleicht zusätzlich alle exportierten Werte semantisch.
