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

## Lokaler Platform-Upgrade-Plan

Ergänzung vom 2026-10-06: Die gewöhnliche Vorbereitung bleibt auf `a256f68`
gebunden. Für den Contract-Output kann eine zusätzliche Vorbereitung ausdrücklich
den fest qualifizierten Commit `c4b43c36af198985980b17626c48d357795e3fbd` wählen.
Das ist derzeit ein lokaler, opt-in Laufpfad, keine allgemeine Source-Auswahl und
keine Produktionsfreigabe.

Das neue Paket wird mit `LZC_LOCAL_RUNNER_PACKAGE=true`,
`LZC_PACKAGE_PLATFORM_UPGRADE_ROOT=true` und einem neuen
`LZC_RUNNER_PACKAGE_DIR` erstellt. Bestehende Verzeichnisse werden nicht überschrieben.
Die Source-Metadatei `platform-source.json` wird strikt validiert und gehört zum
Paket-Fingerprint. Der Runner akzeptiert nur den dazu passenden Quellcommit;
gespeicherte Plans eines anderen Pakets bleiben ungültig für diesen Runner.

`POST /api/v1/preparations` verwendet die vorhandene gespeicherte Konfiguration,
Revision und das eigene Credential-Profil. Die zusätzliche Auswahl lautet:

```json
{
  "platformUpgrade": {
    "confirm": true,
    "acceleratorCommit": "c4b43c36af198985980b17626c48d357795e3fbd"
  }
}
```

Der Server verlangt ein passendes qualifiziertes Paket sowie einen bestehenden,
entsperrten S3-State. Fremde Revisionen, zusätzliche Namespace-/Tenant-Felder und
abweichende Backend-Bindungen werden abgelehnt. Die neue Vorbereitung verwendet
denselben State und dieselbe Konfiguration. Alte Manifeste, Artefakte, Revisionen
und Freigaben werden nicht umgeschrieben.

Der Contract-Namensraum stammt aus der authentifizierten Serversitzung und ist Teil
des exakten neuen tfvars-Hashes. Die API lockert ihre Tenant-/Organisationsprüfung
nicht. Im unabhängigen Accelerator bleibt der optionale CLI-Namensraum erhalten;
es entsteht keine Configurator-Laufzeitabhängigkeit.

Erst ein neuer vollständiger, gespeicherter echter Plan zeigt die tatsächlichen
Ressourcen-/Output-Änderungen. Auch ein reiner Output-Plan benötigt eine ausdrückliche
Freigabe seines konkreten SHA-256. Abgelaufene Plans werden weder verlängert noch
angewendet; ein neuer Plan braucht eine eigene Freigabe. Ein Apply wird nicht
automatisch wiederholt.

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
- [x] Feature-Branch-Release inklusive Migration und CF-Verbindungstests.
- [x] Persönlicher Erfolgsfall mit einem auf der Zielorganisation berechtigten Profil (Benutzer bestätigt, 2026-09-30).

### Release-Abnahme

Code-Commit `366cc3c`, [Validierung 36716027326](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36716027326)
und [Release 36716027274](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36716027274)
erfolgreich. 47 Anwendungstests, zehn PostgreSQL-Tests und 16 Browserfälle grün.
Migration und CF-Verbindungstests zu PostgreSQL und Secrets Manager erfolgreich.
Live geprüft: `/deployments`, Reload, mobile Breite, keine Browserfehler sowie 401
für anonyme Vorbereitungsliste, Anlegen, Entfernen und Credential-Prüfung. Dabei keine
persönlichen Credentials verwendet und keine Vorbereitung angelegt. Bekannte lokale
Credential-Werte wurden in den Release-Logs nicht gefunden. Der Benutzer hat anschließend die vollständige Vorbereitung und den Zugangstest mit
einer passenden Kombination aus Organisation und persönlichem Service Account bestätigt.
Die zuvor beobachtete Ablehnung war auf eine nicht passende Kombination zurückzuführen.
Die übrigen einzelnen Prüfpunkte gelten dadurch nicht automatisch als abgenommen.

## Freigabegrenze für die nächste Phase

Benutzerentscheidung vom 2026-09-30: Kunden-Plan darf getestet werden. Jeder
Kunden-Apply benötigt eine neue ausdrückliche Freigabe des Benutzers. Die bestehende
Freigabe für Configurator-Infrastruktur gilt nicht für Kundenressourcen. Kein Destroy;
der Benutzer weist auf die derzeit fehlende Möglichkeit zum Folder-Destroy hin.
Weiterarbeit und offene Voraussetzungen: [Plan-Ausführung](plan-execution.md).
