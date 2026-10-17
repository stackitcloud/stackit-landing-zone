<a id="mvp-scope-and-limits"></a>
# MVP-Umfang und Grenzen

[English](mvp-scope.md) | [Deutsch](mvp-scope.de.md)

Das MVP verbindet den unabhängig nutzbaren Accelerator mit einem mandantenfähigen
Editor, geprüften Assistant-Vorschlägen und ausdrücklich autorisierter Ausführung.
Es macht aus einem Konfigurationsentwurf keinen autonomen Deployment-Agenten.

<a id="included-implementation"></a>
## Enthaltene Implementierung

- STACKIT-OIDC-Anmeldung, Mandantenmitgliedschaft und getrennte technische Ausführungsberechtigungen.
- Gemeinsame native Editor-/Compiler-Verträge, Import/Export und Erhaltung
  bestehender Ressourcenidentitäten.
- Plattformentwürfe, Projektvorlagenentwürfe, unveränderliche Veröffentlichung und getrennte
  Application-Instanzen.
- Geprüfte, revisionsgebundene Assistant-Vorschläge; kuratiertes Dienstwissen,
  deterministische Validierung und Regressionsqualifikation mit echten Modellen.
- Getrennte Vorbereitung, Plan und Apply; isolierte gepinnte Runner, Fortschrittsausgabe,
  verschlüsselte Artefakte und State-/Recovery-Verarbeitung.
- Automatische Quellvalidierung und manuell gestartete Workflows für Betreiberbereitstellung
  und Anwendungsreleases.

Implementierung, automatisierte Tests, eine erfolgreiche Cloud-Operation und
Produktionsabnahme sind unterschiedliche Nachweise. Keine Liste hier zertifiziert
jede mögliche Kundenkonfiguration oder Netzwerktopologie.

<a id="deliberate-boundaries"></a>
## Bewusste Grenzen

- **Produktion ist zurückgestellt.** Im Rahmen des MVP-Quellmerges wird keine
  Produktionsumgebung erstellt. Produktion benötigt eigene Identität, Netzwerk,
  Backup, Recovery, Observability, Kapazität und betriebliche Abnahme.
- **Firewall-Policy folgt nach dem MVP** ([#101](https://github.com/stackitcloud/stackit-landing-zone/issues/101)).
  Appliance-/HA-Vorschläge werden unterstützt, geführte Policy-/NAT-/Routenverwaltung
  jedoch nicht. Der Firewall-Administrator pflegt die Policy in OPNsense.
- **Private Ausführungspfade benötigen separate Qualifikation**
  ([#37](https://github.com/stackitcloud/stackit-landing-zone/issues/37)).
  Ein gehosteter Runner erreicht nicht automatisch private Firewall-, Kubernetes-
  oder Helm-Endpunkte in Kundennetzwerken.
- **DNS-Rollen sind keine Sichtbarkeitssteuerung.** Primary und Secondary sind native
  autoritative Rollen; die Konfiguration des Secondary-Servers ist unvollständig.
- **Die Integration des Managed Private DNS Resolver ist zurückgestellt**
  ([#100](https://github.com/stackitcloud/stackit-landing-zone/issues/100)).
  Bestehende DNS-Einstellungen für Zonen/Bereiche implementieren dieses separate Produkt nicht.
- **Cloud-Fakten bleiben extern.** Verfügbarkeit, Berechtigung, Durchsatz, nutzbare
  Netze und effektive Rechte erfordern eine aktuelle verbindliche Prüfung.
- **Assistant-Qualifikation ist begrenzt.** Bestandene synthetische Szenarien beweisen
  keine universelle sachliche Korrektheit. Jede fehlgeschlagene Wiederholung bleibt blockierend;
  Änderungen an der qualifizierten Quelle benötigen neue Nachweise.

Offene Arbeit wird in [GitHub-Issues](https://github.com/stackitcloud/stackit-landing-zone/issues)
verfolgt, nicht in datierten öffentlichen Übergabe- oder Abnahmeprotokollen. Siehe
[Benutzerhandbuch](user-guide.de.md), [Architektur](architecture.de.md) und
[Entwicklungsübersicht](development.de.md).
