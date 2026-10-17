<a id="firewall-access-and-bootstrap-phases"></a>

# Firewall-Zugriff und Bootstrap-Phasen

[English](firewall-access-bootstrap.md) | [Deutsch](firewall-access-bootstrap.de.md)

Deutsche Lesefassung. Der Assistant liest ausschliesslich die englische Quelle.

<a id="purpose"></a>

## Zweck

Sicheren Appliance-Zugang fuer unterstuetzte Bootstrap- und Policy-Vorgaenge
vorbereiten, ohne Secrets in Gespraeche, Konfigurationsdokumente oder Exporte
einzubetten.

<a id="accelerator-contract"></a>

## Accelerator-Vertrag

Native Root-Eingaben: `firewall_admin_username`, `firewall_admin_password`,
`firewall_api_credentials`, `firewall_bootstrap`, `firewall_api_secret_version`.
Bootstrap ist ein boolescher Phasenschalter, kein erfundenes Objekt.
Aktueller Root-Bootstrap behandelt den einzelnen Pfad `connectivity.firewall`,
kann lokale API-Zugangsdaten erzeugen und in spaeteren Phasen Management
Secrets Manager/Vault nutzen.
Bestehende Datei-/Secret-/Provider-Pfade sind Anliegen nativer Ausfuehrung,
keine Anweisung an das Modell, sie zu lesen.
Policy-Aktivierung folgt den tatsaechlichen Bootstrap-Bedingungen.

<a id="dependencies"></a>

## Abhaengigkeiten

Explizit benoetigte unterstuetzte Firewall, Management-Secret-Speicher,
Provider- und Appliance-Konnektivitaet.
HA-Zugriffsanforderungen umfassen Primary und Backup.
Zugangsdaten-Grundlagen bleiben auch bei reinen Infrastrukturthemen
verpflichtend.

<a id="dialogue"></a>

## Dialog

Erfragen, ob Infrastruktur erstellt, Bootstrap oder Policy-Wartung
durchgefuehrt werden soll, welcher autorisierte Runner die Appliance erreicht
und wer Zugangsdaten verantwortet.
Auf sichere Bindungssteuerung verweisen.
Niemals Passwort-/API-Werte oder interne Secret-Version-IDs erfragen.
Defaults in Image/Schema sind weder sichere Zugriffsentscheidung noch
Freigabe zur Initialisierung einer Appliance.

<a id="examples"></a>

## Beispiele

Synthetisches natives Phasenfragment: `firewall_bootstrap = false`.
Allein ist dies keine vollstaendige Policy-Voraussetzung; externe
Zugangsdaten, Secret-Verfuegbarkeit und aktivierter `firewall_config`-Vertrag
muessen unabhaengig geprueft werden.

<a id="limits"></a>

## Grenzen

Keine generische regionale/Multi-Appliance-Bootstrap-Paritaet, automatische
Zugangsdatenrotation oder vollstaendig qualifizierte Ausfuehrung ausserhalb
des Configurators behaupten. Der aktuelle Chat kann weder Secrets noch
Bootstrap-Zugang oder Ausfuehrungsfreigaben aendern.
Lokale Erstellung von Zugangsdaten-Dateien ist eine sensible
Ausfuehrungsnebenwirkung; Template-Auswahl oder Annahme eines
SNA-Vorschlags darf sie nicht allein ausloesen.

<a id="credentials"></a>

## Zugangsdaten

Passwoerter/API-Schluessel bleiben in sicheren externen Bindungen;
Defaults aus Quellcode niemals wiedergeben.
Secret-Version-Metadaten sind kein abzuleitender Wert.
Keine Token-Rotation, Zugangsdaten-Dateizugriffe oder Uebertragung roher States
oder Plaene in den Modellkontext.

<a id="sources"></a>

## Quellen

Root-Variablen, Bootstrap-Logik, Provider und Deployment-Zugangsdaten
dokumentieren die native Phasengrenze.
Prioritaet, Write-only-/ephemere Secrets und Umfang vor Neugenerierung
erneut pruefen; dieser Text zertifiziert keine sicheren Bootstrap-Laeufe.
