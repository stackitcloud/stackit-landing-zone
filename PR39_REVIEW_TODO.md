# PR 39 Review TODO (Arbeitsliste)

Quelle: Review-Kommentare aus https://github.com/stackitcloud/stackit-landing-zone/pull/39  
Stand: 2026-06-17

Hinweis zur Nutzung:

- Pro Thema bitte genau eine Entscheidung markieren:
  - `[ ] Vorschlag umsetzen`
  - `[ ] Alternative wählen`
- Bei `Alternative wählen` bitte eure Zielvariante unter `Alternative / Notiz` ergänzen.
- `Ref` verweist auf die extrahierten Review-Kommentar-IDs (1..28).

## Offene Themen als Checkliste (nach Bereich)

### Architektur und Scope

1. [x] Ref 05 - Kubernetes-Demo nicht fest im Landing-Zone-Terraform
       Review-Thema: Die Demo sollte optional sein und nicht Teil des produktionsnahen Standardpfads.
       Vorgeschlagene Lösung: Demo-Ressourcen aus `src/namespace-service.tf` in optionales Submodul auslagern (`demo_enabled`), Default `false`.
       Entscheidung: [x] Vorschlag umsetzen [ ] Alternative wählen
       Alternative / Notiz:

2. [x] Ref 11 - Debug-Bastion als eigenes Modul
       Review-Thema: Debug-Bastion ist fachlich ein eigener Baustein.
       Vorgeschlagene Lösung: `src/modules/platform-kubernetes/5-debug-bastion.tf` in Submodul `modules/debug-bastion` auslagern und optional aufrufen.
       Entscheidung: [x] Vorschlag umsetzen [ ] Alternative wählen
       Alternative / Notiz:

### Ingress und Security

3. [x] Ref 04 - NGINX Ingress durch Gateway Controller ersetzen
       Review-Thema: NGINX-Ingress wurde aus Security-Gründen kritisch bewertet.
       Vorgeschlagene Lösung: Namespace-Service-Demo auf Gateway API Controller umstellen (Gateway/HTTPRoute). Wenn nicht sofort möglich: per Feature-Flag standardmäßig deaktivieren.
       Entscheidung: [ ] Vorschlag umsetzen [x] Alternative wählen
       Alternative / Notiz: Gateway API Controller bitte mittels Envoy Gateway umsetzen

### Terraform Core und Provider

4. [x] Ref 06 - null Provider durch terraform_data ersetzen
       Review-Thema: `null_resource` wird nicht mehr benötigt.
       Vorgeschlagene Lösung: `null_resource` auf `terraform_data` migrieren und `hashicorp/null` aus `required_providers` entfernen.
       Entscheidung: [x] Vorschlag umsetzen [ ] Alternative wählen
       Alternative / Notiz:

5. [x] Ref 07 - Provider-Versionen planbar pinnen
       Review-Thema: `>=`-Constraints sind zu offen und reduzieren Vorhersagbarkeit.
       Vorgeschlagene Lösung: Constraints auf planbare Ranges umstellen (z. B. `~>`), danach Lockfile bewusst aktualisieren.
       Entscheidung: [x] Vorschlag umsetzen [ ] Alternative wählen
       Alternative / Notiz:

6. [x] Ref 25, 26 - providers.tf fachlich vereinfachen
       Review-Thema: Provider-Setup und Region-Check wirken unnötig komplex.
       Vorgeschlagene Lösung: `src/providers.tf` auf notwendige Konfiguration reduzieren, Region-Check entfernen oder in Input-Validation verlagern.
       Entscheidung: [x] Vorschlag umsetzen [ ] Alternative wählen
       Alternative / Notiz:

### Validierung und API-Design

7. [x] Ref 08, 09 - Input-Validierung an richtige Stelle verschieben
       Review-Thema: `check`-Blöcke wurden für Input-Validierung genutzt.
       Vorgeschlagene Lösung: Input-Validierung in `variable.validation` (oder gezielt `precondition`) verschieben; `check` nur für Laufzeit-/State-Prüfungen verwenden.
       Entscheidung: [x] Vorschlag umsetzen [ ] Alternative wählen
       Alternative / Notiz:

8. [x] Ref 28 - namespace_service.enabled vereinfachen/deprecaten
       Review-Thema: `enabled` ist redundant, wenn das Objekt selbst schon Aktivierung signalisiert.
       Vorgeschlagene Lösung: `namespace_service = null` als deaktiviert, Objekt gesetzt als aktiviert; `enabled` deprecaten und später entfernen.
       Entscheidung: [x] Vorschlag umsetzen [ ] Alternative wählen
       Alternative / Notiz:

9. [x] Ref 27 - Variablen-Scope bereinigen
       Review-Thema: Ein Variablenblock liegt laut Review im falschen Scope.
       Vorgeschlagene Lösung: Variable ins fachlich passende Modul verschieben; Root-Variablen nur für echte Root-API behalten.
       Entscheidung: [x] Vorschlag umsetzen [ ] Alternative wählen
       Alternative / Notiz:

### Kubernetes Platform, Netzwerk und Node-Pools

10. [x] Ref 01, 02, 03 - Default Node-Pools sauber modellieren
        Review-Thema: Default-Node-Pools sollten als Variable-Defaults definiert werden; Trennung in `system`/`application` wird gewünscht.
        Vorgeschlagene Lösung: `var.cluster.node_pools` mit strukturiertem Default, `allow_system_components = true` nur im `system`-Pool.
        Entscheidung: [x] Vorschlag umsetzen [ ] Alternative wählen
        Alternative / Notiz: separaten application node pool vorsehen.

11. [x] Ref 16, 17, 23 - SNA Input-Modell vereinfachen
        Review-Thema: `mode`-String plus zusätzliche locals gelten als unnötig.
        Vorgeschlagene Lösung: `sna_enabled` (bool) und optional `sna_network_area_id` als primäres Modell; `mode` deprecaten.
        Entscheidung: [x] Vorschlag umsetzen [ ] Alternative wählen
        Alternative / Notiz: Wir brauchen Dinge noch nicht deprecaten, sondern können vollständig umstellen, da wir ja noch nicht live waren.

12. [x] Ref 12 - SNA Egress-Routing über Firewall klarstellen
        Review-Thema: Ohne Routing-Tabelle könnte Internet-Traffic Firewall-Bypass haben.
        Vorgeschlagene Lösung: Routing-Pfad fachlich fixieren und ggf. dedizierte Routing-Tabelle + Default-Route via Firewall umsetzen.
        Entscheidung: [x] Vorschlag umsetzen [ ] Alternative wählen
        Alternative / Notiz:

13. [x] Ref 13 - Netzwerkdateien zusammenführen
        Review-Thema: `2-dns-zones.tf`, `2-network-area-membership.tf`, `2-sna-network.tf` sollen konsolidiert werden.
        Vorgeschlagene Lösung: Zusammenführen in `2-network.tf` als Struktur-Refactor ohne Logikänderung.
        Entscheidung: [x] Vorschlag umsetzen [ ] Alternative wählen
        Alternative / Notiz:

14. [x] Ref 10 - Deprecated API-Version aktualisieren
        Review-Thema: Verwendete API-Version wurde als deprecated markiert.
        Vorgeschlagene Lösung: Auf aktuelle, unterstützte Version aktualisieren und gegen Provider/API-Matrix verifizieren.
        Entscheidung: [x] Vorschlag umsetzen [ ] Alternative wählen
        Alternative / Notiz:

### Outputs und Verträge

15. [x] Ref 15 - Grafana User/Password nicht als Output
        Review-Thema: Zugangsdaten sollen nicht als Terraform-Output exponiert werden.
        Vorgeschlagene Lösung: Sensitive Outputs entfernen; Zugriff über Secrets Manager bzw. dokumentierten Abrufpfad.
        Entscheidung: [x] Vorschlag umsetzen [ ] Alternative wählen
        Alternative / Notiz:

16. [x] Ref 22 - Kubernetes-Output nur bei echter Nutzung
        Review-Thema: Output nur behalten, wenn es Downstream-Nutzung gibt.
        Vorgeschlagene Lösung: Nutzung nachweisen; ungenutzten Output entfernen oder klar als intern markieren.
        Entscheidung: [x] Vorschlag umsetzen [ ] Alternative wählen
        Alternative / Notiz:

17. [x] Ref 24 - Root Outputs auf Public Contract reduzieren
        Review-Thema: Teile in `src/outputs.tf` wirken ohne klaren Mehrwert.
        Vorgeschlagene Lösung: Outputs auf stabile Public-Contract-Schnitt minimieren; interne Felder streichen.
        Entscheidung: [x] Vorschlag umsetzen [ ] Alternative wählen
        Alternative / Notiz:

### Code-Style und Lesbarkeit

18. [x] Ref 18 - Single-use local entfernen
        Review-Thema: `local.effective_observability_instance_id` wird nicht wiederverwendet.
        Vorgeschlagene Lösung: Ausdruck inline setzen, nur mehrfach genutzte locals behalten.
        Entscheidung: [x] Vorschlag umsetzen [ ] Alternative wählen
        Alternative / Notiz:

19. [x] Ref 19 - depends_on ans Ressourcenende
        Review-Thema: Lesbarkeit nach HashiCorp-Style.
        Vorgeschlagene Lösung: Betroffene Ressourcen so umordnen, dass `depends_on` am Ende steht.
        Entscheidung: [x] Vorschlag umsetzen [ ] Alternative wählen
        Alternative / Notiz:

20. [x] Ref 20 - Maintenance-Zuweisung vereinfachen
        Review-Thema: 1:1 Mapping ist unnötig komplex.
        Vorgeschlagene Lösung: Direktzuweisung `maintenance = var.cluster.maintenance`, sofern Typen kompatibel sind.
        Entscheidung: [x] Vorschlag umsetzen [ ] Alternative wählen
        Alternative / Notiz:

21. [x] Ref 21 - Ausdruck für SSH-Key-Fallback vereinfachen
        Review-Thema: Der `try(trimspace(...), file(...))`-Ausdruck kann lesbarer sein.
        Vorgeschlagene Lösung: Ausdruck gemäß Vorschlag refactoren und mit Input-Validation kombinieren.
        Entscheidung: [x] Vorschlag umsetzen [ ] Alternative wählen
        Alternative / Notiz:

22. [x] Ref 14 - Naming-Konvention für Suffixe vereinheitlichen
        Review-Thema: Suffix `-obs` ist inkonsistent.
        Vorgeschlagene Lösung: Einheitliche Suffix-Strategie festlegen (`ohne`, `-default` oder `-common`) und referenzkonsistent umsetzen.
        Entscheidung: [x] Vorschlag umsetzen [ ] Alternative wählen
        Alternative / Notiz:

## Vorschlag für Umsetzung in Wellen

1. **Welle A (sicher, low risk)**: 18, 19, 20, 21, 14, 13
2. **Welle B (API/Contract Changes)**: 01/02/03, 16/17/23, 28, 24, 27
3. **Welle C (Security/Architecture)**: 04, 05, 11, 12, 15, 22, 25/26, 06, 07, 10

## Entscheidungsprotokoll

- Datum: 17.06.2026
- Teilnehmer: Lukas Weberruß
- Beschluss pro Ref-Gruppe: Alle Themen werden umgesetzt. Bei Ref 04 erfolgt die Umsetzung als Gateway API Controller mit Envoy Gateway.
- Offene Fragen:
- Nächster Implementierungs-PR:
