# Application-Templates und Plattform aktualisieren

[English](application-upgrades.md) | [Deutsch](application-upgrades.de.md)

Eine bestehende Bestellung hat drei unabhängige Stände: die gewünschte
Ausführungsquelle, die Application-Template-Version und ihren Plattformvertrag.
Sie stehen im Reiter **Updates** der Bestellung. Eine Veröffentlichung oder ein
Configurator-Release aktualisiert bestehende Bestellungen nicht automatisch.

## Template-Upgrade veröffentlichen

Der Platform Owner veröffentlicht zuerst die neue Template-Version und danach
ausdrücklich einen Upgrade-Pfad von einer älteren Version desselben Templates.
Ein neuer Name oder eine andere Template-Familie ist kein Migrationspfad.
Veröffentlichte Versionen und die ursprüngliche Bestellung bleiben unveränderliche
Nachweise.

Der Pfad legt auch die Freigabe sensibler Änderungen fest. Standardmäßig ist eine
Freigabe erforderlich. Direkter Self-Service ist nur möglich, wenn beide Versionen
direktes Deployment erlauben und der Platform Owner sensible Änderungen auf
diesem Pfad ausdrücklich dafür freigibt. Der Löschschutz bleibt verbindlich.

## Bestehende Bestellung aktualisieren

1. Unter **Updates** eine angebotene Version auswählen und Änderungen vergleichen.
2. Vorhandene Parameterantworten bleiben erhalten. Neu erforderliche Antworten
   ergänzen; geänderte Auswahl oder Antworten machen die bisherige Vorschau ungültig.
3. Die gewünschte Bindung prüfen und ausdrücklich bestätigen. Das startet weder
   Plan noch Apply und verändert keinen State.
4. Einen neuen Plan derselben Bestellung erstellen. Erst der native Plan zeigt,
   welche tatsächlichen Änderungen zulässig sind.
5. Falls erforderlich, die Platform-Owner-Freigabe für genau diesen Plan und sein
   Artefakt einholen; anschließend Apply im normalen Ablauf ausdrücklich freigeben.

Instanz, Projektidentität, State-Key und Backend bleiben gleich. Der Standardpfad
blockiert Löschungen und Ersetzungen – auch Änderungen, die OpenTofu als Ersetzung
statt als Änderung vor Ort behandelt. Unbekannte oder unvollständige Nachweise
blockieren ebenfalls. Eine Checkbox kann das nicht umgehen. Destruktive Migrationen
benötigen ein separates geprüftes Verfahren.

IAM, Zugangsdaten, Netzwerke, Service-Pläne und Verfügbarkeit können sich auch ohne
Löschung ändern. Dafür gelten die veröffentlichte Richtlinie für sensible Änderungen
und die strengere Deployment-Richtlinie beider Versionen. Erforderliche Freigaben
binden den neuen tatsächlichen Plan, seinen Artefakt-Hash und den gewünschten
Upgrade-Snapshot. Sie gelten nicht für andere Pläne oder später geänderte Parameter.

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
