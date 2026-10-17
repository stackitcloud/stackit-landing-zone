<a id="repository-guidance"></a>

# Repository-Leitlinien

[English](AGENTS.md) | [Deutsch](AGENTS.de.md)

Vor Codeaenderungen [CONTRIBUTING.de.md](CONTRIBUTING.de.md) lesen.
Fuer Terraform auch den [Terraform-Stilguide](docs/terraform-style.de.md)
lesen und befolgen; die dokumentierten Konventionen fuer
Root-/Child-Provider-Versionen erhalten.

<a id="boundaries"></a>

## Grenzen

- `src/` ist der unabhaengig nutzbare Accelerator.
  Keine Abhaengigkeit von Configurator-API, Datenbank oder gehostetem Service
  einfuehren.
- `landing-zone-configurator/` enthaelt eigene App, Vertraege, Compiler,
  HCL-Adapter, Runner-Paketierung und Betreiber-IaC.
  Der [komponentenuebergreifenden Entwicklungsuebersicht](landing-zone-configurator/docs/development.de.md)
  folgen.
- Native Eingaben, generierte Kataloge, Domaenenvalidierung, API-/Jobvertraege,
  Frontend/Sprachen, Runner und Assistant-Wissen konsistent halten.
  Artefakte mit bestehenden Befehlen generieren;
  generierte Inhalte nicht manuell bearbeiten.
- Importierte Felder, stabile Ressourcenidentitaeten, Null-/Default-Semantik,
  Tenant-Autorisierung und revisionsgebundene Freigaben erhalten.
  Assistant-Annahme ist weder Persistenz noch Erlaubnis fuer Plan/Apply.

<a id="verification-and-operations"></a>

## Verifikation und Betrieb

- Gepinnte Tools und kleinste relevante bestehende Pruefungen verwenden,
  danach den vollstaendigen betroffenen Ablauf validieren.
  Uebersprungene Pruefungen und offene Fehler explizit berichten.
- Aenderungen an Assistant-Fakten oder -Faehigkeiten benoetigen
  quellengebundene Realmodell-Qualifikation gemaess Wissensvertrag.
  Fehlgeschlagene Wiederholungen sind Fehler, keine Retries;
  Validierung nicht fuer einen gruenen Nachweis abschwaechen.
- Niemals Secrets, Kundenzustand, rohe Plaene oder private Betriebsevidenz
  offenlegen.
  Keine Cloud-Mutationen oder Deployments ohne explizite Autorisierung.
- Configurator-Provisionierung und Anwendungsdeployment sind manuelle
  Workflows.
  Ein Source-Merge ist keine Deployment-Freigabe;
  Produktion ist ein getrennter Folgeschritt.
- Nicht betroffene Worktree-Aenderungen erhalten.
  Direkt zugehoerige oeffentliche und Contributor-Dokumentation
  aktualisieren, keine datierten Sitzungsnotizen oder Uebergabedateien.
- Englisch als primaere Dokumentationssprache und deutsche Begleiter
  gemaess [CONTRIBUTING.de.md](CONTRIBUTING.de.md) pflegen;
  generierte und maschinell eingelesene Quellvertraege erhalten.
