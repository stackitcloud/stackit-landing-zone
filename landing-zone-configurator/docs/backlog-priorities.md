# Priorisierung des Accelerator-Backlogs

Stand: 2026-10-01. Grundlage: vollständige Beschreibung aller 17 offenen Issues und Quellprüfung auf dem Configurator-Feature-Branch, Stand `faa8c3f`. Die Priorisierung beschreibt die nächsten sinnvollen Arbeiten; sie ist keine Zusage, dass alle Erweiterungen Voraussetzung für den Configurator-MVP sind.

## Kategorien und GitHub-Labels

Die Issues sind mit `priority:p1`, `priority:p2` oder `priority:p3`, `effort:s`, `effort:m` oder `effort:l` und `area:accelerator` eingeordnet. `needs-investigation` kennzeichnet noch zu klärende API-/Provider-Verträge oder Reproduktionen. Bestehende Labels bleiben erhalten. Die folgenden Tabellenwerte entsprechen der angewendeten Prioritäts- und Aufwandsklassifizierung.

- **P1:** Vor breiterem produktivem Self-Service entscheiden oder beheben. Eine offene P1 verhindert nicht automatisch einen bewusst eingeschränkten Plan-/Erstellungs-MVP.
- **P2:** Nächste funktionale Erweiterung oder Schließen einer relevanten Vertragslücke. Eine explizite Produktscope-Entscheidung kann einzelne Themen auf P1 heben.
- **P3:** Nachgelagerte Erweiterung oder opportunistischer Cleanup.
- **S / M / L:** Kleiner, mittlerer oder großer Implementierungsaufwand einschließlich Tests, Dokumentation und Configurator-Abgleich. Keine Zeitgarantie; externe Wartezeiten sind nicht enthalten.

Es wurde kein P0-Incident festgestellt. Nicht jede Accelerator-Erweiterung erhält ein MVP-Label: Entscheidend ist der ausdrücklich freigegebene MVP-Funktionsumfang. Den Stand der Configurator-Funktionen beschreibt die separate MVP-Bewertung.

## Triage aller offenen Issues

| Issue | Thema | Priorität | Aufwand | Abhängigkeiten und nächste Entscheidung |
|---|---|---|---|---|
| [#84](https://github.com/stackitcloud/stackit-landing-zone/issues/84) | Standalone explizit Public | P1 | S | Sofort behebbar: `corporate=false` fehlt im Beispiel weiterhin; der Root-Default ist `true`. Default für andere Verbraucher erhalten, nativen Vertragstest ergänzen und danach den Template-Katalog regenerieren. |
| [#81](https://github.com/stackitcloud/stackit-landing-zone/issues/81) | Widersprüchlicher Audit-Object-Lock-Default | P1 | M | Effektiver Default `true`, Beschreibung `false`. Beabsichtigtes Verhalten und Kompatibilität entscheiden; bestehende Buckets nicht automatisch ändern. Tests für ausgelassen, explizit an/aus und deaktivierte Audit Logs. |
| [#69](https://github.com/stackitcloud/stackit-landing-zone/issues/69) | Projekte ohne privilegierten Application Owner | P1 | L | API-/Provider-Vertrag und Supportticket SSD-25050 klären. Für eingeschränkte Application-Owner-Rechte entscheidend. Der MVP darf keine minimalen Rechte zusichern, während `owner_email` eine Owner-Zuweisung erzeugt. |
| [#22](https://github.com/stackitcloud/stackit-landing-zone/issues/22) | Folder-Löschung bei vorgemerkten Projekten | P1 | L | Provider-Issue [#1075](https://github.com/stackitcloud/terraform-provider-stackit/issues/1075) ist offen. Blockiert einen verlässlichen vollständigen Destroy-Self-Service, nicht zwingend freigegebene Erstellung oder Plan. Lifecycle-Reproduktion und Recovery-Weg erforderlich. |
| [#82](https://github.com/stackitcloud/stackit-landing-zone/issues/82) | Folder-Beschreibung wird ignoriert | P2 | S | Provider-/API-Unterstützung prüfen. Feld durchreichen oder explizit deprecaten/ablehnen: Der Root nimmt es an, der Governance-Modultyp verwirft es. |
| [#83](https://github.com/stackitcloud/stackit-landing-zone/issues/83) | Root-Konfiguration für Governance-Rollen und Secrets-Manager-ACLs | P2 | M | Öffentlichen Vertrag festlegen, alle regionalen und nichtregionalen Aufrufe verdrahten. Sinnvoll vor Application-Template-Veröffentlichung, damit Plattformpolicy ohne eigenen Terraform-Code formulierbar ist. |
| [#19](https://github.com/stackitcloud/stackit-landing-zone/issues/19) | Projektlabels | P2 | M | Provider-Issue [#1381](https://github.com/stackitcloud/terraform-provider-stackit/issues/1381) ist offen. Issue-Beschreibung ist teilweise überholt: Labels werden bereits gesetzt; Landing-Zone-Labels werden durch `ignore_changes` nicht nachgeführt. Create-/Update-/Null-Verhalten getrennt reproduzieren. |
| [#88](https://github.com/stackitcloud/stackit-landing-zone/issues/88) | Bestehende Observability-Instanz für SKE-Monitoring | P2 | L | Projekt-, Regions- und Rechtevertrag verifizieren, Management-Outputs ergänzen. Modi deaktiviert / erstellen / referenzieren sowie State-Ownership und Migration sauber trennen. |
| [#87](https://github.com/stackitcloud/stackit-landing-zone/issues/87) | Eigenständige Bastion | P2 | M | Eigenen Root-Vertrag mit Projekt-/Netzwerk-/Regionsreferenzen definieren. Kann vor #37 umgesetzt werden; löst die private Runner-Erreichbarkeit nicht. Bestehende clustergebundene Ressourcenadressen erhalten. |
| [#80](https://github.com/stackitcloud/stackit-landing-zone/issues/80) | Regionale Zielcluster für Namespace-Dienste | P2 | L | Explizite Clusterreferenz und passende Kubernetes-/Helm-Providerinstanzen beziehungsweise separate Ausführung je Cluster. Für öffentliche Cluster unabhängig von #37; private Namespace-Ausführung benötigt zusätzlich #37. |
| [#37](https://github.com/stackitcloud/stackit-landing-zone/issues/37) | Private/SNA-SKE-Ausführung | P2 | L | Runner-Platzierung, zwei Ausführungsphasen sowie Erreichbarkeits-/Authentifizierungs-Preflight. Auf P1 heben, wenn private Kubernetes-Namespace-Templates Bestandteil des MVP werden. Eine Bastion allein ersetzt diesen Betriebsvertrag nicht. |
| [#85](https://github.com/stackitcloud/stackit-landing-zone/issues/85) | VPN selektiv pro SNA | P2 | M | Stabile SNA-/Connection-Identität einschließlich Secret-Referenzen definieren. Vor #86/#64 sinnvoll; verhindert unerwünschte Replikation aller Verbindungen auf alle SNAs. |
| [#65](https://github.com/stackitcloud/stackit-landing-zone/issues/65) | Policies für mehrere Firewalls | P2 | L | Appliancebezogene Provider-/Endpoint-/Secret-Zuordnung, Bootstrap und Migration. Wird P1, wenn produktiver Multi-Firewall-Policy-Support zugesagt wird. |
| [#86](https://github.com/stackitcloud/stackit-landing-zone/issues/86) | VPN BGP | P2 | L | Zuerst Minimalreproduktion mit gepinntem Provider; historischen Defekt nicht als aktuell voraussetzen. #85 vorher empfehlenswert, nicht zwingend. Gelernte Routen und SNA-Propagation gesondert nachweisen. |
| [#64](https://github.com/stackitcloud/stackit-landing-zone/issues/64) | Automatisches Interregion-VPN | P3 | L | Baut sinnvoll auf #85 auf. #86 nur bei gewünschtem dynamischem Routing erforderlich. Endpoint-Bootstrap, zwei Phasen und Isolation ohne ausdrückliche Verbindung berücksichtigen. |
| [#34](https://github.com/stackitcloud/stackit-landing-zone/issues/34) | Zentraler File Service | P3 | L | Neues Plattformfeature mit SNA-/Projekt-/Export-/Zugriffsvertrag und späteren Application-Template-Referenzen. Kein Blocker des bisherigen MVP-Umfangs. |
| [#59](https://github.com/stackitcloud/stackit-landing-zone/issues/59) | Leerer time-Providerblock | P3 | S | Opportunistischer Cleanup. Block vorhanden; behauptete Proxy-Deprecation zunächst mit `tofu init` prüfen. Ein leerer Root-Providerblock ist nicht automatisch ein Child-Proxy-Provider. |

## Empfohlene Umsetzungsreihenfolge

1. **Korrektheit und verständliche Defaults:** #84 und #81; anschließend #82. #59 kann nach Verifikation als kleiner Cleanup mitgenommen werden.
2. **Self-Service-Verträge und Lebenszyklus:** #69 früh mit API-/Provider-Verantwortlichen klären; #83 und #19 bearbeiten. #22 als ausdrücklichen Lifecycle-Blocker verfolgen. Parallel Benutzer-/Tenant-Isolation, Application Templates und Freigabeverfahren im Configurator fertigstellen.
3. **Referenzen auf Plattformressourcen:** #88 und #87. Vor einer UI-Auswahl muss der Accelerator die Referenzen tatsächlich ausführen und ihre Berechtigungs-/Regionsgrenzen validieren können.
4. **Kubernetes-Onboarding:** #80 für öffentlich erreichbare Cluster; #37 für private Ausführung ergänzen. Die beiden Issues lösen unterschiedliche Probleme und sind nicht austauschbar.
5. **Netzwerkerweiterung:** #85 → #86 → #64 als sinnvolle Reihenfolge; #65 als unabhängigen parallelen Strang behandeln. BGP ist keine zwingende Voraussetzung für statisches Interregion-VPN.
6. **Weitere Plattformdienste:** #34 nach dem gemeinsamen Plattform-/Application-Referenzvertrag.

## Untersuchungen und externe Abhängigkeiten

- Die offenen Provider-Issues #1075 und #1381 sind externe Abhängigkeiten. Ihr Status allein beweist nicht, ob ein konkreter Fehler mit dem aktuell gepinnten Provider unverändert reproduzierbar ist. Minimalreproduktion, betroffene Version und Workaround getrennt dokumentieren.
- Bei #69 sind API-Verhalten, dokumentierter Vertrag und Provider-Eingabeschema gemeinsam zu prüfen. Ein Service Account als initiales Mitglied und eine vollständig leere initiale Mitgliederliste sind unterschiedliche Anforderungen.
- Bei #82 und #88 müssen unterstützte API-/Providerfähigkeiten vor der Root-/UI-Erweiterung feststehen.
- Bei #86 ist der historische Hinweis auf einen Nested-Object-Fehler keine aktuelle Reproduktion.
- Bei #59 wird die Behauptung eines deprecated Proxy-Providers erst nach reproduziertem Init-Hinweis als gesichert behandelt.

## Grenze zur Configurator-MVP-Planung

Die Behebung dieser Accelerator-Issues ersetzt keine Configurator-Self-Service-Implementierung. Unveränderliche veröffentlichte Template-Versionen, berechtigte Instanziierung, verifizierte STACKIT-Identitäten, getrennte States, serverseitige Freigabepolicy und belastbare Ausführung bleiben eigenständige Arbeitspakete. Ein bewusst begrenzter MVP kann öffentliche Ressourcen und ausdrücklich freigegebene Applies unterstützen und private Kubernetes-Ausführung beziehungsweise vollständigen Destroy transparent ausschließen. Die bisherige Freigabepflicht für Kunden-Applies bleibt bestehen.
