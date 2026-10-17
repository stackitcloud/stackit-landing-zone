<a id="federated-operating-identities"></a>

# Foederierte Betriebsidentitaeten

[English](federated-identities.md) | [Deutsch](federated-identities.de.md)

Deutsche Lesefassung. Der Assistant liest ausschliesslich die englische Quelle.

<a id="purpose"></a>

## Zweck

Eng begrenzten externen Workload-Identitaeten den Betrieb ueber den
Management-Service-Account ermoeglichen, ohne Federation als allgemeinen
Login-Schalter zu behandeln.

<a id="accelerator-contract"></a>

## Accelerator-Vertrag

Natives `federated_identity_providers` ist eine Liste mit `name`, `issuer`
und `assertions` aus `item/operator/value`.
Das Management-Modul bindet diese Konfiguration an seinen
Service-Account-Ablauf. Federation legt keine Configurator-Nutzer an,
ersetzt deren Autorisierung nicht und aktiviert nicht alle Funktionen
externer Identity Provider.

<a id="dependencies"></a>

## Abhaengigkeiten

Management-Betriebsidentitaet, Provider-/IAM-Rechte und ein gepruefter
Issuer-/Assertion-Vertrag. Governance-Rechte behalten ihren unabhaengigen Umfang.

<a id="dialogue"></a>

## Dialog

Erfragen, welche CI/Workload handeln muss, wer den Issuer betreibt und welche
Repository-, Umgebungs- oder Subject-Assertions das Vertrauen begrenzen.
Aus einem Herstellernamen kein "allen vertrauen" ableiten.
Issuer/Assertions vor Beratung pruefen; niemals Bearer-Tokens,
Signaturschluessel oder Identity-Provider-Secrets anfordern.

<a id="examples"></a>

## Beispiele

Synthetische Deaktivierung: `federated_identity_providers = []`.
Aktivierung benoetigt einen explizit geprueften Issuer und minimal berechtigte
Assertions, keinen erratenen Beispieloperator, Wildcard-Subject oder aus einer
Pipeline kopierte Zugangsdaten.

<a id="limits"></a>

## Grenzen

Schema-Unterstuetzung beweist weder Issuer-Kompatibilitaet noch erfolgreichen
Token-Austausch. Operatoren, Claims, Audience und IAM-Rechte benoetigen
unabhaengige Pruefung. Native Editor-Vorschlaege unterstuetzen typisierte
Issuer-/Assertion-Konfiguration, keine echten Vertrauensvergaben,
automatische Identitaetserstellung oder Rechteausweitung.

<a id="credentials"></a>

## Zugangsdaten

Provisionierungszugang und ausgetauschte Workload-Tokens bleiben ausserhalb von
Konfigurationsverlauf und Modellkontext.
Zugangsdaten fuer native Ausfuehrung extern binden; Federation ist keine
Berechtigung, bestehende Modell-/Provider-Tokens zu rotieren.

<a id="sources"></a>

## Quellen

Massgeblich sind Management-Variable und Implementierungsvertrag.
Manifest-Fingerprints verfolgen die gepruefte lokale Revision, nicht
Aktualitaet externer Issuer oder eine Produktions-Sicherheitsqualifikation.
