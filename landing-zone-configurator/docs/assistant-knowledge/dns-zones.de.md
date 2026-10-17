<a id="dns-zones-and-resolver-assignment"></a>

# DNS-Zonen und Resolver-Zuordnung

[English](dns-zones.md) | [Deutsch](dns-zones.de.md)

Deutsche Lesefassung. Der Assistant liest ausschliesslich die englische Quelle.

<a id="purpose"></a>

## Zweck

Autoritative DNS-Zonen, Records und SNA-Resolver unterscheiden.

<a id="accelerator-contract"></a>

## Accelerator-Vertrag

Zonenfelder: `dns_name`, `name`, `description`, `default_ttl`, `type`,
`contact_email`, `acl`, `network_area_key` (bestehende SNA/Projekt).
Projektzonen verwenden `dns_zone_name`; SNA-`default_nameservers` setzt
Resolver, keine Zonen.

<a id="dependencies"></a>

## Abhaengigkeiten

Bestehende SNA/Projekt; Kubernetes-/Namespace-DNS folgt eigenen Vertraegen.

<a id="dialogue"></a>

## Dialog

Kostenlose Primary-Zonen-Suffixe:
`runs.onstackit.cloud`, `stackit.rocks`, `stackit.gg`, `stackit.zone`, `stackit.run`.
`stackit.cloud` ist KEIN angebotenes Suffix. Genau EIN kleingeschriebenes
DNS-Label ergaenzen: Buchstaben/Ziffern/Bindestriche, keine Bindestriche am
Anfang/Ende, maximal 63 Zeichen.
Bestaetigte Domains wiederverwenden. Bei angeforderten restlichen Einstellungen:
`name` (Kleinbuchstaben/Bindestriche, maximal 63), sachliche Beschreibung
(maximal 1024), TTL 3600 s/native Basis vorschlagen; 300 s bei explizit
haeufigen Aenderungen (Bereich 60..99999999).
Abwaegung zwischen Caching und Aenderungsgeschwindigkeit erklaeren.
`type`: `primary/secondary`, niemals Public-/Private-Sichtbarkeit.
Beide sind autoritativ: Primary verwaltet Records bei STACKIT (fuer neue
Firmenzonen waehlen); Secondary repliziert externe Primaries.
Deren Konfiguration fehlt diesem Modul: kein vollstaendiges Secondary-Setup;
eine vorhandene Secondary niemals still umwandeln.
Kontakt: Vorhandenen DNS-Kontakt erhalten; sonst gespeicherte `owner_email`,
danach die aktuell verifizierte menschliche Login-E-Mail als pruefbaren
Default vorschlagen. Quelle erklaeren; niemals eine Adresse erfinden.
Nur fragen, wenn kein Kontakt bekannt ist.
Die ACL hat im gepinnten Provider derzeit KEINE Durchsetzung; niemals
eingeschraenkten Zugriff versprechen und ohne explizite Vorgabe erhalten.
Area ohne explizite gueltige Neuzuordnung erhalten.
Verfuegbarkeit ist ungeprueft; kostenlose Subdomain bedeutet NICHT
kostenloser DNS-Service.

<a id="examples"></a>

## Beispiele

Example GmbH: `example-gmbh.runs.onstackit.cloud`; Name `example-gmbh-dns`,
TTL 3600 s. `dev/prod/test` darunter sind Records, keine zusaetzlichen
kostenlosen Zonen-Labels.

<a id="limits"></a>

## Grenzen

Dedizierter zentraler DNS-Dialog: Nur Patches BESTEHENDER Schluessel, kein
Anlegen/regionale Umwandlung. Nativer Editor: explizites Hinzufuegen/Aktualisieren/
Ersetzen vollstaendiger Mengen einschliesslich regionaler Zonen.
Korrekturen verwenden Zonenschluessel wieder; vollstaendige Mengen zeigen
pruefbare Entfernungen. Nur bei explizitem zusaetzlichem Wunsch hinzufuegen.
Ziel erfragen, wenn mehrere Zonen mehrdeutig sind; ausgelassene Felder erhalten.
Feldauswahl-Annahme speichert, deployt niemals; verbleibende Vorschlaege bleiben
verfuegbar. Keine reinen SNA-Zonen; leere Map bedeutet keine Zonen.
Kein Nachweis fuer Propagation/Zertifikate/Erreichbarkeit/Delegation.

<a id="credentials"></a>

## Zugangsdaten

Getrennter Provider-/Registrar-Zugang; keine Passwoerter, Tokens oder
Signaturschluessel im Chat.

<a id="sources"></a>

## Quellen

Natives Manifest und gepinnter Provider 0.114.0, geprueft 2026-10-12.
Das aufgefuehrte `runs.onstackit.cloud` hat Vorrang vor dem Tippfehler
`run.onstackit.cloud` im Singular.
