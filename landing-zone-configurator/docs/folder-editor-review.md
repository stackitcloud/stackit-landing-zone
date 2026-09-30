# Prüfung: Ordner im Configurator

Stand: 2026-09-30. **Umsetzung nach ausdrücklicher Benutzerfreigabe.** Die Prüfung wurde zunächst
separat vorgestellt; anschließend wurden Ordner-Schritt und Vorschau freigegeben.
Geprüft im lokalen Accelerator und im freigegebenen Runner-Commit
`a256f6896d11134fdc351786f1be5eba4e56b2e2`.

## Tatsächliche Struktur

`src/variables.tf` definiert `rm_folders`. Das Governance-Modul legt für jeden
Eintrag einen Ordner an. Alle haben denselben Parent: `rm_folder_parent_id`, falls
angegeben, ansonsten `organization_id`. Ein zusätzlicher Unternehmensordner wird
nicht automatisch aus `company_name` erstellt. Die entsprechenden Kommentare in
einigen Vorlagen/Variablen sind irreführend; maßgeblich ist die Ressourcendefinition
in `src/modules/governance/1-rm-folders.tf`.

| Stabiler Schlüssel | Standard-Anzeigename | Projektzuordnung im Root-Modul |
| --- | --- | --- |
| `platform` | Platform | Management und aktivierte Plattformmodule, einschließlich Connectivity |
| `landing_zones_corporate` | Landing Zones - Corporate | Landing Zones mit `corporate = true` |
| `landing_zones_public` | Landing Zones - Public | Landing Zones mit `corporate = false` |
| `sandboxes` | Sandboxes | Sandbox-Projekte |

Die vier Standardordner entstehen auch ohne Projekte im jeweiligen Bereich.
Anzeigenamen sind frei konfigurierbar (1–40 Zeichen laut Root-Validierung).
Unternehmenskürzel und Projektdaten beeinflussen die Projektpräfixe, nicht diese
Ordnernamen. Zusätzliche Ordner sind als Map-Einträge technisch möglich; eine freie
Projektzuordnung oder verschachtelte neue Ordnerstruktur ist nicht vorgesehen.

`owner_email` wird für alle Ordner übernommen. Pro Ordner können zusätzlich
`owner_emails` (Rolle owner) und `reader_emails` (Rolle auditor) vergeben werden.
Ein `description`-Feld im Root-Typ wird derzeit nicht vom Governance-Modul bis zur
Ressource weitergereicht: kein wirksames Beschreibungsfeld in der UI anbieten.
Der abweichende Governance-Moduldefault `sandbox` ist für den Root-Aufruf ohne
Auswirkung: dieser übergibt ausdrücklich seine Map mit `sandboxes`.

## Lücke im Configurator

`Topology.tsx` zeigt aktuell Organisation, Landing Zones, Sandboxes und optionale
Netzwerk-Hubs. Ordner und Management-Projekt fehlen. `ConfigurationDraft` hat
keine editierbaren Ordnerfelder. `buildConfiguration` erhält unveränderte
Vorlagenattribute, bietet aber keinen fachlichen Zugriff auf die Ordnerdefaults.
Der Standalone-Editor setzt `corporate = false`; seine Landing-Zone-Projekte
gehören daher zum Public-Ordner. Der derzeitige Organisationsname in der Grafik
kommt aus `company_name`, nicht aus einem nachgeschlagenen STACKIT-Org-Namen.

## Empfehlung

1. Ablauf **Grundlagen → Ordner → Projekte → Prüfen**.
2. Vier feste Ordnerrollen mit verständlichem Zweck und bearbeitbarem Anzeigenamen.
   Interne Schlüssel und Zuordnungen bleiben stabil. Im MVP kein Löschen dieser
   Ordner und kein frei gestaltbarer Baum.
3. Gemeinsamen technisch Verantwortlichen aus Grundlagen erklären. Zusätzliche
   Owner/Auditor-Zuordnungen als spätere Erweiterung behandeln.
4. Bestehenden übergeordneten Ordner optional später anbieten, mit Zugriffstest
   und Prüfung, dass er zur gewählten Organisation gehört. Kein Freitextfeld ohne
   diesen fachlichen Kontext.
5. Vorschau aus den tatsächlich wirksamen Defaults/Overrides aufbauen:
   Organisation → optional vorhandener Parent → vier Ordner → Projekte.
   Management und aktive Plattformmodule einschließen; leere Ordner ebenfalls zeigen.
6. Bestehende JSON-Entwürfe kompatibel mit Defaults ergänzen, native tfvars und
   serverseitigen Compiler gemeinsam erweitern. Stabilität der Schlüssel bewahren;
   Umbenennungsverhalten erst im echten Plan bewerten, keine pauschale Zusage,
   dass ein bestehendes Deployment dadurch unverändert bleibt.

## Nach Freigabe einzuplanen

- [x] Tatsächliche Accelerator-Struktur und UI-Lücke prüfen.
- [x] Vorschlag und Grenzen dem Benutzer erläutern.
- [x] Fachlichen Umfang bestätigen lassen.
- [x] Versionierung/Kompatibilität bestehender Konfigurationen festlegen.
- [x] Ordner-Schritt und Strukturvorschau implementieren.
- [x] Export, Bestandskonfigurationen, Navigation und Desktop/Mobil prüfen.
- [ ] Plan prüfen; Kunden-Apply weiterhin nur nach ausdrücklicher Freigabe.


## Implementierter Umfang

Vier editierbare Anzeigenamen mit Längenprüfung, stabile Schlüssel und unveränderte
Projektzuordnung. Schritt-URL `/configurations/edit/folders` mit Zurück/Vorwärts
und Wiederaufnahme. Vorschau zeigt auch leere Ordner, Management und aktive
Plattformmodule. Projektpräfixe entsprechen dem Root-Accelerator; fachliche
Projektbezeichnungen werden zusätzlich angezeigt. Ein in einer Vorlage gesetzter
übergeordneter Ordner wird angezeigt, bleibt im Editor jedoch unverändert.

Neue Ordnernamen werden als `draft.folders` in Dokumentversion **2** gespeichert.
Version **1** bleibt ohne dieses Feld les- und schreibbar; ihr tfvars-Export bleibt
bytegleich. Defaults werden im Editor angezeigt, aber erst bei tatsächlicher
Bearbeitung explizit exportiert. Bereits gespeicherte Vorbereitungen behalten ihre
ursprünglichen Hashes. Geänderte Konfigurationen benötigen einen neuen Git-Commit
und eine neue Deployment-Vorbereitung. Der Serializer bleibt Export v1; das
versionierte Eingabedokument ist davon getrennt.

Ordnerrollen werden beim Export aus der Vorlage erhalten. Kein Löschen, Verschieben,
freier Ordnerbaum oder Bearbeiten von Ordnerrechten. Für Umbenennungen bestehender
Cloud-Ressourcen bleibt die konkrete Planprüfung erforderlich.
