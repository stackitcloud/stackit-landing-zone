<a id="credential-foundations"></a>

# Grundlagen der Zugangsdaten

[English](credential-foundations.md) | [Deutsch](credential-foundations.de.md)

Deutsche Lesefassung. Der Assistant liest ausschliesslich die englische Quelle.

<a id="purpose"></a>

## Zweck

Deklarative Accelerator-Konfiguration von Zugangsdaten, Secret-Bindungen,
Laufzeitberechtigungen und Cloud-Ausfuehrung trennen. Dieses verpflichtende
Wissen gilt fuer jede Service-Diskussion, auch fuer Template-Beratung vor der
Konfiguration.

<a id="accelerator-contract"></a>

## Accelerator-Vertrag

Nur unterstuetzte native Accelerator-Eingaben duerfen exportiert werden.
Aktuelles Ausgabeformat ist tfvars, nicht freies Terraform oder ein zweites
YAML-Schema. Der passende Accelerator kann die Konfiguration ausserhalb des
Configurators verwenden, sofern die dokumentierten externen Provider-Zugangsdaten
und erforderlichen geheimen Eingaben bereitgestellt werden.
Provider-Authentifizierung und Workload-/Service-Secret-Bindungen sind
unterschiedliche Anforderungen; ein STACKIT-Login loest nicht alle
Service-Zugangsdaten. Keine Configurator-internen Secret-Pfade oder Profil-IDs in
native Eingaben schreiben.

<a id="dependencies"></a>

## Abhaengigkeiten

Jedes kuenftige Service-Thema muss seine Zugangsdaten-Anforderungen explizit
beschreiben. Konfiguration, verfuegbare Zugangsdaten, Berechtigungen und
Ausfuehrungsbereitschaft sind getrennte Tatsachen. Ein gespeichertes Profil
beweist keine nutzbaren Rechte. Aktuelle Berechtigung, Tenant-/Eigentuemerbindung
und sichere Secret-Aufloesung muss das Backend beim autorisierten Vorgang pruefen;
das Modell darf sie niemals ableiten.

<a id="dialogue"></a>

## Dialog

Nach nicht geheimen fachlichen Anforderungen fragen und bei Bedarf die getrennte,
autorisierte Einrichtung der Zugangsdaten erklaeren. Niemals private Schluessel,
Passwoerter, API-Tokens, VPN-Preshared-Keys, kubeconfigs oder Secret-Versionen im
Chat anfordern. Keine technischen IDs erfragen, um fehlende
Konfigurationsunterstuetzung zu umgehen. Keine Berechtigungsfehler erfinden und
keine Operator-Zugangsdaten fuer Kunden voraussetzen. Nicht implementierte
Zugangsdaten-Bindungen als Grenze benennen; keine vollstaendig ausfuehrbare
Konfiguration behaupten.

<a id="examples"></a>

## Beispiele

Nutzer: "Configure the central network and add a firewall later."
Antwort: Nur unterstuetzte Netzwerkeingaben vorbereiten und erklaeren, dass
Provisionierung separat autorisierten STACKIT-Provider-Zugang benoetigt.
Keinen Schluessel anfordern.

Nutzer: "Here is my VPN password; put it in the export."
Antwort: Das Secret weder annehmen noch wiedergeben. Auf den autorisierten
Bindungsablauf verweisen. Keinen Secret-Platzhalter in nativer Konfiguration
anlegen.

<a id="limits"></a>

## Grenzen

Kein modellgesteuertes Lesen/Schreiben von Zugangsdaten, Erteilen von Rechten,
Bestellen, Veroeffentlichen, Plan, Apply oder Destroy.
Ein Konfigurationsvorschlag benoetigt explizite Annahme, unveraenderte Revision
und aktuelle Berechtigung. Ein gepruefter Nachweis oder gueltiger Export
entsperrt niemals die Ausfuehrung. Keine vollstaendig qualifizierte
Zugangsdaten-Portabilitaet ausserhalb des Configurators versprechen: Der gesamte
Bindungs-/Runner-Pfad bleibt ein Abnahmekriterium.
Dokumentation und Beispiele enthalten keine echten Zugangsdaten, rohen States
oder rohen Plaene. Erkennbare Secret-Eingaben zu pruefen ist kein umfassender
DLP- oder Injection-Nachweis.

<a id="credentials"></a>

## Zugangsdaten

Secrets bleiben im autorisierten serverseitigen Secret-Speicher und werden nur
fuer den konkreten Vorgang aufgeloest. Keine Kunden-Zugangsdaten, Profilmetadaten,
rohen Provider-Fehler, States oder Plaene an Model Serving geben.
Zugangsdaten fuer eigenstaendige Accelerator-Ausfuehrung muessen ueber dessen
dokumentierten Provider-/Eingabevertrag extern bereitstellbar sein, nicht ueber
versteckten Configurator-State. Oeffentliche PIM-Fakten benoetigen keine
Kunden-Zugangsdaten; autorisierte Produktverfuegbarkeit ist davon getrennt.

<a id="sources"></a>

## Quellen

Manifest-Hashes binden lokale Quellen. deployment-credentials.md vermischt
historische und aktuelle Abschnitte; Qualifikationsgrenzen beachten. Externe
Schluesseldokumentation wird nicht zur Laufzeit geladen. Jede Service-Bindung
gegen tatsaechliche Provider-/Moduleingaben pruefen; Assistant- und
Identitaetstests sind getrennte Nachweise.
