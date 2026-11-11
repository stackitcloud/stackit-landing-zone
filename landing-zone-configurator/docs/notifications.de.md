# Benachrichtigungen und transaktionale E-Mails

[English](notifications.md) | [Deutsch](notifications.de.md)

Die Glocke im Kopfbereich öffnet den Posteingang des aktiven Arbeitsbereichs.
Ungelesene Nachrichten, ein Verlauf über 90 Tage und Links zur jeweiligen
Bestellung, Ausführung oder Mitgliederverwaltung bleiben unabhängig von E-Mails
sichtbar. Ein Link genehmigt und startet nichts: Anmeldung, aktuelle Mitgliedschaft
und Berechtigungen werden weiterhin geprüft. Gehört die Nachricht zu einem anderen
Arbeitsbereich, erfolgt der Wechsel ausdrücklich über den Hinweis zur Nachricht.

Unter **Benachrichtigungen → E-Mail-Benachrichtigungen** wählt jeder Benutzer
seine Themen und die Nachrichtensprache: standardmäßig Deutsch, alternativ Englisch.
Die Einstellungen gelten persönlich über Arbeitsbereiche und App-Instanzen hinweg.
Es gibt keinen zentralen Themen-Schalter pro Arbeitsbereich. Freigaben, Fehler,
Wiederherstellung, Zugriffsänderungen und begrenzte Erinnerungen sind standardmäßig
aktiv; Erfolgsmeldungen per E-Mail zunächst aus. Dies betrifft nur E-Mails. Der
Betreiber kann die gesamte Mail-Anbindung deaktivieren; der Posteingang bleibt.

| Ereignis | Empfänger | E-Mail-Thema |
| --- | --- | --- |
| Vom Einladenden ausdrücklich verschickte Einladung | Angegebene eingeladene Adresse | Entscheidung des Einladenden, unabhängig von persönlichen Einstellungen |
| Neue genehmigungspflichtige Bestellung | Aktuelle Platform Engineers außer dem Besteller | Bestellungen und Freigaben |
| Bestellung freigegeben oder abgelehnt | Besteller | Bestellungen und Freigaben |
| Geprüftes Upgrade freigegeben | Eigentümer der Bestellung | Bestellungen und Freigaben |
| Plattform-Plan/Apply beendet oder Wiederherstellung nötig | Eigentümer der Ausführung | Erfolg / Fehler / Wiederherstellung |
| Application-Plan/Apply beendet oder Abgleich nötig | Besteller und Freigebender der Ausführung, ohne Duplikate | Erfolg / Fehler / Wiederherstellung |
| Relevante Mitglieder-, Rollen- oder Gruppenänderung | Aktuelle Mitgliederverwalter | Mitgliedschaften und Zugriffe |
| Bestellung wartet weiterhin auf Freigabe | Aktuell zuständige Platform Engineers | Höchstens drei Erinnerungen mit mindestens 24 Stunden Abstand |
| Offene Einladung läuft innerhalb von 24 Stunden ab | Einladender mit weiterhin gültiger Mitgliederverwaltung | Eine Erinnerung pro Einladung |

Nachrichten folgen bestehenden Workflow-Übergängen. Sie führen keinen neuen
Freigabewiderruf, Eigentümerwechsel oder Infrastrukturvorgang ein. Wiederholte
Verarbeitung desselben Ereignisses erzeugt keinen zweiten Eintrag. Alte abgeschlossene
Vorgänge werden nicht nachträglich verschickt. Ereignisse beginnen mit dieser
Migration; offene Bestellungen und Einladungen können begrenzte Erinnerungen auslösen.

## Einladungen

Unter **Mitglieder** können berechtigte Mitglieder nach Namen oder E-Mail-Adresse
suchen, nach Rolle filtern und Rollen direkt bei der jeweiligen Person bearbeiten.
Vor dem Entfernen nennt die Bestätigung Person und Arbeitsbereich. Dabei endet der
Zugriff auf den Arbeitsbereich; das Konto bleibt bestehen. Die letzte Person mit
Mitgliederverwaltung muss diese Berechtigung vor dem eigenen Entfernen übertragen.
Mitglieder ohne Verwaltungsberechtigung sehen ihren eigenen Zugriff; Mitgliederliste
und offene Einladungen bleiben der Mitgliederverwaltung vorbehalten.

Über **Person einladen** wählst du ein Verfahren:

- **Per E-Mail einladen:** Empfänger und Nachrichtensprache eingeben, Rollen wählen
  und **Einladung senden** drücken. Der Link wird automatisch erstellt und für den
  Versand vorgemerkt. Eine separate Link-Erstellung ist nicht erforderlich.
- **Link selbst teilen:** Rollen wählen und **Einladungslink erstellen** drücken.
  Kopiere den einmalig angezeigten Link und gib ihn selbst weiter.

Der Reiter **Einladungen** zeigt Empfängeradresse, Rollen, Ablaufdatum und
Versandstatus. Manuell geteilte Links sind bis zur Annahme ausdrücklich keiner
Person zugeordnet. Vorgemerkte und laufende Versandvorgänge werden bei geöffnetem
Reiter automatisch aktualisiert; zusätzlich gibt es eine manuelle Aktualisierung.
Beim Widerrufen nennt die Bestätigung den Empfänger oder bezeichnet den Link.
Die SMTP-Annahme bestätigt die Übergabe, nicht die Zustellung ins Postfach.

Einladung und Versandauftrag werden gemeinsam gespeichert. Eine
E-Mail-Einladung lässt sich nur mit der passenden verifizierten, nicht widerrufenen
STACKIT-E-Mail-Adresse prüfen und annehmen. Manuell geteilte Links behalten ihr
bisheriges Bearer-Verhalten. Beide Verfahren verlangen Anmeldung, ausdrückliche
Annahme sowie eine gültige und nicht widerrufene Einladung. Es entstehen
Configurator-Mitgliedschaften, keine STACKIT-IAM-Rechte.

Der Einladungstoken wird im privaten Versandauftrag authentifiziert und an seinen
Kontext gebunden verschlüsselt. SQL speichert ihn nicht im Klartext. Nach Übergabe
an SMTP oder einem endgültigen Ergebnis sowie nach sieben Tagen ohne Versand wird
er entfernt. Der Einladungshash bleibt maßgeblich. Einladungslinks gehören nicht in
Logs oder Issues. Die Einladungsliste zeigt den Versandstatus ohne Token an.

E-Mail-Einladungen sind pro Einladendem arbeitsbereichsübergreifend auf 20 pro
Stunde begrenzt. Scheitert der Versandauftrag, wird auch die Einladung zurückgerollt.
Versand-Batches sind begrenzt.

## Versand und Datenschutz

Die Nachrichten verwenden STACKIT-Gestaltung, ein eingebettetes Logo, zugängliches
HTML und eine Textalternative. Sie enthalten feste Ereignisbeschreibungen und
Anmeldelinks, keine Zugangsdaten, States, Plan-Ausgaben, Logs, Ablehnungsbegründungen
oder Infrastrukturkonfigurationen. Es gibt keine Tracking-Pixel oder extern
nachgeladenen Anhänge.

Empfänger folgen der aktuellen Mitgliedschaft und Workflow-Beteiligung. Normale
Nachrichten gehen an die zuletzt verifizierte, nicht widerrufene STACKIT-Adresse,
nicht an frei eingebbare Owner-Felder. Vor SMTP werden Berechtigungen, Sichtbarkeit
und persönliche Themen erneut geprüft. Ein abgelaufener Login-Token löscht nicht
die früher verifizierte Adresse; widerrufene Identitätsnachweise oder entzogene
Rechte verhindern den Versand. Entzogener Zugang entfernt auch die sichtbaren
Nachrichten dieses Arbeitsbereichs. Bereits an SMTP übergebene Nachrichten lassen
sich nicht zurückrufen.

Private SQL-Funktionen begrenzen Posteingang, Einstellungen und Versandwartung.
Die Laufzeitrolle kann die Versandtabellen nicht direkt lesen. Transaktionale
Claims und `SKIP LOCKED` verhindern parallelen Doppelversand. Sichere vorübergehende
Fehler werden mit exponentiellem Abstand höchstens fünfmal versucht. Dauerhafte
SMTP-Ablehnungen stoppen. Verlorene DATA-Bestätigungen, Datenbankfehler nach
SMTP-Annahme und verwaiste Claims werden als **unklar** markiert und nicht blind
wiederholt. Ein Mailfehler wiederholt oder verändert keinen Infrastrukturvorgang.

**Annahme durch den Mailserver bedeutet noch keine Zustellung.** Bounces und
Sperrlisten behandelt MailOut; dessen Nachrichtenhistorie und Metriken zeigen die
Zustellergebnisse. Fehlgeschlagene und unklare Nachrichten bleiben im Posteingang
sichtbar, Einladungszustände in der Mitgliederverwaltung. Logs enthalten feste
Diagnosecodes, keine Provider-Rohantworten, Adressen oder Nachrichtentexte.
Versandaufträge sind höchstens sieben Tage versandfähig; Metadaten werden nach
90 Tagen gelöscht.

Einrichtung, geschützte Release-Bindung, Deaktivierung, Rotation und
Zustellungsdiagnose stehen im [Betriebshandbuch](../infra/mailout/README.de.md).
