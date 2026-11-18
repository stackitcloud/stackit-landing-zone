# Git in Application Landing Zones

[English](application-git.md) | [Deutsch](application-git.de.md)

Ein Application-Template kann eine optionale verwaltete STACKIT-Git-Instanz im
eigenen Projekt enthalten. Sie ist von zentralem Plattform-Git und GitHub-Login
getrennt. Corporate-/SNA-Zuordnung bindet diesen verwalteten Service nicht an ein
privates Projektnetz an: Zugriff erfolgt über seinen öffentlichen Endpunkt und
explizite Quell-IP-ACLs.

Der Platform Owner steuert `git.enabled`, `git.flavor` und `git.acl` im
Application-Template. Jeder Wert kann fest vorgegeben oder als Bestellparameter
angeboten werden; Flavors und Quellnetze bleiben auf die veröffentlichten
Auswahlwerte begrenzt. Git ist standardmäßig deaktiviert. Aktivierung benötigt
einen gültigen Tarif und eine nicht leere explizite ACL. Öffentliches
`0.0.0.0/0` oder `::/0` ist eine bewusste Freigabe, niemals ein Standardwert.

Git10 ist für bis zu 10, Git100 für bis zu 100 Nutzer **pro Instanz** dokumentiert.
Maßgeblich sind die geplanten Git-Nutzer einschließlich Wachstum. Oberhalb von
100 Nutzern getrennte Team-/Projektinstanzen oder eine andere unterstützte
Architektur besprechen. Mehrere Instanzen ergeben keine transparente Föderation,
gemeinsamen Repositories oder ein gemeinsames Nutzerverzeichnis.
Siehe die [offizielle Sizing-Dokumentation](https://docs.stackit.cloud/products/developer-platform/git/basics/plan-size-of-git-service/).
Der Katalog beschreibt angebotene Tarife und hebt dokumentierte Grenzen nicht auf.

Neue Templates benötigen die Git-fähige Ausführungsquelle. Bestehende
veröffentlichte Versionen, Bestellungen, State-Schlüssel und Ressourcenidentitäten
bleiben unverändert. Für Git in einer bestehenden Application eine neue
Template-Version veröffentlichen und deren unterstützte Ausführungsquelle
explizit auswählen. Den resultierenden Plan prüfen. Beim gepinnten STACKIT-Provider
0.114.0 ersetzen Änderungen von Git-Flavor **und ACL** die Instanz;
Repository-/Datenmigration vor Freigabe solcher Änderungen separat planen.

## Accelerator unabhängig nutzen

Ein Configurator ist nicht erforderlich. Im `application`-Eingabewert von
`src/application` ergänzen:

```hcl
git = {
  enabled = true
  flavor  = "git-100"
  acl     = ["203.0.113.0/24"] # Durch das tatsächliche öffentliche Ausgangsnetz ersetzen.
}
```

Dasselbe Objekt gibt es als `landing_zones.<key>.git` im nativen Plattform-Root.
Ohne dieses Objekt bleibt Git deaktiviert. Die Application-Ausgabe enthält die
Git-Instanz-ID, keine Git-Nutzerpasswörter, Tokens oder privaten Schlüssel.
Git-Nutzereinrichtung und Repository-Konfiguration bleiben separate
Service-Operationen.

Die State-Wiederherstellung kann die bestehende Git-Instanz anhand von Projekt, Name, Flavor und exakter ACL erkennen und importieren. Die Recovery-Zugangsdaten benötigen dafür lesenden Zugriff auf die Git-Instanzliste; mehrdeutige oder sich ändernde Instanzen werden abgewiesen. Wiederhergestellt wird die Terraform-Identität, nicht Repository-Daten oder Git-Nutzerzugangsdaten; Service-Backup und Repository-Migration bleiben separat.
