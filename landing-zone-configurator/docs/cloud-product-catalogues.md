# STACKIT-Produktkataloge im Editor

## Zweck und aktueller Umfang

Der Editor lädt Produktoptionen ausdrücklich auf Benutzerwunsch. Ein eigener gespeicherter STACKIT-Service-Account-Zugang und ein Referenzprojekt werden gewählt. Zentrale Deployment-Credentials des Configurators werden niemals verwendet. Die Auswahlwerte unterstützen den Entwurf, ersetzen jedoch weder Accelerator-Validierung noch einen tatsächlichen Plan oder eine Quotenprüfung.

- [x] Git-Leistungsklassen: projektbezogene, als `available` markierte Flavors.
- [x] VPN-Leistungsklassen: regionsbezogene `planId`-Werte mit Anzeigenamen.
- [x] SKE: unterstützte Kubernetes-Versionen, Node-Pool-Maschinentypen, Verfügbarkeitszonen und Volume-Typen pro Region.
- [x] Eingeblendete Dropdowns erhalten bestehende/importierte Werte; fehlende Werte werden als nicht im geladenen Katalog markiert, niemals still ersetzt.
- [x] Getrennte Fehlerbehandlung je Produkt. Fehlende API-Berechtigungen oder nicht verfügbare Kataloge lassen manuelle Eingaben zu; das ist keine erfolgreiche Cloud-Validierung.
- [x] Keine Persistierung des Katalogs, keine Browser-Tokens, kein gemeinsamer Cache über Benutzer/Tenants. Wechsel des Benutzers oder Tenants leert den Kontext.
- [ ] Weitere Kataloge für Observability, Datenbanken und IaaS nach produktspezifischer Prüfung.
- [ ] VPN-Verfügbarkeitszonen über eine für VPN dokumentierte Quelle. SKE-Zonen werden ausdrücklich **nicht** als VPN-Zonen angeboten.
- [ ] Automatische erneute Cloud-Validierung vor dem Plan, berücksichtigt Zielprojekt, Region, Berechtigungen und Quoten.
- [ ] Mehrere gleichzeitig geladene Regionskataloge; derzeit ist ein Regionskontext aktiv. Andere Regionen bleiben manuell editierbar.
- [ ] Live-Verifikation mit einem vom Benutzer gewählten persönlichen Credential-Profil; bisher Transport-/Schema-/UI-Tests mit kontrollierten Antworten.

## APIs und Quellen

Prüfstand 2026-10-01, offizieller STACKIT Go SDK, Commit `7746310c7fe0a5e3f5c5e6e9b1be69d48c6184d9`:

| Produkt | Nur lesender Endpunkt | Verwendete Antwortfelder |
|---|---|---|
| Git | `GET https://git.api.stackit.cloud/v1beta/projects/{projectId}/flavors` | `flavors[].id`, `display_name`, `availability` (`available`, `unavailable`, `internal`, `deprecated`) |
| VPN | `GET https://vpn.api.stackit.cloud/v1/regions/{region}/plans` | `plans[].planId`, optional `name` |
| SKE | `GET https://ske.api.stackit.cloud/v2/regions/{region}/provider-options?versionState=SUPPORTED` | `kubernetesVersions[].version/state`, `machineTypes[].name`, `availabilityZones[].name`, `volumeTypes[].name` |

Quellen: [Git API](https://github.com/stackitcloud/stackit-sdk-go/blob/7746310c7fe0a5e3f5c5e6e9b1be69d48c6184d9/services/git/v1betaapi/api_default.go), [Git Availability](https://github.com/stackitcloud/stackit-sdk-go/blob/7746310c7fe0a5e3f5c5e6e9b1be69d48c6184d9/services/git/v1betaapi/model_flavor_availability.go), [VPN API](https://github.com/stackitcloud/stackit-sdk-go/blob/7746310c7fe0a5e3f5c5e6e9b1be69d48c6184d9/services/vpn/v1api/api_default.go), [VPN Plan](https://github.com/stackitcloud/stackit-sdk-go/blob/7746310c7fe0a5e3f5c5e6e9b1be69d48c6184d9/services/vpn/v1api/model_plan.go), [SKE API](https://github.com/stackitcloud/stackit-sdk-go/blob/7746310c7fe0a5e3f5c5e6e9b1be69d48c6184d9/services/ske/v2api/api_default.go), [SKE Provider Options](https://github.com/stackitcloud/stackit-sdk-go/blob/7746310c7fe0a5e3f5c5e6e9b1be69d48c6184d9/services/ske/v2api/model_provider_options.go).

Die globalen/regionsbezogenen APIs liefern keinen Nachweis, dass alle Werte in einem bestimmten künftigen Projekt bestellbar sind. Das Git-Referenzprojekt ist ausdrücklich nicht das künftig anzulegende Zielprojekt. Die API-Version des Katalogs ist unabhängig von der gepinnten Terraform-Provider-Version; ein Eintrag im Katalog bestätigt nicht automatisch dessen Unterstützung durch den Accelerator.

## Sicherheits- und Fehlerverhalten

`POST /api/v1/cloud-catalogues` verlangt eine aktive Sitzung, gleiche Origin und CSRF-Token. Die Operation führt nur Token-Austausch und lesende Produktabfragen aus. UUIDs und Region (`eu01`/`eu02`) werden strikt validiert. Server-seitige Abfrage des Credential-Profils verwendet explizit Benutzer-ID und Tenant-ID plus PostgreSQL RLS. Der Secrets-Manager-Schlüssel muss mit Profilmetadaten übereinstimmen. Browser erhalten nur normalisierte Katalogdaten.

Alle Cloud-Ziele sind fest definiert; Redirects sind verboten, Antworten sind auf 2 MB begrenzt und Requests haben 15 Sekunden Timeout. Fehlermeldungen enthalten keine Providerantworten, privaten Schlüssel oder Tokens. Unbekannte/fehlerhafte Antwortschemata markieren nur den betroffenen Katalog als nicht verfügbar. Ein vorhandener, aber leerer Katalog unterscheidet sich von einem fehlgeschlagenen Abruf.

Der erste Abschnitt gilt im persönlichen Arbeitsbereich. Organisationstenants bleiben bis zur Einführung freigegebener Plattformzugänge im Entwurfsmodus; sie übernehmen keine Credentials aus persönlichen Arbeitsbereichen.
