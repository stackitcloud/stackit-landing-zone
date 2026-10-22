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
Corporate-Anwendungsnetze uebernehmen `ipv4_nameservers` vom gebundenen
Plattformziel. STACKIT-Provider 0.114.0 lehnt Null-Praefix plus gesetztes DNS,
auch eine leere Liste, trotz erfolgreichem Validate mit
„Invalid IPv4 configuration“ ab.
Automatische Netzgroesse belaesst `network_prefix_length=null` im Template:
Das native Corporate-Modul liest im Plan/Apply `default_prefix_length` der
angebundenen regionalen SNA und uebergibt das effektive Praefix an den Provider,
bei unveraendertem DNS. Ein explizites Template-Praefix ueberschreibt den
SNA-Default und darf nicht still ersetzt werden. Public verwendet weiterhin die
automatische Providerwahl ohne Corporate-SNA-Abfrage.

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
Bei diesem IPv4-Fehler die DNS-/Praefix-Abhaengigkeit und den korrigierten
nativen Automatikpfad erklaeren. Automatisch uebernimmt den tatsaechlichen
Default der angebundenen SNA, setzt weder pauschal /24 noch schaltet es DNS ab.
Ein SNA-Default im Entwurf beschreibt Absicht, keinen Nachweis des aktuellen
Cloud-Defaults oder freier Adressen; die Abfrage findet im Plan statt.
Bei ausdruecklichem Automatisch nicht nach einem Zahlenpraefix fragen.
Bestehende explizite Praefixe erhalten. Fuer angeforderte Abweichungen bei Bedarf
Adressbedarf und bekannte Poolgrenzen klaeren; /24 ist ein Beispiel, keine
Eignungs- oder Verfuegbarkeitsgarantie. Bei ausdruecklichem /26
`settings.network_prefix_length=26` fuer das bestehende Template vorschlagen,
Identitaet und andere Einstellungen erhalten. Fuer ausdrueckliches Automatisch
`settings.network_prefix_length=null` vorschlagen, keinen festen Ersatzwert.
DNS nicht abschalten, nicht zu Public wechseln und keinen State loeschen.
Veroeffentlichte Versionen/Bestellungen behalten ihre unveraenderliche Quelle und
Einstellungen. Fuer die native Korrektur eine neue Version mit korrigierter
Runner-Revision veroeffentlichen und diese bestellen; der Assistant kann nicht
fuer den Benutzer veroeffentlichen/bestellen/Plan/Apply ausfuehren.

<a id="examples"></a>

## Beispiele

Public-Instanzen verwenden `corporate=false`.
`network_prefix_length=24` ueberschreibt einen SNA-/25-Default.
Dies sind Fragmente, keine automatischen Projekterstellungsanfragen.
Corporate-SNA-Default /28 und Automatisch: null im Template erhalten; das
korrigierte native Modul loest /28 fuer den Provider auf und erhaelt Ziel-DNS.
Bestaetigtes /26 ueberschreibt /28; der ausdrueckliche Wechsel zurueck auf
Automatisch schlaegt null vor. Beides garantiert weder freie Kapazitaet noch
einen erfolgreichen Cloud-Apply.

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
Validierungsvertraege sowie native Netzverdrahtung. Die Netzwerkressource des
gepinnten Providers validiert die IPv4-Kombination; ein isolierter Plan-Test mit
dem echten Provider prueft leeres/gesetztes DNS, explizite Praefixe und
automatische Groessenwahl ohne DNS.
Policy-/Identitaets-/Exportaenderungen erneut pruefen;
Anwendungslebenszyklus bleibt getrennt.
