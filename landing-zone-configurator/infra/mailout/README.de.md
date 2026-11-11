# Configurator-MailOut-Betrieb

[English](README.md) | [Deutsch](README.de.md)

Dieses Verzeichnis richtet die Absender-Anbindung des Betreibers ein, kein
Kunden-Landing-Zone-Feature. Da der gepinnte STACKIT-Terraform-Provider keine
MailOut-Ressourcen bereitstellt, verwendet es die offiziellen MailOut-v1beta1-
und DNS-v1-APIs. `environments/lzc-dev.json` beschreibt den geprüften Sollzustand.
Der Reconciler erzeugt nur fehlende dedizierte Ressourcen und prüft bestehende.
Er überschreibt keine DNS-Richtlinien und rotiert oder löscht keine Zugangsdaten
automatisch. Produktion ist für diesen ersten Dev-Rollout ausdrücklich kein Ziel.

## Einrichten und anbinden

Node 24.21.0 und die offizielle STACKIT CLI verwenden. Der Betreiber-Key benötigt
MailOut-Zugriff in Dev und DNS-Zugriff auf die vorhandene Elternzone. Schlüssel
nicht versionieren. Die App-Route bleibt unverändert; verwaltet werden ausschließlich
SPF, DMARC, DKIM und Return-Path der Absender-Subdomain. MailOut prüft die Einträge
fortlaufend; nach erfolgreicher Verifikation nicht entfernen.

```sh
# Im Repository-Root; das private Standardverzeichnis ist ignoriert und hat Modus 0700.
export STACKIT_SERVICE_ACCOUNT_KEY_PATH=/secure/operator-key.json
node landing-zone-configurator/infra/mailout/provision.mjs plan
# Privaten Plan und den genauen Dev-DNS-Umfang prüfen.
node landing-zone-configurator/infra/mailout/provision.mjs apply
```

Erzeugung und DNS-Prüfung erfolgen asynchron. Bei noch fehlenden DNS-Daten oder
`ready:false` den Zustand prüfen und denselben Befehl später wiederholen. Er
findet die vorhandene Domain, belässt passende Einträge und lehnt Konflikte ab.
Fehlgeschlagene POSTs werden nicht blind wiederholt. Ein unklarer Ausgang bei
Sender-Erzeugung kann eine gezielt geprüfte Wiederherstellung oder Rotation verlangen.

Die einmalige Sender-Antwort wird unmittelbar vor der Endpunkt-Prüfung privat
abgelegt. Erfolgreiche Einrichtung schreibt `.local/mailout/bindings.private.json`
mit Modus 0600: genaue Projekt-/Domain-/Sender-IDs und SMTP-Zugangsdaten. Die Datei
bei der Einrichtung erhalten, niemals ausgeben, in Issues hochladen oder
versionieren. Ein vorhandener Sender ohne gespeichertes Passwort ist ein
Wiederherstellungsfall; kein Anlass, weitere Sender anzulegen oder den bisherigen
still zu löschen. Erst bei `ready:true` fortfahren.

```sh
# Private Bindung ausdrücklich im geschützten Dev-Environment hinterlegen.
gh secret set LZC_MAILOUT_BINDINGS --repo stackitcloud/stackit-landing-zone \
  --env lzc-dev-release < landing-zone-configurator/.local/mailout/bindings.private.json
```

Das geschützte GitHub-Environment-Secret hält die dauerhafte Betriebsbindung für
weitere Releases; die lokale Datei ist die private Einrichtungs-/Wiederherstellungskopie.
Der Sollzustand bleibt in Git, Ressourcen-IDs können auch über MailOut gelesen werden.
Zusammen mit den verschlüsselten Plattform-/Runtime-Sicherungen und dem
Artefakt-Verschlüsselungsschlüssel schützen. GitHub gibt gespeicherte Secrets nicht
an einen Arbeitsplatz zurück; Wiederherstellung nur über einen ausdrücklich
freigegebenen geschützten Job oder gezielte Rotation.
Die App benötigt nur SMTP-Zugangsdaten, keinen Betreiber-Cloud-Key. Die SMTP-Bindung
bleibt im CF-Backend und gelangt weder in Web-Dateien noch Runner oder Migration.

Der manuelle Configurator-Release liest die Bindung und prüft Umgebung, Projekt,
Absenderdomain und offiziellen SMTP-Host. Staging versendet grundsätzlich keine
Mails. Ohne Bindung bleibt Mail deaktiviert; Posteingang und Einstellungen
funktionieren weiter. Ein Merge startet kein Deployment. Der vorhandene
Artefakt-Schlüssel verschlüsselt Einladungstoken mit gesondertem Kontext; solange
solche Aufträge offen sind, muss der Schlüssel verfügbar bleiben.

Nach der Aktivierung vergleicht der Release alle tatsächlich in CF gesetzten
MailOut-Werte mit der freigegebenen Bindung, bevor er SMTP prüft. Fehlende,
deaktivierte oder veraltete Bindungen lassen den Release fehlschlagen;
Verbindungstests können eingerichteten E-Mail-Versand nicht unbemerkt überspringen.

## Zustellungsdiagnose und Wiederherstellung

- Posteingang und Einladungsliste zeigen vorgemerkt/laufend/angenommen/unterdrückt/
  fehlgeschlagen/unklar; keine behauptete Postfachzustellung.
- SMTP-Annahme bedeutet Provider-Annahme. MailOut-Nachrichtenhistorie,
  Sperrlisten und Metriken zeigen Zustellung, Bounces und Beschwerden.
  Bounce-Verarbeitung ist automatisch. Sperren nicht ungeprüft entfernen.
- Höchstens fünf sichere Versandversuche. Verlorene DATA-Bestätigung und
  verwaiste Claims bleiben ohne automatische Wiederholung `uncertain`.
  Vor einem neuen Auftrag die stabile Message-ID
  `<Benachrichtigungs-UUID@Absenderdomain>` in der Provider-Historie prüfen.
  Keine Infrastrukturaktion wiederholen, um eine Mail erneut zu senden.
- Bei `notification_delivery_failed` im App-Log die Datenbankverbindung und
  Wartung prüfen. Kein SMTP-Rohdebugging in gemeinsamen Logs aktivieren:
  Es kann Adressen und Inhalte offenlegen.
- Ohne Bindung setzt der nächste manuelle Release `LZC_MAILOUT_ENABLED=false`.
  Offene Aufträge unterliegen weiter Berechtigungen, Themen und sieben Tagen
  Versandfähigkeit. Metadaten werden 90 Tage aufbewahrt.
- Rotation: neue dedizierte Sendergeneration ausdrücklich prüfen/anlegen,
  private Bindung sichern/veröffentlichen, deployen und verifizieren; danach
  ausschließlich den genauen alten Sender widerrufen. Fehlende lokale Dateien
  lösen keine automatische Löschung aus.

## Prüfen

```sh
node --test landing-zone-configurator/infra/mailout/*.test.mjs
cd landing-zone-configurator/app
npm run check
# Nur eine dedizierte lokale PostgreSQL-Testdatenbank:
LZC_TEST_DATABASE_URL=postgres://.../configurator_test npm run test:database
npx playwright test e2e/notifications.spec.ts e2e/invitations.spec.ts
```

Normale CI verwendet SMTP-Nachbildungen und lokale Datenbank-/Browser-Fixtures;
sie versendet keine echten Mails. Echte Dev-Abnahme ist eine getrennte, freigegebene
Operation. Themen stellt jeder Benutzer selbst ein.
Siehe den [Benutzer- und Versandvertrag](../../docs/notifications.de.md).

Offizielle Quellen, geprüft am 2026-11-11:
[MailOut-API](https://docs.api.stackit.cloud/oas/mailout/version/v1beta1),
[Absenderdomain einrichten](https://docs.stackit.cloud/products/messaging/mailout/how-tos/create-setup-and-manage-sending-domains/),
[SMTP-Versand](https://docs.stackit.cloud/products/messaging/mailout/how-tos/send-mails/).
