<a id="configurator-user-guide"></a>
# Configurator-Benutzerhandbuch

[English](user-guide.md) | [Deutsch](user-guide.de.md)

<a id="access-and-roles"></a>
## Zugang und Rollen

Melde dich mit STACKIT an. Die Authentifizierung allein gewährt weder Zugriff auf eine
Organisation noch die Berechtigung, Infrastruktur bereitzustellen. Wähle die verifizierte
Arbeitsumgebung deiner Organisation.

- **Platform Engineers** konfigurieren die gemeinsame Plattform und bereiten Projektvorlagen vor.
- **Application Owners** nutzen die Vorlagen und Instanzen, für die sie zugriffsberechtigt sind.
- Mitgliederverwaltung, Zugangsdatenverwendung und Ausführungsfreigaben sind getrennte
  Fähigkeiten. Eine Rolle in einer Umgebung gewährt keine Rechte in einer anderen.

Verbinde GitHub separat, wenn du Repository- und Fork-Funktionen nutzen möchtest. Eine
GitHub-Verbindung ersetzt weder die STACKIT-Anmeldung noch Cloud-Berechtigungen.

<a id="create-and-review-a-configuration"></a>
## Konfiguration erstellen und prüfen

Beginne mit einer Plattformvorlage oder einer bestehenden Konfiguration. Vorlagen sind
Ausgangspunkte, keine Empfehlung, jeden optionalen Dienst einzuschalten.
Prüfe im Editor Grundlagen, Governance, Netzwerk und Plattformdienste.
Prüfe geerbte Werte ebenso wie die Felder, die du änderst.

Der Editor validiert native Accelerator-Eingaben. Eine nicht gesetzte Überschreibung,
ein explizites `null` und ein konfigurierter Wert können unterschiedliche Bedeutungen
haben; das Entfernen einer Überschreibung führt zu nativen Standards zurück. Validierung
beweist weder regionale Produktverfügbarkeit noch Netzwerkerreichbarkeit,
Service-Account-Berechtigungen oder Kapazität.

Speichere Änderungen ausdrücklich. Bei einem Fork ist das Speichern im Repository eine
separate Aktion. Exporte unterstützen den unabhängigen Terraform/OpenTofu-Workflow.

<a id="assistant-proposals"></a>
## Assistant-Vorschläge

Der Assistant erläutert geprüftes Dienstwissen und schlägt unterstützte Editoränderungen
vor. Nenne Anforderungen und konkrete Entscheidungen; bei fehlenden Angaben muss er
nachfragen, statt Netzwerkadressen, Produktverfügbarkeit oder Zugangsdaten zu erfinden.

1. Prüfe die vorgeschlagenen Unterschiede Feld für Feld.
2. Übernimm nur die gewünschten Änderungen in den aktuellen Entwurf.
3. Speichere den Entwurf separat.
4. Prüfe Plan und autorisiere Apply separat, wenn ein Deployment beabsichtigt ist.

Vorschläge speichern oder veröffentlichen keine Vorlagen, vergeben keine Rollen und
stellen keine Infrastruktur bereit. Der Server prüft bei der Übernahme erneut deine
Berechtigung und die Entwurfsrevision. Aktualisiere und prüfe einen neuen Vorschlag, wenn
sich die zugrunde liegende Konfiguration geändert hat. Gib niemals Passwörter,
API-Tokens, VPN-Schlüssel, Kubeconfigs, State oder rohe Plans im Chat ein.
Nutze den separaten autorisierten Zugangsdaten-Workflow.

Bei DNS beschreiben `primary` und `secondary` autoritative Zonenrollen, nicht
öffentliche/private Sichtbarkeit. Die native Secondary-Einrichtung ist unvollständig;
gehe nicht davon aus, dass die Rollenauswahl die Primary-Server-Replikation konfiguriert.

<a id="templates-and-application-instances"></a>
## Vorlagen und Application-Instanzen

Platform Engineers erstellen, prüfen und veröffentlichen Projektvorlagenversionen.
Veröffentlichte Versionen sind unveränderlich. Application Owners wählen eine erlaubte
Version und geben deren freigegebene Parameter an. Ein Vorlagenentwurf ist keine
Application-Instanz, und eine Veröffentlichung deployt keine Instanz. Bestehende
Instanzen werden bei Veröffentlichung einer neuen Version nicht stillschweigend aktualisiert.

### Veröffentlichte Templates an eine bereitgestellte Plattform binden

Als Platform Engineer im selben Arbeitsbereich die gespeicherte Plattformkonfiguration
öffnen. Die Veröffentlichung lädt deren Template-Entwürfe aus dieser geöffneten
Konfiguration; Plattformverträge und State-Backends werden unabhängig davon geladen.
Unter **Plattformanbindung** bei leerer Apply-Auswahl den aktuellen persönlichen
**STACKIT-Organisationsnachweis** erneuern. Ein technischer Service-Account ersetzt ihn
nicht. Nur erfolgreiche Applies auf dem aktuellen, entsperrten State werden angezeigt.
Outputs und Zielordner des ausgewählten Applies prüfen und dessen Plattformvertrag mit
dem technischen Zugangsprofil freigeben.

Unter **Veröffentlichung** Template, freigegebenen Vertrag, passendes Ziel und berechtigte
Application-Owner-Gruppen auswählen. Eine neue unveränderliche Version veröffentlichen;
bestehende Versionen und Bestellungen werden nicht umgebunden. Der eingeladene Owner
wählt diese Version im selben Arbeitsbereich. Public-Projekte unterstützen ein optionales
lokales Netz; Corporate-Projekte verwenden das freigegebene SNA-Ziel. Beide unterstützen
optional Secrets Manager und Observability. Namespace-Dienste des Accelerators richten
sich ausschließlich an **Platform Kubernetes** und sind von aktuellen
Application-Projektbestellungen ausgeschlossen. Namespaces in einem Cluster innerhalb
einer Application Landing Zone gehören zum Workload. Mögliche spätere Building Blocks auf Application Landing Zones
sind eine getrennte, deutlich spätere Produktentscheidung. Die private/SNA-Anbindung
von Platform Kubernetes bleibt in [#37](https://github.com/stackitcloud/stackit-landing-zone/issues/37).
Symbolische Observability-Netz-ACL-Bindungen bleiben
bis zur Qualifikation ihrer tatsächlichen Egress-Quelle gesperrt. Bestehende Versionen
mit älteren Runner-Quellen behalten ihren früheren Ausführungsumfang. Jede Bestellung
verwendet einen eigenen State-Schlüssel; Veröffentlichung und Bestellung geben keinen
Infrastruktur-Apply frei.

<a id="plan-and-apply"></a>
## Plan und Apply

Wähle die richtige Umgebung und das richtige Ziel, binde die autorisierten technischen
Zugangsdaten, erstelle eine Vorbereitung und fordere anschließend einen Plan an. Verfolge
die Job-Ausgabe und prüfe die resultierenden Änderungen, Quell-/Konfigurationsversion
und State-Bindung.

Lege für Firewall-HA vor der Vorbereitung ein Zugangsprofil mit optionalem
OPNsense-Administrator und Passwort für beide Appliances an. Diese Angaben werden
getrennt von der Konfiguration geschützt gespeichert und müssen zu den Appliances
passen; das Speichern ändert deren Passwörter nicht. Bestehende HA-Pläne ohne diese
Zugangsbindung benötigen eine neue Vorbereitung und einen neuen Plan. Einzelne
Firewall-Instanzen benötigen diesen zusätzlichen Zugang nicht. Firewall-Policy/
-Bootstrap und VPN-PSKs bleiben außerhalb dieses Ausführungsvertrags.
Siehe [Deployment-Zugänge](deployment-credentials.de.md#optional-firewall-ha-administration).

Aktive Plattformjobs streamen **OpenTofu-Ausgabe**, sobald sie verfügbar ist, einschließlich
nativen Plan-Fortschritts vor dem abschließenden Diff. **Ausgabe folgen** kann ausgeschaltet
werden, um frühere Zeilen zu prüfen. Klappe die Konsole ein, um die Verbindung zu trennen;
beim erneuten Öffnen erscheint die zuletzt erfasste Ausgabe, ohne den Job neu zu starten.
Der abschließende normale Plan-Text bleibt nach Abschluss und Neuladen verfügbar.
Die Ausgabe ist auf 2 MiB begrenzt; Kürzung und Verbindungsfehler werden angezeigt.
OpenTofu kann während langer Operationen still bleiben: Phase und verstrichene Zeit
sind keine geschätzte Prozentangabe.

Apply verwendet den geprüften gespeicherten Plan und benötigt eine eigene Autorisierung.
Geänderte Eingaben, Quellen, State oder eine abgelaufene Freigabe können eine neue
Vorbereitung erfordern. Starte keine parallelen Infrastrukturschreibzugriffe auf denselben
State. UI-Jobstatus und Diagnose-ID helfen Betreibern bei der Fehleranalyse;
ein erneuter Versuch ersetzt nicht die Behebung einer abgelaufenen oder inkonsistenten Vorbereitung.

Destroy, Upgrades und Drift-Prüfungen sind eigenständige Operationen mit eigener
Autorisierung. Eine erfolgreiche Konfigurationsvalidierung oder ein Plan beweisen nicht,
dass private Endpunkte während Apply erreichbar sind.

Siehe [MVP-Umfang und Grenzen](mvp-scope.de.md) für bewusste Ausschlüsse und
[Architektur](architecture.de.md) für Komponenten und State-Grenzen.
