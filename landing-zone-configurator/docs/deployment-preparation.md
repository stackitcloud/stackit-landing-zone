# Zugang prüfen und Deployment vorbereiten

Stand: 2026-09-30. Drei zusammenhängende Schritte: persönliche Anmeldung prüfen,
Zielorganisation lesend prüfen und eine unveränderliche Vorbereitung speichern.

## Prüfliste für die Benutzerabnahme

- [ ] **Deployment-Zugänge:** Beim gespeicherten Profil die UUID der Zielorganisation
  eintragen und **Zugang prüfen** wählen. Ergebnis und Prüfzeit bleiben nach Reload
  sichtbar. Die Datei muss dafür nicht erneut hochgeladen werden.
- [ ] Bei fehlender Berechtigung erscheint ein klarer Organisationszugriffsfehler;
  ein abgelehnter/abgelaufener Schlüssel erhält einen anderen Fehler. Ein Fehler
  ersetzt einen früheren erfolgreichen Profil-Prüfstatus.
- [ ] In **GitHub-Forks** den Fork auswählen und bei einer gespeicherten Konfiguration
  **Deployment vorbereiten** wählen. Name, Git-Version und Zielorganisation prüfen.
  Ein ungespeicherter lokaler Entwurf wird nicht verwendet.
- [ ] Persönlichen Zugang auswählen und **Zugang prüfen und Vorbereitung speichern**
  wählen. Nach erfolgreichem frischem Organisationstest erscheint die Vorbereitung
  unter **Deployments**, auch nach Reload.
- [ ] Unter **Versionsnachweise** Konfigurations-Commit, Accelerator-Referenz und
  tfvars-Prüfsumme ansehen. Ein späterer Fork-Commit ändert diesen Stand nicht.
- [ ] Eine Test-Vorbereitung entfernen. Das löscht weder Konfiguration noch Ressourcen.
  Optional einen ausschließlich zum Testen angelegten Zugang löschen: vorhandene
  Vorbereitungen müssen danach „Zugang gelöscht“ anzeigen.

## Was der Zugangstest nachweist

Das Backend liest nur das eigene, vollständig gespeicherte Credential-Profil unter
RLS und Zeilensperre. Es verlangt die Rolle `admin` oder `deployer`, liest das Secret
und vergleicht Mandant, Eigentümer, Profil, Typ, Key-ID und Service-Account. Die
Secret-Version wird mitgeführt. Es gibt weiterhin keinen Schlüssel-Leseendpunkt für
Browser oder Benutzer-API.

Ein RS512-signierter JWT mit `kid`, `iss`, `sub`, `aud`, zufälligem `jti` und maximal
zehn Minuten Gültigkeit wird an einen explizit zugelassenen STACKIT-Token-Endpunkt
gesendet. Feste HTTPS-Ziele, keine Redirects, jeweils 15 Sekunden Timeout. Access Token
und Assertion bleiben im Backend-Speicher; sie werden nicht in DB, Logs, Browser,
Git oder Manifest geschrieben. Es erfolgt kein Refresh-/Token-Cache.

Danach liest das Backend ausschließlich
`GET https://resource-manager.api.stackit.cloud/v2/organizations/<uuid>`.
Die Antwort muss die angefragte Organisations-ID und den Status `ACTIVE` enthalten.
Ein erfolgreicher Test bestätigt Anmeldung und `resource-manager.organization.get`;
**keine** Schreibrechte, Projekt-Erstellung, Dienstaktivierung, Plan- oder Apply-Rechte.
Auch `stored` oder ein älteres positives Prüfergebnis sind keine Deployment-Freigabe.

Quellen: [STACKIT Token-Abruf](https://docs.stackit.cloud/platform/access-and-identity/service-accounts/how-tos/get-access-token/),
[offizieller Resource-Manager-Client](https://github.com/stackitcloud/stackit-sdk-go/blob/main/services/resourcemanager/api_default.go),
[Organisationsantwort](https://github.com/stackitcloud/stackit-sdk-go/blob/main/services/resourcemanager/model_organization_response.go).

Lesender Protokolltest mit dem vorhandenen **Betreiber-/Projekt-Service-Account**:
Token-Abruf HTTP 200, Lesen der konfigurierten Organisation HTTP 403. Dafür werden
Rechte auf der Zielorganisation benötigt; Projektzugriff allein reicht für diese
Prüfung nicht. Keine automatische Rechteausweitung und kein Import dieses Schlüssels
als Kundenprofil. Dieser Test ist kein Nachweis für die Rechte eines anderen, vom
Benutzer hochgeladenen Profils.

## Unveränderliche Vorbereitung

1. Berechtigung und Eigentum am Credential-Profil serverseitig prüfen.
2. GitHub-Benutzertoken aus der Session verwenden; Repository-ID, Herkunft und
   aktuellen Fork-Zugriff erneut prüfen. Kein Betreiber- oder Installation-Token.
3. Den gewählten Head von `lzc/configurations` bestätigen und Git-Tree sowie
   `landing-zone.json` über unveränderliche Objekt-IDs lesen. Andere Revisionen
   werden nicht still übernommen.
4. Fachmodell und Template-Hash validieren. Vorhandene `landing-zone.tfvars` muss
   ein regulärer Blob sein und exakt dem deterministischen Export entsprechen.
   Fehlende oder manuell veränderte Exporte blockieren die Vorbereitung.
5. Zielorganisation ausschließlich aus dem validierten Git-Dokument übernehmen;
   die API akzeptiert kein separates Ziel und keinen frei gewählten Accelerator-Code.
6. Den persönlichen STACKIT-Zugang erneut prüfen. Nur bei Erfolg Manifest speichern.
   Nach den externen Anfragen Profilbestand und Rechte nochmals überprüfen.

`lzc.deployment_preparations` enthält Eigentümer/Mandant und einen unveränderlichen
Snapshot aus Fachkonfiguration, Repository/Branch/Commit, SHA-256 der tfvars,
Export-/Schema-Version, festem Accelerator-Referenzcommit, Credential-ID/Secret-Version,
Key-ID, Organisation und Prüfergebnis. Maximal 100 Vorbereitungen pro Eigentümer und
Mandant. Keine Update-Berechtigung für die Runtime; Entfernen ist möglich. Forced RLS
verhindert Zugriff fremder Benutzer auch im selben Mandanten und die Verknüpfung
fremder Credential-Profile.

Accelerator-Referenz ist explizit `a256f6896d11134fdc351786f1be5eba4e56b2e2` aus
`stackitcloud/stackit-landing-zone`. Dies friert den Codebezug ein; es ist noch keine
Cloud-/Plan-Qualifizierung dieses Stands. Der Benutzer-Fork liefert nur Konfigurationsdaten.
Ein späterer Runner benötigt einen weitergehenden freigegebenen Laufvertrag.

Wird ein Credential gelöscht, setzt der Fremdschlüssel die aktive Profilbindung
auf `NULL`; der historische Manifestnachweis bleibt erhalten. Die UI zeigt die
Vorbereitung als nicht verwendbar. Rechte können sich ebenfalls ändern: Vor jedem
künftigen Plan/Apply müssen Zugriff, Secret-Version und Ziel erneut geprüft werden.

## Bewusste Grenze und nächste Schritte

Diese Vorbereitung ist **kein OpenTofu-Plan**, kein genehmigtes Deployment und kein
fertiger Runner-Auftrag. Es werden keine Kundenressourcen angelegt. Offene Aufgaben:

- [ ] Kundenbezogenen Remote State und Backend-Zugänge konfigurieren.
- [ ] Isolierte Runner, Queue, Abbruch und Wiederanlauf ohne doppelten Apply.
- [ ] Vollständiger Laufvertrag mit Engine/Provider-Lockfile und Artefakt-Digests.
- [ ] `init`, `validate`, `plan`, redigierte Plan-Darstellung und exakte Apply-Freigabe.
- [ ] Mehrmandanten-/Quoten-, Audit-, Ablauf- und Rotationserweiterungen.

## Technische Abnahme

- [x] JWT-Signatur, Claims, neue `jti`, feste Endpunkte und negative Cloud-Antworten getestet.
- [x] Secret-Identität und Version geprüft, keine Roh-Secrets in Ergebnis oder Manifest.
- [x] Veralteter Git-Head sowie fehlende/manuell geänderte tfvars werden abgewiesen.
- [x] Echtes PostgreSQL: RLS, Rollen, unveränderliche Vorbereitung und Löschinvalidierung.
- [x] Browserablauf auf Desktop und Mobil abgenommen; mobile Darstellung visuell geprüft.
- [ ] Feature-Branch-Release inklusive Migration und CF-Verbindungstests.
- [ ] Persönlicher Erfolgsfall mit einem auf der Zielorganisation berechtigten Profil.
