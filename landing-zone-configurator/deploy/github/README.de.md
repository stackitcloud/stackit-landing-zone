# GitHub App

[English](README.md) | [Deutsch](README.de.md)

`app-manifest.json` ist der prüfbare Registrierungsentwurf für lzc-dev. Er registriert
selbst keine App, erzeugt keine Zugangsdaten, installiert keine App und aktiviert keine Anmeldung.
Am 2026-09-30 unter `lweberru` als `lz-configurator-dev-7dbff805` registriert; siehe [Registrierungsstatus](registration-plan.de.md).

GitHub-App-Benutzerautorisierung mit ablaufenden User-Access-Tokens verwenden. Repository-
Operationen müssen das Token des angemeldeten Benutzers verwenden, niemals die GitHub-CLI-
Sitzung des Operators, einen zentralen PAT oder ein Installation-Token. Token-Ablauf aktiviert lassen.

Angeforderte Berechtigungen:

- Metadata read: Repository-Identität und Zugriffsprüfungen.
- Contents write: Vorlagen lesen und eine Konfiguration in den gewählten Fork committen.
- Administration write: vom Fork-Endpunkt benötigt; über den Configurator außer
  dem Erstellen eines Forks keine Repository-Verwaltungsoperation anbieten.

Für API-erzeugte Forks muss eine GitHub App sowohl im Upstream-Konto als auch im Zielkonto
installiert sein. Ohne diese Voraussetzungen die manuelle Fork-Seite von GitHub anbieten
und anschließend den bestehenden Fork verbinden. Berechtigungsumfang nicht stillschweigend
erweitern und keine Operator-Zugangsdaten verwenden. Diese Voraussetzungen mit der registrierten
App prüfen, bevor Ende-zu-Ende-Fork-Unterstützung behauptet wird.

Callback-URL:
`https://lzc-dev-configurator.apps.01.cf.eu01.stackit.cloud/auth/github/callback`

Beim Wechsel der Dev-Route Homepage und Callback-URL der bestehenden GitHub App
vor dem Test der GitHub-Autorisierung entsprechend aktualisieren. Eine Manifeständerung
ändert keine bereits registrierte App. App-Name und Installations-URL bleiben
unverändert.

Nach der Registrierung zu provisionierende Backend-Eingaben: `LZC_GITHUB_CLIENT_ID` und
`LZC_GITHUB_CLIENT_SECRET`. Das Client-Secret muss über geschützte
Runtime-Konfiguration bereitgestellt werden, niemals committet oder in einen Frontend-Build aufgenommen werden. Die Registrierung ist abgeschlossen; die Deployment-Bindung steht aus. Die Anmeldung bleibt deaktiviert, bis Session-Persistenz,
PKCE-/State-Prüfung und sichere Token-Speicherung implementiert und verifiziert sind.

Quellen:
- https://docs.github.com/en/apps/creating-github-apps/setting-up-a-github-app/registering-a-github-app
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app
- https://docs.github.com/en/rest/repos/forks#create-a-fork
