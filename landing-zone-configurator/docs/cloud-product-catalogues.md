# STACKIT-Produktkataloge im Editor

## Zweck und aktueller Umfang

Der Editor lädt Produktoptionen ausdrücklich auf Benutzerwunsch. Ein eigener gespeicherter STACKIT-Service-Account-Zugang und ein Referenzprojekt werden gewählt. Zentrale Deployment-Credentials des Configurators werden niemals verwendet. Die Auswahlwerte unterstützen den Entwurf, ersetzen jedoch weder Accelerator-Validierung noch einen tatsächlichen Plan oder eine Quotenprüfung.

- [x] Git-Leistungsklassen: projektbezogene, als `available` markierte Flavors.
- [x] VPN-Leistungsklassen: regionsbezogene `planId`-Werte mit Anzeigenamen.
- [x] SKE: unterstützte Kubernetes-Versionen, Node-Pool-Maschinentypen, Verfügbarkeitszonen und Volume-Typen pro Region.
- [x] Eingeblendete Dropdowns erhalten bestehende/importierte Werte; fehlende Werte werden als nicht im geladenen Katalog markiert, niemals still ersetzt.
- [x] Getrennte Fehlerbehandlung je Produkt. Fehlende API-Berechtigungen oder nicht verfügbare Kataloge lassen manuelle Eingaben zu; das ist keine erfolgreiche Cloud-Validierung.
- [x] Keine Persistierung des Katalogs, keine Browser-Tokens, kein gemeinsamer Cache über Benutzer/Tenants. Wechsel des Benutzers oder Tenants leert den Kontext.
- [ ] Weitere Kataloge für Datenbanken und zusätzliche Produkte nach produktspezifischer Prüfung.
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

Die globalen/regionsbezogenen APIs liefern keinen Nachweis, dass alle Werte in einem bestimmten künftigen Projekt bestellbar sind. Das Referenzprojekt für Git, Observability und IaaS ist ausdrücklich nicht das künftig anzulegende Zielprojekt. Die API-Version des Katalogs ist unabhängig von der gepinnten Terraform-Provider-Version; ein Eintrag im Katalog bestätigt nicht automatisch dessen Unterstützung durch den Accelerator.

## Sicherheits- und Fehlerverhalten

`POST /api/v1/cloud-catalogues` verlangt eine aktive Sitzung, gleiche Origin und CSRF-Token. Die Operation führt nur Token-Austausch und lesende Produktabfragen aus. UUIDs und Region (`eu01`/`eu02`) werden strikt validiert. Server-seitige Abfrage des Credential-Profils verwendet explizit Benutzer-ID und Tenant-ID plus PostgreSQL RLS. Der Secrets-Manager-Schlüssel muss mit Profilmetadaten übereinstimmen. Browser erhalten nur normalisierte Katalogdaten.

Alle Cloud-Ziele sind fest definiert; Redirects sind verboten, Antworten sind auf 2 MB begrenzt und Requests haben 15 Sekunden Timeout. Fehlermeldungen enthalten keine Providerantworten, privaten Schlüssel oder Tokens. Unbekannte/fehlerhafte Antwortschemata markieren nur den betroffenen Katalog als nicht verfügbar. Ein vorhandener, aber leerer Katalog unterscheidet sich von einem fehlgeschlagenen Abruf.

Der erste Abschnitt gilt im persönlichen Arbeitsbereich. Organisationstenants bleiben bis zur Einführung freigegebener Plattformzugänge im Entwurfsmodus; sie übernehmen keine Credentials aus persönlichen Arbeitsbereichen.

Katalogzugang, Referenzprojekt-ID und Region werden in diesem Browser pro Benutzer
und Arbeitsbereich gespeichert und beim erneuten Öffnen wiederhergestellt.
Gespeichert werden ausschließlich diese drei Auswahlwerte, keine Schlüssel,
Tokens oder Katalogantworten. Das Profil wird erneut gegen die zugänglichen,
gespeicherten Credential-Profile geprüft; ein gelöschtes Profil wird nicht mehr
vorausgewählt. Kataloge werden weiterhin nur nach expliziter Aktualisierung
abgerufen. Die Einstellung wird nicht zwischen Geräten synchronisiert; blockierter
Browser-Speicher erzeugt einen sichtbaren Hinweis.

## Erweiterung: Observability und Diagnose-Bastion

- [x] `observability.plan_name` und die Observability-Blöcke von Plattform-Clustern, Landing Zones und Sandboxes verwenden `plans[].name` als Terraform-Eingabe, nicht die abweichende Plan-UUID.
- [x] IaaS-Maschinentypen, öffentliche verfügbare Images und IaaS-Verfügbarkeitszonen für `platform_kubernetes[*].debug_bastion`. Die Kataloge sind von SKE-Node-Pools getrennt.
- [x] Bestehende Werte und manuelle Eingabe bei Ausfall bleiben erhalten; neue API-Antwortfelder sind optional für kompatible ältere Antworten.
- [ ] Observability-Plankatalog für eu02 verifizieren. Die öffentlich dokumentierte regionale Basis ist `argus.api.eu01.stackit.cloud`; für eu02 wird bewusst kein eu01-Katalog angeboten. Auch die globale Basis ist dokumentiert, jedoch ohne Parameter/Zusicherung einer regionsspezifischen Planliste.

| Katalog | Quelle | Antwort |
|---|---|---|
| Observability | `GET https://argus.api.eu01.stackit.cloud/v1/projects/{projectId}/plans` | `plans[].name`; Zuordnung über Planname wie im Accelerator |
| Bastion-Maschinentypen | `GET https://iaas.api.stackit.cloud/v2/projects/{projectId}/regions/{region}/machine-types` | `items[].name` |
| Bastion-Images | `GET https://iaas.api.stackit.cloud/v2/projects/{projectId}/regions/{region}/images?all=true` | `items[].id`, `name`, `status`, `scope`; Auswahl nur `AVAILABLE` und `public` |
| Bastion-Zonen | `GET https://iaas.api.stackit.cloud/v2/regions/{region}/availability-zones` | `items[]` |

Quellen: [Observability OpenAPI](https://docs.api.eu01.stackit.cloud/oas/argus/version/v1), [IaaS v2 API](https://github.com/stackitcloud/stackit-sdk-go/blob/main/services/iaas/v2api/api_default.go), [Image-Modell](https://github.com/stackitcloud/stackit-sdk-go/blob/main/services/iaas/v2api/model_image.go), [Maschinentypen](https://github.com/stackitcloud/stackit-sdk-go/blob/main/services/iaas/v2api/model_machine_type_list_response.go), [Zonen](https://github.com/stackitcloud/stackit-sdk-go/blob/main/services/iaas/v2api/model_availability_zone_list_response.go).

Die geprüften IaaS-v2-Listenmethoden bieten keine Cursor-/Page-Parameter und die Antwortmodelle keine Fortsetzungsmarker. `all=true` fordert die vollständige Image-Sicht an. Antwortgrößen über dem vorhandenen Limit oder mehr als 2.000 Einträge werden nicht still abgeschnitten: der betroffene Katalog wird als nicht verfügbar behandelt. Private, organisations- oder projektgeteilte Images des Referenzprojekts werden nicht als auswählbare Images vorgeschlagen, da ihre Nutzbarkeit im neu angelegten Zielprojekt nicht bewiesen ist. Vorhandene Image-IDs bleiben im Entwurf erhalten. Die OS-Eignung, benötigte Werkzeuge und Image-/Flavor-Kompatibilität sind weiterhin vor dem Deployment zu prüfen.

## Projektrollen und Permissions

Der lesende Katalogabruf verwendet zusätzlich die Membership API v2:

| Katalog | Endpunkt | Normalisierte Felder |
| --- | --- | --- |
| Projektrollen | `GET https://authorization.api.stackit.cloud/v2/project/{projectId}/roles` | `roles[].name`, `description`, `permissions[].name` |
| Projekt-Permissions | `GET https://authorization.api.stackit.cloud/v2/permissions?resourceType=project` | `permissions[].name` |

Quelle: offizieller SDK-Stand `7746310c7fe0a5e3f5c5e6e9b1be69d48c6184d9`,
`services/authorization/v2api`. Die Antwort der Rollenliste muss zur angefragten
Projekt-ID und zum Ressourcentyp `project` gehören. Beide Kataloge bleiben bei
fehlenden Berechtigungen unabhängig von den anderen Produktkatalogen nicht verfügbar.
Die API-Antworten sind wie bisher zeit- und größenbegrenzt und enthalten im Browser
keine Tokens. IAM-Optionen sind projektbezogen, nicht regionsbezogen.

Der Editor bietet Permissions als Dropdowns und kopiert Rollenvorlagen als lokale
Definitionen. Referenzprojekt-Rollen-IDs werden nicht weitergegeben und fremde
Projektmitglieder werden nicht abgefragt. Die Anwendung prüft noch keine persönliche
STACKIT-Identität über diesen Katalog: spätere Rollenvariablen benötigen den getrennten
verifizierten Instanziierungskontext. Die konkrete Bestellbarkeit und Rollenauflösung
im neuen Zielprojekt bleibt ein Gate vor produktiver Veröffentlichung.

## PIM: zentrale Produktinformationen, keine alleinige Auswahlvalidierung

Die öffentliche [STACKIT PIM API v2](https://docs.api.eu01.stackit.cloud/documentation/pim/version/v2) ist tatsächlich ein zentraler Katalog für Kategorien, Produkte und SKUs. Die [OpenAPI-Spezifikation](https://docs.api.eu01.stackit.cloud/oas/pim/version/v2) dokumentiert unter anderem:

- `GET https://pim.api.stackit.cloud/v2/products`
- `GET https://pim.api.stackit.cloud/v2/products/{productId}/skus`
- `GET https://pim.api.stackit.cloud/v2/skus`
- SKU-Attribute wie Region, technische Merkmale, Produktreife und Deprecation sowie Artikelnummern für Abrechnung.
- Öffentlich verfügbare Listen mit Cursor-Paginierung (`pageSize` maximal 100). Ein späterer PIM-Adapter muss sämtliche Folgeseiten berücksichtigen.

PIM eignet sich als ergänzende Quelle für einheitliche Produktbezeichnungen, technische Erklärungen und SKU-Zuordnung. Seine öffentlichen SKU-Listen bestätigen keine Bestellbarkeit oder Berechtigung in einem konkreten Projekt, keine Quoten, keine aktuellen Kubernetes-Versionen und keine verfügbaren VM-Images. Daher bleiben die jeweiligen Produkt-APIs die Quelle der technischen Auswahlwerte. PIM-Daten sollen später diese Werte anreichern, nicht alle Abrechnungs-SKUs ungeprüft zu Editoroptionen machen. Es wurde noch kein PIM-Adapter implementiert. Die in der API-Übersicht als auslaufend markierte v1 wird nicht neu angebunden.
