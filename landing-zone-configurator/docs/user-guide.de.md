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

Öffne **Konfigurationen**, um einen Entwurf anzulegen oder eine gespeicherte Konfiguration über **Bearbeiten** zu ändern. Der Editor gehört zu Konfigurationen; **Deployments** enthält Vorbereitung, Plan, Apply und Verlauf. Speichern allein startet kein Deployment.

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

**Vorschlag verwerfen** schließt nur den aktuellen Vorschlag. Gespräch, ungespeicherter
Entwurf, gespeicherte Konfiguration und ihre Zuordnung bleiben auch nach dem Neuladen
erhalten. Dabei erfolgen weder Modellanfrage noch Speichern oder Cloud-Ausführung.
Eine verworfene Auswahl ist keine offene Rückfrage mehr; fordere bei Bedarf ausdrücklich
einen neuen Vorschlag an. **Gespräch löschen** bleibt eine eigene Aktion. Dies gilt
im Konfigurations- und im Template-Entwurfschat.

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


<a id="retire-archive-and-delete-versions"></a>
### Ablauf für den Platform Owner

Unter **Application Landing Zones** folgen die Reiter von links nach rechts:

1. **Template-Entwürfe:** Plattformkonfiguration auswählen, Templates direkt hier bearbeiten und ausdrücklich speichern. Der Weiter-Button bleibt bei einem nicht gespeicherten oder geänderten Entwurf deaktiviert.
2. **Plattformanbindung:** angewendeten Plattformvertrag prüfen und freigeben, danach seine Ausführungsbindung und das State-Backend für Applications einrichten. Fehlt ein passender erfolgreicher Plattform-Apply, müssen zuerst Plattform-Deployment und Identitätsnachweise abgeschlossen werden.
3. **Veröffentlichung:** Template, freigegebenen Vertrag, passendes Ziel, Bestellerzugriff und Bereitstellungsrichtlinie auswählen und eine Version ausdrücklich veröffentlichen. Eine fehlende Ausführungsbindung wird hier mit Verweis auf den vorherigen Schritt angezeigt.
4. **Katalog:** veröffentlichte Version und Sichtbarkeit prüfen. Bestellungen und Archiv bleiben separate Reiter nach dem Katalog.

Konfigurationen und Application Landing Zones verwenden denselben kontrollierten Entwurf. Ein Schrittwechsel ist ausschließlich Navigation; Speichern, Vertragsfreigabe, Ausführungseinrichtung, Veröffentlichung, Plan und Apply bleiben getrennte ausdrückliche Aktionen. Application Owner starten direkt im Katalog und sehen die Plattform-Verwaltungsschritte nicht. Das Bestellkontingent gilt für den gesamten Arbeitsbereich und steht über diesen Reitern.

### Ausgerollte Application-Projektrechte wählen

Dies sind **STACKIT-IAM-Berechtigungen, die der Apply anlegt**, keine IDP-Rollen.
Der IDP verifiziert die Anmeldeidentität; Platform Engineer/Application Owner sind
Mitgliedschaftsrollen des Configurators. Die privilegierte Ausführungsidentität
ist von beiden getrennt.

Neue Public-/Corporate-Entwürfe empfehlen **Granular: Workload-Betrieb**. Lege einen
zentralen initialen Projekt-Owner als Benutzer oder Service Account fest, der sich
vom Besteller unterscheidet. Der Plattform-Service-Account führt das Deployment aus und kann als zentraler Projekt-Owner gewählt werden; alternativ der angemeldete Nutzer. Der zukünftige Besteller ist eine einzelne Person, kein Team. Der Application-Service-Account wird beim Deployment im neuen Projekt angelegt. Neue Profile geben Besteller und Application-Service-Account dieselbe initiale geprüfte Rechteauswahl; beide lassen sich unabhängig anpassen.

Der Editor gruppiert die Rechte nach virtuellen Maschinen; Volumes, Snapshots und Backups; Netzwerk und Security Groups; Images, SSH-Schlüsseln und Projektinformationen; Object Storage; Observability; und Secrets Manager. Jede aufklappbare Gruppe zeigt die Anzahl ausgewählter und verfügbarer Rechte. Die Suche berücksichtigt Permission-Kennungen und Gruppennamen. Auswählen/Abwählen betrifft nur die aktuell angezeigten Rechte dieser Gruppe; andere Gruppen und die andere Identität bleiben erhalten. Die Gruppen gliedern den Editor, legen keine Cloud-Benutzergruppen an und verändern bestehende Auswahlen nicht. Die bestellende Person benötigt weiterhin die
STACKIT-Voraussetzungen für Organisationszugriff (üblicherweise
`organization.viewer`). Eine Configurator-Einladung vergibt diese Cloud-Rolle
nicht; siehe [STACKIT-Zugriffskontrolle](https://docs.stackit.cloud/platform/resource-manager/basics/access-control/). Die geprüfte Auswahl umfasst VM-, Volume-, Schlüssel-, Security-Group-, Object-Storage-,
Observability- und Secrets-Manager-Berechtigungen. IAM,
Projektlöschung, zentrales Routing, Service-Account-Verwaltung und direkte
Floating-IP-Anbindung sind ausgeschlossen. Das ausdrücklich angeforderte VM-Preset bleibt enger. Das belegt noch keine reale
IAM-Abnahme aller Workload-Abläufe.
Der Editor nutzt nach Möglichkeit den Live-Permission-Katalog, sonst den
geprüften statischen Stand. Beides belegt nicht die effektiven Benutzerrechte.

**Volle Projekt-Owner-Rechte** bleiben eine ausdrückliche Kundenwahl für Besteller
und Application-Service-Account. Diese Identitäten können IAM und Projektvorgaben verwalten;
zentrale Audit-/Routing-Regeln sind ihnen gegenüber nicht unveränderlich.
Geerbte, gruppenbezogene und direkte Rechte sind additiv und separat zu prüfen.

Der Platform Engineer schreibt das vollständige Profil bei Veröffentlichung fest.
Die Bestellseite zeigt den Modus; Besteller können initialen Owner und Rollen nicht
überschreiben. Der Server prüft das konkrete Profil erneut vor Job-Erstellung.
Eine Anmeldung nach Bestellung ergänzt nur die verifizierte Besteller-Zuweisung,
niemals den zentralen Owner oder die gewählten Rechte. Bestehende Entwürfe ohne
Profil behalten ihr bisheriges Verhalten; veröffentlichte Versionen, Instanzen
und State-Zuordnungen bleiben unverändert. Beim Umstellen eines alten Entwurfs
müssen widersprüchliche eigene Rollen, Rollenzuweisungen und die Rollen-Kontextbindung
ausdrücklich entfernt werden. Danach neues Profil konfigurieren und neue Version
veröffentlichen. Änderungen an bereits ausgerolltem IAM benötigen eine separat
geprüfte Migration. Eine Veröffentlichung allein ändert keine bestehenden Ressourcen.

### Versionen stilllegen, archivieren und löschen

Der Katalog zeigt aktive Versionen. Platform Engineers können eine Version nach
Bestätigung stilllegen; sie wechselt ins **Archiv** und nimmt keine neuen
Bestellungen mehr an. Bestehende Bestellungen und deren State-Zuordnungen bleiben
erhalten. Application Owners sehen aktive, für ihre Gruppen freigegebene Versionen.

Im **Archiv** kann eine unbenutzte Version nach gesonderter Bestätigung gelöscht
werden. Das ist nur erlaubt, wenn diese Version noch nie bestellt wurde; auch
gelöschte oder archivierte Bestellungen verhindern das Löschen. Die Version
verschwindet aus der Oberfläche. Unveränderliche Veröffentlichungs- und
Löschnachweise sowie Versionsnummern bleiben erhalten. Eine erneute Veröffentlichung
erstellt eine neue Version und verwendet gelöschte Versionsnummern nicht erneut.

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

<a id="corporate-ipv4-network-size"></a>

### IPv4-Netzgröße für Corporate-Projekte

**Netzgröße (IPv4-Präfixlänge)** für **Automatisch** leer lassen. Corporate-Netze
übernehmen das Standardpräfix ihrer angebundenen regionalen SNA: Das native Modul
liest es im Plan/Apply und übergibt es bei unverändertem DNS explizit an den
STACKIT-Provider. Bei Public übernimmt weiterhin der Provider die automatische
Größenwahl. Ein explizites Präfix überschreibt den Default; Kapazität und Plan vor
Apply prüfen. Automatisch garantiert keine freien Adressen.

Die Korrektur benötigt eine neue Template-Version mit korrigierter Runner-Revision.
Bestehende Versionen und Bestellungen behalten ihre unveränderliche Quelle und
Einstellungen; aus der korrigierten Version eine neue Bestellung erstellen.
Bestehender State wird weder zurückgesetzt noch verschoben. Ein fehlgeschlagener
Plan legt keine Cloud-Ressourcen an. Lesbare Providerdiagnosen enthalten ihre
Erklärung, ohne strukturierte Snippets oder Ausdrücke weiterzugeben.
Der Assistant erklärt die Vererbung und schlägt für angefordertes Automatisch
null oder den explizit gewünschten Zahlenwert vor, ohne Veröffentlichung/Ausführung.

<a id="plan-and-apply"></a>

## Plan und Apply

Die Bestelldetails zeigen **Ausführungslogs** in den Schritten **Plan**, **Drift**
und **Destroy** sowie beim Apply. Der Benutzer, der den Job angefordert hat, kann
bereinigten Fortschritt und gespeicherte Fehlerausgaben lesen und aktualisieren,
ohne eine neue Ausführung zu starten. Ein Code wie `plan_failed` bezeichnet die
fehlgeschlagene Phase; zur Ursachenklärung dient der OpenTofu-Fehler in den Logs.
Die Logs erteilen keine Plan-/Apply-Berechtigung und werden keinem anderen
Auftraggeber offengelegt.

Bleibt ein Application-Plan nach dem Stoppen seines Runners stehen, behalte
dieselbe Bestellung. Wähle unter **Plan** die Aktion **Unterbrochenen Plan prüfen
und abschließen**. Der Server prüft die exakte Runner-App und unveränderliche
Quelle, den beendeten Prozess beziehungsweise Task sowie den zur Bestellung
gehörenden State und dessen Sperre. Erst danach wird dieser Plan als
fehlgeschlagen erfasst und **Cloud-Plan starten** wieder verfügbar. Eine erneute
Freigabe des Platform Owners ist dafür nicht erforderlich. Fehlender State ist
nur vor dem ersten Apply-Versuch dieser Bestellung zulässig; vorhandener State
muss zur Bestellung passen. Aktive oder nicht eindeutig prüfbare Runner,
geänderter oder gesperrter State, gespeicherte Plan-Artefakte und Recovery-State
bleiben blockiert. Diese Aktion stoppt keinen Runner, schreibt keinen State,
entfernt keine Sperre und startet oder genehmigt keinen Plan oder Apply. Prüfe
den separat gestarteten neuen Plan vor Apply. Dieser Weg gilt ausschließlich für
Plan-Jobs.

Bleibt ein Application-Apply ohne Abschlussmeldung stehen, wähle in derselben
Bestellung **Apply → Unterbrochenen Apply prüfen**. Der Server prüft den exakten
Runner und seine unveränderliche Quelle unabhängig. Ein nachweislich beendeter
Runner erlaubt, den Apply mit unveränderlichem Nachweis als **ungeklärt** zu
erfassen. Die Aktion prüft oder verändert weder Infrastruktur, State noch eine
Sperre. Sie genehmigt keinen neuen Plan oder Apply. Ein beendeter Runner beweist
nicht, dass alle Cloud-Änderungen gespeichert wurden. Deshalb bleiben ein
Operator-Abgleich der Cloud-Ressourcen, des exakten States, eines separaten
Recovery-States und einer möglichen verwaisten Sperre erforderlich. Aktive oder
nicht eindeutig prüfbare Runner bleiben gesperrt. Behalte dieselbe Bestellung
und führe ihren alten gespeicherten Plan nicht erneut aus.

Behalte nach einem regulär gemeldeten Application-Apply-Fehler (`apply_failed`)
die bestehende Bestellung. Wähle in deren Schritt **Apply** die Aktion
**Application-Checkpoint prüfen**. Der Server prüft den exakt zur Bestellung
gehörenden S3-State, eine mögliche Sperre, separate Recovery-Nachweise und die
Abschlussmeldung des Runners. Bestätige, dass du dieselbe Bestellung neu planen
möchtest, wechsle zu **Plan** und starte einen neuen Cloud-Plan. Das kann der
Application Owner ohne erneute Freigabe des Platform Owners und ohne Warten auf
den Ablauf der alten Freigabe durchführen. Bestehende Zugangsdaten sowie
ursprüngliche Quelle, Bestellung und State-Bindung bleiben erhalten. Diese
Aktion startet keinen Apply; der alte gespeicherte Plan kann nicht erneut
angewendet werden.

Ein neuer Plan aktualisiert die Cloud-Ressourcen; prüfe seine vollständigen
Änderungen vor einem weiteren Apply. Nach einem Service-Timeout kann eine
asynchrone Cloud-Operation ungeklärt sein. Ein lesbarer Checkpoint beweist daher
allein keine vollständige Übereinstimmung von Cloud und State. Fehlende
Apply-Abschlussmeldungen, State-Schreibfehler, separate Recovery-States, Sperren oder
abweichende Checkpoints bleiben blockiert. Bei dafür geeigneten unklaren
Abschlüssen kann der ursprünglich freigebende Platform Owner nach Ablauf der
alten Ausführungsberechtigungen einen externen Runner-/Cloud-Abgleich gesondert
bestätigen. Das ist keine automatische Cloud-Prüfung oder State-Reparatur.

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


<a id="complete-a-missing-order-identity-after-login"></a>
## Fehlende Bestelleridentität nach dem Login ergänzen

Eine Bestellung kann bereits angelegt sein, bevor ein gültiger persönlicher
STACKIT-Anmeldenachweis vorliegt. Nach der Anmeldung kann die bestellende Person
die Plan-Eingaben derselben Bestellung prüfen. Fehlte die verifizierte
Bestellerbindung und hat die Bestellung noch keine Freigabe und keinen Job,
ergänzt der Server diese Bindung einmalig und leitet ausschließlich die im Template
vorgesehenen Besteller-Kontextrollen ab. Ursprüngliche Einstellungen und Ergänzung
bleiben als unveränderlicher Nachweis erhalten. Bestell-ID, Template/Version,
Parameter und State-Schlüssel bleiben gleich; dabei läuft kein Cloud-Plan oder
Apply. Eine doppelte Bestellung ist nicht erforderlich.

Eine andere E-Mail bei einer bereits gebundenen Bestellung bleibt gesperrt.
Mit der ursprünglich verwendeten Identität anmelden. Bestellungen mit Freigaben
oder Ausführungsnachweisen werden nicht automatisch umgebunden; der Platform Owner
soll die bestehende Bindung und die Nachweise prüfen. State und Bestellung werden
dabei weder stillschweigend ersetzt noch zurückgesetzt.

### Geführte Recovery nach unterbrochenem Application-Apply

Behalte **dieselbe Bestellung**. Wähle in deren Reiter **Apply** die Aktion
**Recovery anfordern**. Die Anfrage enthält keine Zugangsdaten oder State-Dateien.
Der ursprüngliche Application Owner kann den vollständigen Ablauf für seine
eigene Bestellung ausführen, solange die Plattform-Ausführungsdelegation gültig
ist. Auch der ursprünglich freigebende Platform Owner kann ihn ausführen.
Melde dich bei Bedarf erneut an und wähle **Cloud-Abgleich starten**. Alte
Ausführungsfreigaben müssen abgelaufen, der ursprüngliche Runner unabhängig
beendet und der genaue Checkpoint lesbar sein. Ein separater Recovery-State
oder nicht eindeutig prüfbarer Runner sperrt diesen Pfad.

Der Dienst liest das gebundene Projekt, Ressourceninventare und Schlüsselmetadaten.
Ein eigener Runner importiert eindeutig zugeordnete bestehende Ressourcen in eine
private **lokale Kopie** des ursprünglichen States und erstellt einen diagnostischen
Plan. Der Vorschlag zeigt die genauen Übernahmen, State-Prüfsummen/Serials und
verbleibenden Neuanlagen. Bestehende Ressourceninstanzen, private Providerfelder
und Lineage müssen erhalten bleiben; Änderungen, Ersetzungen oder Löschungen
in dieser Vorschau sperren die Reparatur. Die Vorschau ist kein freigegebener
Infrastrukturplan.

Nach Prüfung bestätigt der Application Owner ausdrücklich
**Geprüfte State-Reparatur ausführen**, einschließlich des Lösens der geprüften
verwaisten Sperre und eines neuen Plans. Ein separater, einmaliger Runner prüft
den Vorschlag erneut, löst ausschließlich diese Sperre und veröffentlicht die
Kopie über natives OpenTofu mit Sperre sowie Serial-/Lineage-Prüfung. Er führt
keinen Infrastruktur-Apply aus. Erst wenn der Dienst anschließend den entfernten
State und die freie Sperre unabhängig bestätigt hat, ist ein **neuer Cloud-Plan
derselben Bestellung** möglich. Prüfe diesen vor Apply. Der alte gespeicherte
Plan bleibt unbrauchbar.

Bei unterbrochenem Start, Schreiben oder Rückmelden wählt der ursprüngliche Application Owner oder
Platform Owner **Unterbrochene Recovery prüfen**. Die Aktion prüft das Ende des
Tasks und das tatsächliche entfernte Ergebnis; sie wiederholt keinen nativen
Schreibvorgang. Ein nicht nachgewiesener Ausgang bleibt gesperrt. Abgelaufene
rein lesende Vorschläge können durch einen neuen Abgleich ersetzt werden.

Der Katalog deckt alle verwalteten Ressourcentypen des gepinnten Application-
Einstiegspunkts ab: Public-/Corporate-Netze und Routing, Projekte, eigene Rollen
und Zuweisungen, Automation-Service-Accounts, Buckets und Credential-Gruppen,
Secrets Manager und Observability. Lokale Vertrags-/Rotationsressourcen behandelt
der normale native Plan. DNS-Zonen und Namespaces auf Plattform-Kubernetes sind
über diesen Application-Einstiegspunkt nicht bestellbar.

Existiert ein Automation-Schlüssel oder S3-Zugang, dessen Geheimnis nie gespeichert
wurde, zeigt der Vorschlag dessen genaue Identität. Eine separate Checkbox gibt
ausdrücklich den Widerruf ausschließlich dieser verlorenen Zugänge vor der
State-Veröffentlichung frei. Ein neuer regulärer Plan/Apply erstellt Ersatz;
bereits im State gespeicherte Zugänge bleiben erhalten. Beim Abgleich wird kein
Zugang widerrufen. Ein verlorenes Lösch-Ergebnis wird geprüft und nicht blind
wiederholt. Hat die State-Veröffentlichung noch nicht begonnen, kann eine beendete
Recovery nach Prüfung des unveränderten States/Locks und der erlaubten
Schlüsselentfernungen abgeschlossen werden; ein neuer Abgleich nutzt das
aktuelle Inventar.

Die Selbstbedienung gibt keinen Zugriff auf Plattform-Zugangsprofile, fremde
Bestellungen oder manuelle Operator-Bestätigungen. Abgelaufene/widerrufene
Delegationen, geänderte Bindungen, mehrdeutige Ressourcen, unvollständige
Inventare und fremde Sperren bleiben Blocker.
Siehe [Recovery-Ausführungsvertrag](plan-execution.de.md#guided-application-state-recovery).

## Application-Bestellkontingente

Der Platform Owner kann auf der Seite Application Landing Zones das
**Bestellkontingent** verwalten. Es begrenzt dauerhafte Bestellreservierungen im
gesamten Arbeitsbereich, über alle Besteller und veröffentlichten Template-Versionen.
Es ist kein STACKIT-Projekt- oder Dienstkontingent, kein Kostenlimit und keine
Sperre für Ressourcen, die direkt im Portal oder per API erstellt werden.
Insbesondere bleiben vom Kunden gewählte Cloud-Owner-Rechte außerhalb des
Konfigurators wirksam.

Der Standard ist **unbegrenzt** und erhält das bisherige Verhalten. Eine ganze
Zahl von 0 bis 1000000 muss ausdrücklich bestätigt werden; 0 sperrt neue
Bestellungen. Eine niedrigere Grenze widerruft weder bestehende Bestellungen
noch ihren Plan-/Apply-/Recovery-Zugriff oder ihren State. Das Wiederholen
derselben unveränderlichen Bestellanfrage belegt keinen weiteren Platz.
Widersprüchliche oder gleichzeitige Einstellungsänderungen erfordern erneutes
Laden und Prüfen.

Ausstehende Freigaben und fehlgeschlagene Bestellungen reservieren ebenfalls
Kapazität. Das Löschen einer Bestellung, für die es noch keinen Apply gab, gibt
ihren Platz frei. Das Archivieren eines fehlgeschlagenen oder teilweisen Applies
bewirkt dies **nicht**, weil Ressourcen vorhanden sein können. Nach einem
erfolgreichen gespeicherten Destroy-Plan mit Apply schließt die Archivierung die
Bestellung und gibt ihren Platz frei. Eine zerstörte, aber noch offene Bestellung
behält ihre Reservierung, weil sie erneut ausgeführt werden kann. Recovery-Nachweise,
historische Bestellungen und State-Zuordnungen bleiben erhalten.

Application Owner sehen nur die aggregierte Reservierungszahl und Grenze,
keine Bestelldetails anderer Benutzer. Nur ein berechtigter Platform Owner kann
das Kontingent ändern. PostgreSQL serialisiert und erzwingt die Zulassung auch
bei direkten Runtime-Inserts; Browser-Zählungen sind nicht maßgeblich. Dies
belegt noch keine Behandlung von Cloud-Kontingenten beim Provider, keine
arbeitsbereichsweite Runner-Nebenläufigkeitsgrenze und keine echte
Cloud-Retry-Abnahme ohne doppelte Projekte (#93).

### Bestehende Vorlage auf ein Rechteprofil umstellen

Öffne den bestehenden Template-Entwurf und wähle **Neues Rechteprofil
konfigurieren**. Der erste Schritt zeigt nur die genauen eigenen Rollen,
Rollenzuweisungen, die Automation-Rolle, einen bisherigen initialen Owner und die
Rollen-Kontext-/Parameterregel, die ersetzt würden. Abbrechen lässt den Entwurf
unverändert. Prüfe und bestätige das Ersetzen ausdrücklich und wähle dann
**Entwurf auf neues Rechteprofil umstellen**. Dies übernimmt eine atomare
Entwurfsänderung; andere Template-Einstellungen, Parameterregeln und
Namespace-Metadaten bleiben erhalten. Eine Bearbeitung der Vorlage verwirft die
bisherige Bestätigung. Der zentrale initiale Projekt-Owner ist zunächst leer.

Wähle dafür den aktuell verifizierten STACKIT-Benutzer oder ein zugängliches
gespeichertes Service-Account-Profil aus, oder trage eine E-Mail manuell ein.
Für die Organisation der Konfiguration erfolgreich geprüfte Profile sind
entsprechend markiert; ungeprüfte Profile werden als ungeprüft angezeigt. Profile aus einer gespeicherten Plattform-Vorbereitung für genau diese Konfiguration und Organisation werden gesondert angeboten, sofern Profil- und Schlüsselkennung zum zugänglichen Profil passen. Ist eine spätere Prüfung fehlgeschlagen oder betrifft eine andere Organisation, bleibt die bekannte Identität mit Warnhinweis auswählbar. Andere Profile mit fehlgeschlagenen oder organisationsfremden Prüfungen werden nicht angeboten. Gelesen werden nur Identitäts-, Profil- und Vorbereitungsmetadaten, niemals Schlüssel; es wird keine Zugangsprüfung gestartet. Eine gespeicherte Vorbereitung belegt weder ein erfolgreiches Deployment noch aktuell gültige Ausführungsrechte. Die Auswahl kopiert die angezeigte E-Mail in den Entwurf
und zeigt den Kontextwert schreibgeschützt; zur Bearbeitung wähle die manuelle
Eingabe. Beim Eintreffen der Optionen und bei Änderungen von Sitzung,
Arbeitsbereich, Organisation oder Profilen bleibt die gespeicherte E-Mail
bestehen und wird niemals still auf eine andere Identität umgebunden.

Für granulare Rechte muss sich der zentrale initiale Owner vom späteren
Besteller unterscheiden. Speichere die Konfiguration und veröffentliche für
künftige Bestellungen eine **neue Template-Version**. Allein das Ändern des
Profils erfordert keinen neuen Plattform-Apply, wenn der vorhandene
Plattformvertrag und das Ziel nutzbar sind. Bestehende veröffentlichte Versionen,
Bestellungen, Projektrechte und State bleiben unverändert; bestehende
Application-Instanzen werden damit nicht aktualisiert. Eine echte Ausführung
braucht weiterhin einen gesondert geprüften Plan und eine ausdrückliche
Apply-Freigabe.
