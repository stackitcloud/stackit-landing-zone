<a id="organization-and-naming-foundations"></a>

# Grundlagen fuer Organisation und Benennung

[English](identity-foundations.md) | [Deutsch](identity-foundations.de.md)

Deutsche Lesefassung. Der Assistant liest ausschliesslich die englische Quelle.

<a id="purpose"></a>

## Zweck

Organisation, Eigentuemerschaft, Benennung und Region kommen vor Plattform-Services.
Ein Firmenname ist weder Organisations-ID noch Zugriffsbeleg.

<a id="accelerator-contract"></a>

## Accelerator-Vertrag

Root-Felder: `organization_id`, `owner_email`, `company_name`, `company_code`,
`region`, `labels`, `platform_contract_namespace`.
Namespace ist stabile Uebergabemetadaten, keine Autorisierung.
Namen werden aus `company_code`, Projektcodes und Umgebungen abgeleitet,
nicht aus `company_name`. Provider-Regionen muessen zur Root-/Modulverdrahtung passen.

<a id="dependencies"></a>

## Abhaengigkeiten

Governance verwendet Organisation/Eigentuemerschaft; regionale Services und
Projekte verwenden Benennung. Zugangsdaten bleiben getrennt; Abhaengigkeiten
aktivieren niemals Services.

<a id="dialogue"></a>

## Dialog

Angegebene Firmennamen woertlich uebernehmen. Explizite Delegation geeigneter
Namen erlaubt pruefbare Namen/Codes, nicht Region, erratene E-Mail-Adressen,
Cloud-IDs oder Zugriff.
`organization_id` nur aus der exakt vom Nutzer genannten bestehenden UUID
vorschlagen: keine Zugriffspruefung oder Tenant-Bindung.
`owner_email` darf Nutzeranforderungen, gespeicherte Grundlagen oder die aktuell
verifizierte menschliche Login-E-Mail wiederverwenden; niemals eine Adresse
erfinden. Template-Platzhalter sind keine Nutzerentscheidungen.
Zugriff ausserhalb des Chats klaeren. Firma/Region bei reiner SNA-Arbeit
erhalten; verbleibende Platzhalter getrennt kennzeichnen.

<a id="examples"></a>

## Beispiele

Synthetisches Benennungsfragment:
`company_name = "Example GmbH"`, `company_code = "ex"`, `region = "eu01"`,
`labels = { environment = "lab" }`.
Dies ist weder vollstaendig deploybare Konfiguration noch Berechtigung,
Ressourcen anzulegen.

<a id="limits"></a>

## Grenzen

Labels beweisen weder Ressourcennamen noch Mitgliedschaft.
Namens-/Regionsaenderungen koennen Ressourcen ersetzen; gespeicherte Werte sind
kein Cloud-Inventar. Importe und stabile Identitaeten erhalten.
Kompilierung beweist weder Berechtigungen noch Deployment.

<a id="credentials"></a>

## Zugangsdaten

Extern bereitgestellte Provider-Zugangsdaten und autorisierten
Organisationsumfang verwenden. Niemals Service-Account-Schluessel, Tokens oder
interne Zugangsdaten-Profilpfade anfordern.

<a id="sources"></a>

## Quellen

Das Manifest bindet Variablen/Provider/Funktionsmodell an die Engine-Revision.
Benennung, Region und Uebergabe vor Neugenerierung erneut pruefen;
nur lokaler Entwurf.
