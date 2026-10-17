<a id="landing-zone-projects-and-application-templates"></a>

# Landing-Zone-Projekte und Anwendungstemplates

[English](project-templates.md) | [Deutsch](project-templates.de.md)

Deutsche Lesefassung. Der Assistant liest ausschliesslich die englische Quelle.

<a id="purpose"></a>

## Zweck

Wiederverwendbare Public-/Corporate-Projektgrundlagen, keine
Anwendungsprovisionierung.

<a id="accelerator-contract"></a>

## Accelerator-Vertrag

Natives `landing_zones` unterstuetzt `corporate`, `region`,
`network_area_key`, `project_code`, `env`, `owner_email`,
`network_enabled/network_prefix_length`, `role_assignments`, `custom_roles`,
`observability`, `secretsmanager_enabled`.
Public-Instanzen setzen explizit `corporate=false`.
Plattformentwuerfe verwenden `projectTemplates` und Parameterrichtlinien,
keine persoenlichen Instanzfelder oder erfundene
Veroeffentlichungs-/Bestell-Terraform-Attribute.

<a id="dependencies"></a>

## Abhaengigkeiten

Governance/Identitaet, SNA derselben Region fuer Corporate und getrennte
Zugangsdaten. Public ist kein Corporate-Spoke.
DNS, Secrets Manager und Observability sind getrennt.

<a id="dialogue"></a>

## Dialog

Template-Setup ist ein Entwurf, auch bei Wechsel nach Audit/Git.
Neue Eintraege benoetigen `name`, `kind`, `region` und `settings`;
bestehende unterstuetzen Teilaktualisierungen mit stabilen
Schluesseln/Identitaeten.
Delegierte Benennung bedeutet fachliche Namen waehlen, nicht erneut nach
Namen fragen.
Zentrales Netz versus nur Internet bedeutet Corporate versus Public;
angeforderte lokale Netze setzen fuer beide `network_enabled=true`.
Gespeicherte Region, eindeutige Area derselben Region und native
Subnetz-Defaults wiederverwenden.
Neue Templates zusammenfuehren; nicht angeforderte Services weglassen,
nicht geerbtes Plattform-Audit/-Git.
Fehlende/mehrdeutige Entscheidungen und angeforderte
Anwendungs-Owner-Richtlinien erfragen.
Keine Sandboxes bedeutet keine Sandbox-Erstellung, nicht das Ueberspringen
von Public-/Corporate-Setup.
Nicht betroffene Templates nicht ohne Zustimmung entfernen.
100 Projekte beschreibt Kapazitaet, nicht 100 generierte Beispiele oder
eine Template-Quote.
Aus effektiven Praefixen berechnen und Plattform-/Firewall-/Zukunftsbereiche
reservieren.

<a id="examples"></a>

## Beispiele

Public-Instanzen verwenden `corporate=false`.
`network_prefix_length=24` ueberschreibt einen SNA-/25-Default.
Dies sind Fragmente, keine automatischen Projekterstellungsanfragen.

<a id="limits"></a>

## Grenzen

Gepruefte native Einstellungen/Richtlinien koennen vorgeschlagen, nicht
veroeffentlicht, bestellt oder provisioniert werden.
Region, DNS-/Area- und Namespace-Referenzen muessen passen.
Leere Rollen/ACLs beweisen kein Least Privilege.
Quoten/nutzbare Adressen benoetigen aktuelle Pruefungen;
theoretische Subnetzzahlen sind keine Garantie.

<a id="credentials"></a>

## Zugangsdaten

Provisionierung, delegierte Owner-Zugangsdaten, Workload-Zugang und
Runtime-Freigaben sind getrennt.
Keine Secrets/Profil-IDs im Modellkontext oder in Exporten;
externe Ausfuehrung benoetigt explizite Bindungen.

<a id="sources"></a>

## Quellen

Root-/Landing-Zone-Variablen und gemeinsame Template-/Compiler-/
Validierungsvertraege.
Policy-/Identitaets-/Exportaenderungen erneut pruefen;
Anwendungslebenszyklus bleibt getrennt.
