<a id="governance-folders-and-roles"></a>

# Governance, Ordner und Rollen

[English](governance-folders.md) | [Deutsch](governance-folders.de.md)

Deutsche Lesefassung. Der Assistant liest ausschliesslich die englische Quelle.

<a id="purpose"></a>

## Zweck

Plattform-, Corporate-/Public- und Sandbox-Verwaltung durch bewusst gewaehlten
Organisations- und Ordnerzugriff trennen.

<a id="accelerator-contract"></a>

## Accelerator-Vertrag

Native Root-Eingaben: `rm_folder_parent_id`, `rm_folders`,
`organization_owners` und `organization_auditors`.
Root-Governance ist bedingungslos; `folder_container_ids` versorgt nachgelagerte
Module. Namen erlauben 1-40 Zeichen. Der gepinnte Provider lehnt sinnvolle
Ordnerbeschreibungen ab. Parent-Auswahl findet keine Ordner und beweist keinen
Organisationszugriff.

<a id="dependencies"></a>

## Abhaengigkeiten

Organisations-/Benennungsgrundlagen und getrennte Provider-Bindungen.
Management, Konnektivitaet, Plattform und Projekt-Templates verwenden
Governance-Ausgaben.

<a id="dialogue"></a>

## Dialog

Namensdelegation erlaubt nur bestehende Ordnernamen, keine Rollenvergabe.
Explizite Rollenwuensche koennen additive `organization_owners/auditors` oder
`owner_emails/reader_emails` bestehender Ordner vorschlagen. Die angeforderte
gespeicherte `owner_email`, verifizierte menschliche E-Mail oder explizite
Nutzeradresse wiederverwenden. Template-Kontakt, Entwickler-Login oder Service
Account sind keine menschliche Identitaet.
Fehlende E-Mail oder Zielordner erfragen; niemals alle Ordner erraten.
Bestehende Subjekte, Schluessel und Metadaten erhalten.
Organisations-Eigentuemer decken Ordner ab; native Verdrahtung ueberspringt
doppelte Ordnerzuweisungen. Ordnerleser verwenden `auditor`.
Feldannahme speichert einen Entwurf, niemals IAM-Rechte,
Configurator-Mitgliedschaft oder Tenant-Bindung; tatsaechliches IAM benoetigt
geprueften Plan/Apply.

<a id="examples"></a>

## Beispiele

"Nutze die hinterlegte Email als Organisationsverantwortlichen" schlaegt vor,
die gespeicherte Adresse zu `organization_owners` hinzuzufuegen und aktuelle
Eintraege zu erhalten. Dies ist nicht nur eine Kontaktaktualisierung von
`owner_email`. Leere Rollenlisten fuegen keine Zuweisungen hinzu und beweisen
nicht die Abwesenheit unabhaengig verwalteter IAM-Rechte.

<a id="limits"></a>

## Grenzen

Owner-Rollen haben weitreichende Wirkung. Keine neuen Ordnerschluessel,
Parent-IDs, entfernten Subjekte oder echten Rechtevergaben im Chat.
Native Defaults fuer ausgelassene Ordner und explizit leere Maps erhalten.
Importe, Eigentuemerschaft und IAM-Wirkungen benoetigen separate Pruefung.

<a id="credentials"></a>

## Zugangsdaten

Autorisierter Resource-Manager-/IAM-Umfang liegt ausserhalb des Modells.
Keine Zugangsdaten oder versteckten Configurator-Referenzen in tfvars.

<a id="sources"></a>

## Quellen

Governance-Variablen, native Ordner-/Organisationszuweisungen, Root-Aufrufe und
gemeinsame Validierung; Manifest-Hashes identifizieren den geprueften lokalen
Quellenstand.
