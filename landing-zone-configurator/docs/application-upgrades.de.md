# Application-Templates und Plattform aktualisieren

[English](application-upgrades.md) | [Deutsch](application-upgrades.de.md)

Eine bestehende Bestellung hat drei unabhängige Stände: die gewünschte
Ausführungsquelle, die Application-Template-Version und ihren Plattformvertrag.
Sie stehen im Reiter **Updates** der Bestellung. Eine Veröffentlichung oder ein
Configurator-Release aktualisiert bestehende Bestellungen nicht automatisch.

Im Reiter Updates stehen Template-Name und Versionsnummer, die zuletzt angewendete
Version und die Anzahl freigegebener Zielversionen im Vordergrund. Technische
Kennungen sind in Details eingeklappt. Template-, Plattform- und Produkt-/Runner-
Updates sind getrennt; ein technischer Ausführungswechsel ergänzt keine Template-Rechte.
Wird kein passender Template-Pfad angeboten, dessen genaue Ausgangsversion,
Template-Familie und den Zugriff des Bestellers auf die Zielversion prüfen. Ein
veröffentlichter Pfad 3 → 4 gilt weder für eine Bestellung auf Version 1 noch für
ein anderes Template. Der Platform Owner prüft die benannten Versionen unter
Application Landing Zones → Veröffentlichung.

## Template-Upgrade veröffentlichen

Der Platform Owner veröffentlicht zuerst die neue Template-Version und danach
ausdrücklich einen Upgrade-Pfad von einer älteren Version desselben Templates.
Ein neuer Name oder eine andere Template-Familie ist kein Migrationspfad.
Veröffentlichte Versionen und die ursprüngliche Bestellung bleiben unveränderliche
Nachweise.

Der Upgrade-Pfad legt die Freigabe für diesen Übergang unabhängig von den
Bestellrichtlinien beider Template-Versionen fest. **Eigenständig durchführen**
erlaubt dem Application Owner, einen frischen gespeicherten Plan zu prüfen und
Apply ausdrücklich selbst zu bestätigen, ohne zusätzliche Platform-Owner-Freigabe.
**Separate Plan-Freigabe erforderlich** verlangt die Freigabe genau dieses Plans,
auch bei gewöhnlichen Änderungen. Standard ist die separate Freigabe; der
Löschschutz bleibt verbindlich.

Über **Freigaberichtlinie bearbeiten** kann der Platform Owner einen bestehenden
Pfad ändern. Das ergänzt einen neuen unveränderlichen Nachweis für dasselbe
Ausgangs-/Zielpaar; die Liste zeigt die neueste Richtlinie. Frühere Veröffentlichungen,
gewählte Upgrade-Ziele und Pläne behalten ihre gespeicherte Richtlinie. Um die neue
Richtlinie zu nutzen, gegebenenfalls das noch nicht angewendete Ziel zurücknehmen,
den neu veröffentlichten Pfad wählen und einen frischen Plan erstellen. Weder
Veröffentlichung noch Richtlinienänderung starten eine Ausführung oder entsperren
einen bestehenden Plan.



Die Veröffentlichungsseite führt den Platform Owner durch drei Schritte:

1. Gespeicherten Template-Entwurf, Plattformziel, Bereitstellungsrichtlinie und Katalogzugriff auswählen; die Version veröffentlichen.
2. Nach der serverseitig bestätigten Veröffentlichung optional ein Upgrade anbieten. Die neue Zielversion steht fest. Eine frühere Version derselben Template-Familie auswählen und die Ausführungsrichtlinie des Pfads prüfen, bevor der Pfad ausdrücklich veröffentlicht wird. Alternativ **Ohne Upgrade abschließen** wählen. Für eine erste Version gibt es keine Ausgangsversion; stattdessen die Veröffentlichung abschließen.
3. Der Abschluss führt zum Katalog. Die Veröffentlichung ändert keine bestehende Bestellung, keinen State und keine Cloud-Ressource.

Version und Upgrade-Pfad werden weiterhin in getrennten autorisierten Transaktionen
veröffentlicht. Scheitert die Pfadfreigabe, bleibt die Version veröffentlicht und
der Wizard erhält die Auswahl zur Korrektur. Eine erneute Pfadfreigabe veröffentlicht
die Version nicht erneut. Scheitert nur die Katalogaktualisierung nach erfolgreicher
Veröffentlichung, wird dies ausdrücklich gemeldet; der Wizard kehrt nicht zur
Versionsveröffentlichung zurück. Nach einem Neuladen können unter **Bestehende
Template-Upgrade-Pfade verwalten** Pfade zu bereits veröffentlichten Versionen
nachgetragen werden.

Gespeicherte Pfade aller Template-Familien stehen im aufklappbaren Verwaltungsbereich
unter dem Wizard. Jede Karte benennt Ausgangsversion, Ziel und Freigaberichtlinie.
Bestehende Pfade können nicht überschrieben werden. Direkte sensitive Änderungen
setzen direkte Bereitstellung in beiden Versionen voraus. Separate Plattformvertrags-Pfade
haben einen eigenen aufklappbaren Verwaltungsbereich und gehören nicht zur
Template-Veröffentlichung.

## Bestehende Bestellung aktualisieren

1. Unter **Updates** im Assistenten eine angebotene Version auswählen und
   **Weiter: Änderungen prüfen** wählen.
2. Vorhandene Parameterantworten bleiben erhalten. Neu erforderliche Antworten
   ergänzen; geänderte Auswahl oder Antworten machen die bisherige Vorschau ungültig.
3. Der Vergleich erscheint als eigener Schritt. **Zurück: Zielversion und Antworten**
   führt zur Auswahl zurück; danach ist eine neue Prüfung nötig. Bestätigen und
   **Upgrade-Ziel speichern und weiter** wählen. Das startet weder
   Plan noch Apply und verändert keinen State.
4. **Weiter: Neuen Plan prüfen** öffnet den Plan-Reiter derselben Bestellung, ohne
   einen Job zu starten. Diese Aktion ist auch nach dem Neuladen eines gespeicherten,
   noch nicht angewendeten Template-Ziels verfügbar. Einen neuen Plan erstellen. Erst der native Plan zeigt,
   welche tatsächlichen Änderungen zulässig sind.
5. Falls erforderlich, die Platform-Owner-Freigabe für genau diesen Plan und sein
   Artefakt einholen und die Ressourcen-Vorschau prüfen. **Weiter: Apply vorbereiten**
   öffnet im Assistenten die separate abschließende Bestätigung. Erst die ausdrückliche
   Apply-Aktion ändert Ressourcen. Zurückgehen startet keinen Job und erteilt keine Freigabe.

### Noch nicht angewendetes Upgrade ändern oder verwerfen

Im Plan-Schritt führt **Upgrade-Ziel ändern oder verwerfen** zurück zu Updates.
Der ursprüngliche Besteller kann **Upgrade-Ziel ändern** oder **Upgrade verwerfen**
wählen, die wiederherzustellende Version prüfen und die Rücknahme ausdrücklich
bestätigen. Die erste Aktion führt zur Zielauswahl, die zweite lässt die vorherige
Version als gewünschten Stand bestehen. Das funktioniert auch nach einem
abgeschlossenen Plan ohne Änderungen.

Der Server protokolliert eine neue unveränderliche Bindung mit Einstellungen,
Antworten und Plattformvertrag des letzten erfolgreichen Applies. Vor dem ersten
Apply stellt er stattdessen die ursprüngliche Bestellung wieder her. Bestellung,
Projekt und State-Zuordnung sowie die technische Ausführungswartung bleiben erhalten.
Die Aktion führt keine Infrastruktur aus, setzt keinen State zurück und entsperrt
nichts. Alte Pläne und Freigaben bleiben im Verlauf, sind aber für Apply gesperrt.
Die neue Bindung verhindert, dass sie nach erneuter Auswahl desselben Ziels wieder
gültig werden. Ein neues Ziel benötigt einen veröffentlichten Pfad ab der
wiederhergestellten Version, einen neuen Plan und die regulären Apply-Freigaben.
Eine noch nicht angewendete Zwischenversion muss nicht erst angewendet werden.

Eine aktive Ausführung oder ungeklärte Recovery, ein bereits vorbereiteter Apply
seit dem Ausgangsstand oder ein nicht mehr aktueller Plattformnachweis dieses
Standes sperren die Rücknahme. Ein fehlgeschlagener oder teilweise ausgeführter
Apply muss über Recovery abgeglichen werden. Eine Metadaten-Rücknahme macht seine
Cloud-Änderungen nicht rückgängig. Die Oberfläche zeigt Sperren vor der Bestätigung;
der Server prüft Bindung, Ausgangsstand, Besteller und Ausführungsstatus nochmals
atomar. Gleichzeitige Apply-Zulassung und Rücknahme können nicht beide gelingen.

Vorschau und Speichern verwenden dieselbe Prüfung freigegebener Ausführungsstände.
Wenn eine ältere Bestellung und eine ältere Ziel-Template-Version ausdrücklich
denselben unterstützten Nachfolger nennen, wählt das gespeicherte Upgrade diesen
Nachfolger und erfordert einen neuen Plan. Ursprüngliches Template und Bestellung
werden nicht umgeschrieben. Unbekannte oder zurückgezogene Zielquellen, unterstützte
Quellen ohne freigegebene Verbindung und fehlende Runner-Pakete bleiben gesperrt;
es gibt keine beliebige Quellenwahl oder automatische Herabstufung. Bei fehlgeschlagenem
Speichern erhält die Fehlermeldung den Fokus; Vergleich und Antworten bleiben zur
Korrektur erhalten.

Unterstützte technische Ausführung wird als einsatzbereit angezeigt; ihr separates
Wartungsformular ist unter **Optionale technische Wartung** eingeklappt. Bei einer
zurückgezogenen oder nicht verfügbaren Ausführung bleiben Warnung und Wartungsoptionen
sichtbar. Technische Wartung verändert keine Template-Rechte.

Instanz, Projektidentität, State-Key und Backend bleiben gleich. Ein Wechsel des
zentralen initialen Projekt-Owners, auch beim Umstieg vom alten Template auf das
granulare Rechteprofil, gilt als sensible Rechteänderung und darf einen neuen
Plan erreichen. Der tatsächlich gespeicherte Plan entscheidet über Apply:
Änderungen am bestehenden Projekt und an Projektrollen folgen der veröffentlichten
Freigaberichtlinie. Löschungen oder Ersetzungen von Projekt, Netzwerk, Diensten,
Identitäten und Zugangsdaten bleiben gesperrt. Nur Projektrollen und
Projekt-Rollenzuweisungen dürfen im Rahmen einer sensiblen IAM-Umstellung gelöscht
oder ersetzt werden; ihre exakten Anzahlen müssen zur gespeicherten
Plan-Zusammenfassung passen. Unbekannte oder unvollständige Nachweise blockieren;
eine Checkbox kann das nicht umgehen. Entzogene Rechte vor Apply prüfen. Ein
erfolgreicher Plan beweist nicht, dass der Rollenentzug bestehende Workloads
unbeeinflusst lässt.

IAM, Zugangsdaten und Netzwerke können sich auch ohne Löschung ändern. Für vom
tatsächlichen nativen Plan als sensibel klassifizierte Änderungen gelten die
veröffentlichte Ausführungsrichtlinie des Pfads. Auch das Anlegen und Ändern von
Observability und Secrets Manager gilt als sensibel, einschließlich Serviceplan,
Kapazität, Verfügbarkeit und Aufbewahrungszeit. Ein erfolgreicher Plan zeigt, was
der Provider technisch ausführen kann; er garantiert weder Datenerhalt noch,
dass die bisherige Nutzung in einen kleineren Plan passt. Vor der Freigabe die
Dienstgrenzen und Auswirkungen auf die Datenaufbewahrung prüfen. Aus Plan-Namen
wird keine Größenreihenfolge abgeleitet; es erfolgen weder automatische
Datenmigrationen noch Backups. Die veröffentlichte Richtlinie kann sensiblen
Self-Service ausdrücklich erlauben; der Schutz vor destruktiven Änderungen bleibt.
Erforderliche Freigaben
binden den neuen tatsächlichen Plan, seinen Artefakt-Hash und den gewünschten
Upgrade-Snapshot. Sie gelten nicht für andere Pläne oder später geänderte Parameter.

Eine abgeschlossene Migration vom Bootstrap- zum Remote-Backend behält ihre
Metadaten für eine sichere, idempotente Bestätigung. Diese historischen Marker
bedeuten für sich allein keine offene Migration. Die Upgrade-Prüfung bestätigt den
passenden erfolgreichen Migrations-Apply, dessen exakten Versionsschritt, das aktuelle
Remote-Backend und den entfernten Bootstrap-State. Der neueste Plattformnachweis muss
weiterhin zum aktuellen, ungesperrten State passen. Unvollständige, fehlgeschlagene
oder widersprüchliche Migrationsnachweise sperren Upgrades weiterhin. State und Sperre
werden nicht verändert, nur um ein Upgrade verfügbar zu machen.

Ein blockierter Vergleich lässt sich nicht durch eine Plan-Freigabe entsperren.
Kläre zuerst seine Voraussetzungen. Nach der ausdrücklichen Auswahl eines ausführbaren
Ziels wird ein neuer Plan erstellt. Bei einem freigabepflichtigen Upgrade öffnet der
Platform Owner den Reiter **Plan** derselben Bestellung und nutzt am erfolgreichen,
gespeicherten Plan **Diesen Upgrade-Plan freigeben**. Apply bleibt separat.

## Plattformänderungen wirken auf gemeinsame Infrastruktur

Vor einem Plattform-Apply dessen Auswirkungen auf Applications prüfen. Der Server
ermittelt die vom Plattform-State abhängigen Bestellungen und bewertet den nativen
Plan. Änderungen gemeinsamer Firewalls oder Routen wirken bei diesem Plattform-Apply
auf diese Applications. Eine Application behält keine eigene alte Firewall, indem
sie ein Vertragsupgrade ablehnt.

Bei Abhängigkeiten blockieren destruktive gemeinsame Änderungen sowie unbekannte
oder unvollständige Nachweise den Standard-Apply. Sensible gemeinsame Änderungen
benötigen eine ausdrückliche Platform-Owner-Bestätigung für genau diesen Plan,
Artefakt-Hash, State-Stand und Abhängigkeitssatz. Neue Abhängigkeiten oder geänderter
State machen sie ungültig. Aktive Application-Ausführungen und Recovery verhindern
ebenfalls widersprüchliche gemeinsame Änderungen.

Nach erfolgreichem Plattform-Apply dessen tatsächlich entstandenen Vertrag freigeben.
Ein veröffentlichter Plattform-Upgrade-Pfad kann diesen Vertrag anschließend für
bestehende Bestellungen anbieten, auch bei unveränderter Template-Version.
Die Bindung verwendet echte freigegebene Verträge; eine Veröffentlichung wird nicht
umgeschrieben, um einen Zielvertrag zu erfinden. Wechsel von Organisation,
Projektplatzierung, Network Area oder Backend-Identität sind Migrationen und liegen
außerhalb dieses Standardpfads.

## Fehlgeschlagene Upgrades und Recovery

Laufende oder ungeklärte Jobs, gültige Runner-Berechtigungen und offene Recovery
blockieren Bindungswechsel. Ein teilweise fehlgeschlagener Apply behält die gewünschte
Upgrade-Bindung und kann Ressourcen und State bereits verändert haben. Recovery
verwendet Template, Plattform, Ausführungsquelle und Eingaben des unterbrochenen Jobs.
Der letzte erfolgreiche Apply ersetzt nicht den aktuellen State; ein Teilupgrade wird
nicht stillschweigend zurückgestuft. Nach dem Abgleich einen neuen Plan prüfen.

Der Assistant erklärt den Ablauf. Eine Chat-Annahme veröffentlicht keinen Pfad,
ändert keine Bindung, gibt keinen Plan frei, entsperrt keinen State und erlaubt
keinen Apply.
