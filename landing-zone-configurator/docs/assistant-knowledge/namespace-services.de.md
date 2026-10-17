<a id="kubernetes-namespace-services-and-secret-enforcement"></a>

# Kubernetes-Namespace-Services und Secret-Durchsetzung

[English](namespace-services.md) | [Deutsch](namespace-services.de.md)

Deutsche Lesefassung. Der Assistant liest ausschliesslich die englische Quelle.

<a id="purpose"></a>

## Zweck

Unterstuetzte Namespace-Bereiche je Landing Zone, begrenzten
Kubernetes-Zugang, optionale Secrets-Manager-Integration und explizit
gewaehlte Policy-/Demo-Services bereitstellen.

<a id="accelerator-contract"></a>

## Accelerator-Vertrag

Natives `landing_zone_namespace_services` verwendet bestehende
Landing-Zone-Schluessel.
Felder umfassen `namespace/dns_subdomain`, `kubernetes_access`,
`secretsmanager`, `secrets_enforcement` (`mode` und `break_glass`),
`labels/annotations`, `sample_load`, `demo_enabled`,
`demo_metrics_ingestion`.
Root leitet Namen/Referenzen ab und erstellt unterstuetzte
Kubernetes-/Helm-Objekte.
Kyverno-Policy-Modi und Ausnahmen folgen tatsaechlichem Quellverhalten,
keinen erfundenen universellen Isolationsgarantien.
Aktueller Namespace-Root-Code referenziert Ein-Region-Plattform-/Projekt-
Modulpfade; aus regionaler SKE-Unterstuetzung keine Multi-Region-
Namespace-Paritaet ableiten.

<a id="dependencies"></a>

## Abhaengigkeiten

Unterstuetzter Plattform-Kubernetes-/Provider-Zugang und bestehende
Projekttemplates.
DNS/Gateway, Secrets Manager, Observability und Demos haben verschiedene
Voraussetzungen.
Ein Kubernetes-Namespace ist kein eigenes Cloud-Projekt, VM-Netz oder Firewall.

<a id="dialogue"></a>

## Dialog

Namespace-Tenancy, Service-Account-Zugriff, externen Secret-Fluss,
Audit- versus Durchsetzungsbedarf und eng begrenzte Break-Glass-
Vorgaenge erfragen.
Beispiel-Workloads, oeffentliche Demo-Routen, Ingestion oder Monitoring
nicht nur zur Demonstration eines Produktionsfeatures aktivieren.
Labels/Policies getrennt bestaetigen.

<a id="examples"></a>

## Beispiele

Synthetische Deaktivierung: `landing_zone_namespace_services = {}`.
Ein aktivierter Eintrag muss auf einen echten Landing-Zone-Schluessel
verweisen.
Explizite Demo-/`sample_load`-Zustimmung bleibt von Namespace- und
Service-Account-Anforderungen getrennt.

<a id="limits"></a>

## Grenzen

Native Editor-Vorschlaege unterstuetzen gepruefte oeffentliche
Namespace-Einstellungen, keine kubeconfig-Werte oder Secret-Materialien.
Annahme aendert einen lokalen Entwurf.
Policy-Audit ist keine Durchsetzung; unterstuetzte Strict-/andere Modi
muessen gegen ihre tatsaechlichen Match-/Ausnahmeregeln geprueft werden.
Break-Glass-TTL-Einstellungen beweisen keinen operativen Entzug.
Kubernetes-/Helm-Erreichbarkeit, RBAC, Secret-Fluss und Demo-Verhalten
benoetigen getrennte Integrations- und Laufzeittests.

<a id="credentials"></a>

## Zugangsdaten

Kubernetes-Provider-Zugang und Secret-Service-Bindungen bleiben extern
lieferbar und geschuetzt.
Niemals kubeconfigs, Service-Account-Tokens, Secret-Werte oder
Dashboard-Passwoerter dem Modell oder in Beispielfragmenten offenlegen.

<a id="sources"></a>

## Quellen

Namespace-Root-Code, Demo-Variablen, Provider und gemeinsame
Referenzvalidierung sind Manifest-Quellen.
Policy-Modi, Provider-Auswahl und regionale Grenzen vor Generierung erneut
pruefen; Demos qualifizieren keine produktive Tenant-Isolation.
