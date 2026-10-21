<a id="getting-started"></a>
# Erste Schritte

[English](getting-started.md) | [Deutsch](getting-started.de.md)

Diese Anleitung führt Sie durch die Bereitstellung der STACKIT Landing Zone von Grund auf.

> [!NOTE]
> Die Module in diesem Terraform-Repository sind nicht zur direkten Nutzung vorgesehen. Klonen Sie das Repository und passen Sie die Module an Ihre konkreten Anforderungen an. Es gibt keine Garantien für Migrationspfade oder dafür, dass die Module unverändert bleiben.

<a id="prerequisites"></a>
## Upgrade von Bucket-Namen und Observability-Einstellungen

Bucket-Namen gelten STACKIT-weit. Der Standard `bucket_naming = "project-id"`
enthält jetzt die vollständige ID des jeweiligen Management- oder Anwendungsprojekts.
Nur der lesbare Präfix wird auf insgesamt höchstens 63 Zeichen gekürzt.
Die State-Adressen bleiben stabil, Bucket-Namen sind jedoch unveränderlich:
**Vor dem Upgrade einer Installation mit vorhandenen bisherigen Bucket-Namen
`bucket_naming = "legacy"` setzen**, sofern keine separate Ersetzung bzw.
Daten-/Backend-Migration geprüft wurde. Es gibt keine automatische Datenmigration
oder State-Neuanlage. Ein teilweise ausgeführtes Deployment ohne Buckets kann
Projekt und Checkpoint mit dem neuen Standard beibehalten. Vor Apply einen neuen
vollständigen Plan prüfen.
Siehe [Issue #127](https://github.com/stackitcloud/stackit-landing-zone/issues/127).

Zentrale Observability-Aufbewahrungswerte sind optional/null und verwenden sonst
die Servicestandards. Monitoring unterstützt keine Logs-/Trace-Aufbewahrung;
Frontend und MetricsEndpoint keine Aufbewahrungsüberschreibungen. Explizite Werte
müssen innerhalb der Servicegrenzen liegen (ganze Tage: Logs/Traces 1–30,
Metriken/Downsampling 1–780). Das native Root weist diese unzulässigen Kombinationen
vor der Ressourcenbereitstellung zurück.

## Voraussetzungen

- Eine **STACKIT-Organisation**, in der Ihr Benutzerkonto registriert ist
- **Owner-Berechtigungen** auf der STACKIT-Organisation
- Installierte **STACKIT CLI** ([Installationsanleitung](https://github.com/stackitcloud/stackit-cli/blob/main/INSTALLATION.md))
- Installiertes **OpenTofu** (>= 1.10) oder **Terraform** (>= 1.10)
- **`bash`, `curl` und `jq`** auf dem Rechner, auf dem OpenTofu läuft, nur für die Variante Hub-Spoke + Firewall. API-Schlüssel-Bootstrap und HA-Konfiguration sind Shell-Provisioner; die HA-Skripte verwenden `jq`

> [!NOTE]
> Diese Anleitung verwendet durchgehend `tofu`-Befehle. Wenn Sie Terraform verwenden, ersetzen Sie `tofu` durch `terraform` – alle Befehle funktionieren identisch.

<a id="deployment-flavours"></a>
## Bereitstellungsvarianten

Unter `src/config/` stehen acht vollständige, einsatzbereite Konfigurationen bereit:

| Variante | Konfigurationsdatei | Beschreibung |
| --- | --- | --- |
| **Standalone** | `standalone.tfvars` | Nur Governance, Management, DevOps und öffentliche Landing Zones. Keine Network Area oder Firewall. |
| **Hub-Spoke** | `hub-and-spoke.tfvars` | Ergänzt einen Connectivity-Hub mit Network Area und DNS-Zonen. Corporate Landing Zones verbinden sich über die Network Area. |
| **Hub-Spoke + Firewall** | `hub-and-spoke-firewall.tfvars` | Vollständige Hub-Spoke-Topologie mit einer OPNsense-Firewall-Appliance an der WAN-/LAN-Grenze. |
| **Regulated and Shared** | `hub-and-spoke-multi-area.tfvars` | Trennt regulierte Workloads von gemeinsam genutzten Workloads mit unterschiedlichen Sicherheitsanforderungen. |
| **Finance and Research** | `hub-and-spoke-finance-research.tfvars` | Isoliert Geschäftsbereiche mit unterschiedlichen Eigentümern, Adressplänen und Konnektivitätsanforderungen. |
| **Prod/Nonprod + Firewalls** | `hub-and-spoke-prod-nonprod-firewall.tfvars` | Dedizierte SNAs und OPNsense-Appliances für Produktion und Nichtproduktion. |
| **Tenant Isolation** | `hub-and-spoke-tenant-isolation.tfvars` | Trennt drei Mandanten, die eine gemeinsame unternehmensweite STACKIT-Organisation nutzen. |
| **Multi-Region** | `hub-and-spoke-multi-region.tfvars` | Stellt unabhängige Connectivity-Hubs, Landing Zones und Platform-Kubernetes-Cluster in `eu01` und `eu02` bereit. |

Wählen Sie die Variante, die Ihren Anforderungen entspricht, und passen Sie die entsprechende `.tfvars`-Datei vor der Bereitstellung an (Schritt 7). Aktualisieren Sie mindestens `owner_email`, `organization_id`, `company_name` und `company_code`.

Die Multi-SNA-Szenariodateien sind vollständige Konfigurationen. Ersetzen Sie vor dem Anwenden die Platzhalterwerte für `owner_email`, `company_name`, `company_code` und `organization_id`. Die Area-Schlüssel sind nur Beispiele; wählen Sie stabile Schlüssel passend zu Ihrer Grenze. Entscheidungshilfen und Einschränkungen stehen unter [Mehrere Network Areas](architecture.de.md#multiple-network-areas).

Das Szenario Prod/Nonprod + Firewalls erstellt eine Appliance pro SNA. Seine OPNsense-Richtlinien müssen derzeit nach dem Bootstrap für jede Appliance konfiguriert werden; der einzelne `firewall_config`-Block wird nicht automatisch verteilt.

Die Firewall-Variante benötigt einen zusätzlichen Schritt: Die Appliance startet unkonfiguriert, ihre Richtlinie wird in einem zweiten Apply aus dem anfangs auskommentierten `firewall_config`-Block derselben `.tfvars`-Datei übertragen. Bis dahin filtert sie nichts, und ihre Web-GUI ist aus dem Internet erreichbar – siehe [OPNsense-Firewall konfigurieren](#configure-opnsense-firewall). Standardmäßig wird eine einzelne Appliance bereitgestellt, die als Standardroute jeder Corporate Landing Zone ein Single Point of Failure ist. Der auskommentierte Block `connectivity.firewall.ha` macht daraus ein aktives/passives CARP-Paar – siehe [Firewall hochverfügbar machen](#make-the-firewall-highly-available).

Beide Hub-Spoke-Varianten können zusätzlich ein Site-to-Site-IPsec-VPN im Hub terminieren. Es ist standardmäßig deaktiviert – siehe den auskommentierten Block `connectivity.vpn` in der `.tfvars`-Datei und [Site-to-Site-VPN](architecture.de.md#site-to-site-vpn-optional). Lesen Sie bei Verwendung der Firewall-Variante zuerst, [welchen Verkehr die Firewall tatsächlich sieht](architecture.de.md#what-goes-through-the-firewall), bevor Sie sich bei der VPN-Inspektion auf sie verlassen.

> [!NOTE]
> Dieser Ansatz mit einem einzelnen Root-Modul eignet sich gut für kleinere Umgebungen. Bei größerem Umfang – typischerweise über 10 Landing Zones – können STACKIT-API-Ratenlimits bei Applies sowie langsamere Plan-/Refresh-Zyklen durch eine wachsende State-Datei auftreten. Werkzeuge wie [Terragrunt](https://terragrunt.gruntwork.io/), [Terramate](https://terramate.io/) oder [Spacelift](https://spacelift.io/) können helfen, indem sie Landing Zones in isolierte State-Dateien aufteilen und Root-Modulaufrufe mit geeigneter Parallelitätssteuerung orchestrieren. Wenden Sie sich bei einer größeren Unternehmensbereitstellung an [STACKIT](https://stackit.de) oder einen Partner mit verifizierter Landing-Zone-Lösung im [STACKIT Marketplace](https://marketplace.stackit.cloud/de/catalog?marketplaceFilters=industries:Service%20%26%20IT%20Provider,deliveryMethod:PROFESSIONAL_SERVICE,categories:DevOps).

---

<a id="step-by-step-deployment"></a>
## Schrittweise Bereitstellung

<a id="1-clone-the-repository"></a>
### 1. Repository klonen

```bash
git clone https://github.com/stackitcloud/stackit-landing-zone.git
cd stackit-landing-zone/src
```

<a id="2-download-the-opnsense-firewall-image-hub-spoke--firewall-only"></a>
### 2. OPNsense-Firewall-Image herunterladen (nur Hub-Spoke + Firewall)

Wenn Sie die Variante Hub-Spoke + Firewall bereitstellen, laden Sie das OPNsense-Image in das Verzeichnis `src/` herunter:

```bash
curl -o firewall-image.qcow2 https://opnsense.object.storage.eu01.onstackit.cloud/opnsense-26.1-amd64-21-05-2026.qcow2
```

<a id="3-authenticate-with-stackit"></a>
### 3. Bei STACKIT authentifizieren

Melden Sie sich interaktiv über den Browser an:

```bash
stackit auth login
```

<a id="4-create-a-temporary-bootstrap-project"></a>
### 4. Vorübergehendes Bootstrap-Projekt erstellen

Ein kurzlebiges Projekt wird benötigt, um das erste Dienstkonto für die Terraform-/OpenTofu-Authentifizierung zu erstellen:

```bash
# get the organization id
stackit organization list

# create the project
stackit project create --name tmp-bootstrap --parent-id <ORGANIZATION_ID>
```

Notieren Sie die `project_id` aus der Ausgabe.

<a id="5-create-a-bootstrap-service-account"></a>
### 5. Bootstrap-Dienstkonto erstellen

```bash
stackit service-account create --name bootstrap-sa --project-id <PROJECT_ID>

# Grant the service account owner permissions at the organization level so it can provision all resources:
stackit organization member add <SERVICE_ACCOUNT_EMAIL> --role organization.owner --organization-id <ORGANIZATION_ID>
```

<a id="6-configure-service-account-credentials"></a>
### 6. Dienstkonto-Zugangsdaten konfigurieren

Erstellen Sie einen Dienstkontoschlüssel und konfigurieren Sie ihn für den STACKIT-Terraform-Provider:

```bash
mkdir -p ~/.stackit
stackit service-account key create --email <SERVICE_ACCOUNT_EMAIL> --project-id <PROJECT_ID> -y --verbosity error > ~/.stackit/credentials.json

export STACKIT_SERVICE_ACCOUNT_KEY_PATH=/home/<USER>/.stackit/credentials.json
```

> [!IMPORTANT]
> `STACKIT_SERVICE_ACCOUNT_KEY_PATH` muss über Terminalsitzungen hinweg erhalten bleiben.

> [!NOTE]
> `~` funktioniert nicht als Referenz auf das Home-Verzeichnis. Bei Verwendung von mise können Sie den Export von `STACKIT_SERVICE_ACCOUNT_KEY_PATH` weglassen.

Alle unterstützten Authentifizierungsmethoden finden Sie in der [Dokumentation des STACKIT-Terraform-Providers](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs).

<a id="7-configure-variables"></a>
### 7. Variablen konfigurieren

Kopieren und bearbeiten Sie die `.tfvars`-Datei passend zu Ihrem Bereitstellungsszenario:

```bash
cp config/standalone.tfvars terraform.auto.tfvars
```

Passen Sie die Werte an Ihre Organisation an. Erforderliche Variablen:

| Variable | Beschreibung |
| --- | --- |
| `owner_email` | In STACKIT registrierte E-Mail-Adresse des technischen Eigentümers |
| `company_name` | Unternehmensname für die Ordnerbenennung |
| `company_code` | Kurzes Präfix für Ressourcennamen (z. B. `exc`) |
| `organization_id` | ID des Root-Organisationscontainers |

<a id="8-initialize-opentofuterraform"></a>
### 8. OpenTofu/Terraform initialisieren

```bash
tofu init
```

<a id="9-deploy-the-landing-zone"></a>
### 9. Landing Zone bereitstellen

Wenn Sie den Block `connectivity.vpn` aktiviert haben, exportieren Sie zuerst die Pre-Shared Keys als Umgebungsvariable. Sie werden bewusst nicht in den `tfvars` gespeichert:

```bash
export TF_VAR_vpn_pre_shared_keys='{"onprem"={"tunnel1"="<20+ chars>","tunnel2"="<20+ chars>"}}'
```

> [!NOTE]
> Wenn Sie die mitgelieferte OPNsense-Firewall bereitstellen, folgen Sie anschließend unbedingt [OPNsense-Firewall konfigurieren](#configure-opnsense-firewall). Bis dahin filtert die Appliance nichts und ihre Web-GUI antwortet auf der öffentlichen IP.

Führen Sie in jedem Fall OpenTofu aus, um die Infrastruktur bereitzustellen:

```bash
tofu apply
```

Prüfen Sie den Plan und bestätigen Sie mit `yes`.

> [!NOTE]
> Falls Sie Ihre tfvars-Datei nicht mit dem Suffix `.auto.tfvars` kopiert haben, geben Sie sie ausdrücklich an: `tofu apply -var-file ./config/<flavor>.tfvars`

---

<a id="migrating-state-to-the-created-backend"></a>
## State in das erstellte Backend migrieren

Nach dem ersten erfolgreichen Apply hat das Management-Modul einen S3-Bucket für Remote-State und ein Dienstkonto für die laufende Automatisierung erstellt. Migrieren Sie zu diesem Backend, um Zusammenarbeit im Team zu ermöglichen.

<a id="10-enable-the-s3-backend"></a>
### 10. S3-Backend aktivieren

Entfernen Sie die Auskommentierung des Blocks `backend "s3"` in `backend.tf` und passen Sie den Namen `bucket` an die Terraform-Ausgabe `management_bucket_name_tfstate` an:

```hcl
terraform {
  backend "s3" {
    bucket = "<MANAGEMENT_BUCKET_NAME_TFSTATE>"
    endpoints = {
      s3 = "https://object.storage.eu01.onstackit.cloud"
    }
    key                         = "terraform.tfstate"
    region                      = "eu01"
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
  }
}
```

Navigieren Sie im STACKIT Portal zum Management-Projekt → Secrets Manager → Secrets. Öffnen Sie das Secret mit dem Präfix `object_storage_credentials_` und kopieren Sie die Werte `ACCESS_KEY` und `SECRET_ACCESS_KEY`.

Setzen Sie die S3-Backend-Zugangsdaten:

```bash
export AWS_ACCESS_KEY_ID=<ACCESS_KEY>
export AWS_SECRET_ACCESS_KEY=<SECRET_ACCESS_KEY>
```

> [!IMPORTANT]
> Diese Werte müssen über Terminalsitzungen hinweg erhalten bleiben.

<a id="11-migrate-state"></a>
### 11. State migrieren

```bash
tofu init -migrate-state
```

Bestätigen Sie die Migration, wenn Sie dazu aufgefordert werden.

<a id="12-switch-to-the-management-service-account"></a>
### 12. Zum Management-Dienstkonto wechseln

Ersetzen Sie die Bootstrap-Zugangsdaten durch das vom Management-Modul erstellte Dienstkonto.

Navigieren Sie im STACKIT Portal zum Management-Projekt → Secrets Manager → Secrets. Öffnen Sie das Secret mit dem Präfix `service_account_key_`, kopieren Sie seinen Wert und speichern Sie ihn unter `/home/<USER>/.stackit/credentials.json`, wobei die Bootstrap-Zugangsdaten überschrieben werden.

> [!NOTE]
> Verwenden Sie den absoluten Pfad – `~` funktioniert hier nicht.

<a id="13-verify-the-migration"></a>
### 13. Migration prüfen

Führen Sie einen Plan aus, um zu bestätigen, dass keine Änderungen erkannt werden:

```bash
tofu plan
```

Die Ausgabe sollte `No changes. Your infrastructure matches the configuration.` zeigen.

> [!NOTE]
> Falls Sie Ihre tfvars-Datei nicht mit dem Suffix `.auto.tfvars` kopiert haben, geben Sie sie ausdrücklich an: `tofu plan -var-file ./config/<flavor>.tfvars`

---

<a id="cleanup"></a>
## Aufräumen

<a id="14-delete-the-bootstrap-project"></a>
### 14. Bootstrap-Projekt löschen

Das vorübergehende Bootstrap-Projekt mit dem Dienstkonto wird nicht mehr benötigt:

```bash
stackit project delete --project-id <BOOTSTRAP_PROJECT_ID>
```

> [!NOTE]
> Resource-Manager-Ordner können erst 7 Tage nach dem Entfernen des letzten enthaltenen Projekts gelöscht werden. Ein `tofu apply` mit anschließendem `tofu destroy` schlägt daher fehl – Destroy meldet beim Löschen der Ordner einen Fehler, solange Projekte noch innerhalb ihrer Aufbewahrungsfrist liegen.

---

<a id="post-deployment-optional"></a>
## Nach der Bereitstellung (optional)

<a id="configure-opnsense-firewall"></a>
### OPNsense-Firewall konfigurieren

Schritt 9 startet die Appliance, lässt sie aber unkonfiguriert: Sie filtert nichts, und ihre Web-GUI antwortet auf der öffentlichen IP. Das Übertragen einer Richtlinie ist ein **zweites Apply**, da der API-Schlüssel aus der Appliance-Anmeldung abgeleitet wird und eine Provider-Konfiguration aufgelöst sein muss, bevor eine Ressource geplant wird. Ein während eines Apply erstellter Schlüssel kann den Provider daher nicht im selben Lauf konfigurieren.

Was die Richtlinie bewirkt und welche Verkehrsrichtungen sie tatsächlich sehen kann, steht unter [Welcher Verkehr durch die Firewall fließt](architecture.de.md#what-goes-through-the-firewall).

> [!NOTE]
> Die Richtlinie wird mit dem Provider [`browningluke/opnsense`](https://registry.terraform.io/providers/browningluke/opnsense/latest/docs) übertragen. Er bildet das erweiterte Leseformat von OPNsense auf das Geschriebene zurück ab, sodass In-place-Updates und Drift-Erkennung funktionieren – der generische Provider `Mastercard/restapi` kann das nicht und macht Objekte faktisch nur einmal beschreibbar. Der Provider wird von der Community gepflegt und sein Autor rät vom Produktionseinsatz ab; berücksichtigen Sie dies, bevor Sie sich darauf verlassen.

**1. Richtlinie aktivieren**

Entfernen Sie die Auskommentierung des Blocks `firewall_config` in `config/hub-and-spoke-firewall.tfvars`. Er enthält Standardregeln: Internet-Egress mit NAT, Spoke-zu-Spoke auf HTTPS und ICMP beschränkt sowie die zwei Floating-Regeln, die die Web-GUI aus dem Internet nehmen.

Zwei Einträge benötigen Ihre Werte:

```hcl
# Public: OpenTofu runs outside the Network Area* — a workstation, or a CI runner on the public internet. This is the normal case for a first deployment, because nothing is inside the area yet. Traffic goes over the appliance's public address:

endpoint      = "https://<connectivity_firewall_public_ip>" # get it from running "tofu output connectivity_firewall_public_ip"
fw_management = {
  content = ["10.0.0.0/16", "<your public address>/32"] # get it eg by running "curl -s https://ifconfig.me" or better use a fixed ip range
}


# Private: OpenTofu runs inside the Network Area* — a CI runner in a landing zone, a jumphost, or an established site-to-site VPN. Nothing to look up: the LAN address is the default, and your source address is already covered by `10.0.0.0/16`:

# omit endpoint
fw_management = {
  content = ["10.0.0.0/16"]
}
```

> [!WARNING]
> Das System, das OpenTofu ausführt, muss vor diesem Apply vom Alias `fw_management` abgedeckt sein. Andernfalls trennt derselbe Lauf, der die GUI schließt, seinen eigenen API-Zugriff; die Wiederherstellung erfolgt über die serielle Konsole (`stackit server console <server-id> --project-id <connectivity-project-id>`).
>
> Eine dynamische Privat- oder Büroadresse ändert sich irgendwann und sperrt einen späteren Lauf aus.

**2. API-Schlüssel bootstrappen, dann Richtlinie übertragen**

```bash
tofu apply -var firewall_bootstrap=true && tofu apply -var firewall_bootstrap=true
```

Das erste `tofu apply` leitet den API-Schlüssel ab (und wartet dabei auf den Abschluss des mehrminütigen Appliance-Starts) und speichert ihn in `src/.firewall-api-credentials.json`, das von Git ignoriert wird. Das zweite `tofu apply` speichert ihn im Management-Secrets-Manager und überträgt Aliase, statische Routen, Regeln und NAT.

Zwei Läufe sind unvermeidbar: Der Provider benötigt den Schlüssel zur Plan-Zeit, und ein während eines Apply erstellter Wert kann keinen Provider im selben Lauf konfigurieren.

Die verwendete Appliance-Anmeldung stammt aus `firewall_admin_password`, standardmäßig dem im STACKIT-OPNsense-Image hinterlegten `root`-Passwort. Für eine neue Bereitstellung muss deshalb nichts exportiert werden.

> [!IMPORTANT]
> Ändern Sie das Passwort auf der Appliance (**System → Access → Users**). Das Passwort wird nur zur Ableitung des API-Schlüssels verwendet. Sobald der Schlüssel existiert, wird es überhaupt nicht mehr gelesen.

**3. Bootstrap-Variable weglassen und Cache-Datei löschen**

Ab jetzt ist jedes Apply ein einfaches `tofu apply` ohne Variablen:

```bash
rm src/.firewall-api-credentials.json
tofu apply
```

**Schlüssel rotieren**

Ein erneuter Bootstrap widerruft jeden vorhandenen API-Schlüssel auf der Appliance und erstellt einen neuen. Dadurch wird die Kopie im Secrets Manager sofort ungültig. Der Folgeschritt ist deshalb nicht optional: Erhöhen Sie `firewall_api_secret_version` um eins, damit der neue Schlüssel geschrieben wird. Ohne diese Erhöhung schlägt der Lauf mit 401 fehl, statt unbemerkt einen unbrauchbaren Schlüssel zu behalten.

```bash
rm -f src/.firewall-api-credentials.json
tofu apply -var firewall_bootstrap=true   # mints the new key
# bump firewall_api_secret_version in your tfvars, then
tofu apply -var firewall_bootstrap=true   # writes it to the Secrets Manager
rm src/.firewall-api-credentials.json
```

<a id="make-the-firewall-highly-available"></a>
### Firewall hochverfügbar machen

Eine einzelne Appliance ist die Standardroute jeder Corporate Landing Zone; ihr Ausfall nimmt daher die Plattform offline. Entfernen Sie die Auskommentierung des Blocks `ha` in `connectivity.firewall`, um eine zweite Appliance in einer anderen Availability Zone als aktives/passives CARP-Paar bereitzustellen:

```hcl
ha = {
  backup_zone = "eu01-1" # must differ from firewall.zone
}
```

`tofu apply` erledigt anschließend den Rest. Es stellt das Backup bereit, meldet sich auf beiden Appliances an und schreibt deren knotenspezifische CARP-Einstellungen (Backup zuerst, Primary zuletzt, damit der Primary die Wahl gewinnt). Außerdem ergänzt es den Alias `fw_cluster` und die Regeln `allow-fw-carp` und `allow-fw-pfsync` in der Richtlinie – sie werden automatisch eingefügt, in den `.tfvars` ist nichts zu ergänzen.

Zwei Folgen sollten Sie vor der Aktivierung kennen:

- **Die Landing-Zone-Routen ändern sich.** `firewall_next_hop_ip` wird zur virtuellen CARP-IP (`.6` von `lan_network_range`) statt zur LAN-Adresse des Primary. Jede Corporate Landing Zone erhält deshalb im selben Apply eine umgeschriebene Standardroute. Rechnen Sie während der Routenaktualisierung mit einer kurzen Unterbrechung.
- **Die öffentliche IP führt kein Failover durch.** STACKIT bindet eine öffentliche IP 1:1 an eine NIC. Egress vom Backup wird auf dessen eigene Adresse übersetzt. Eingehende Portweiterleitungen bleiben auf dem Primary, bis Sie DNS auf `tofu output connectivity_firewall_backup_public_ip` umstellen. Langlebige ausgehende Verbindungen brechen für die Dauer eines Ausfalls ab; neue erholen sich innerhalb von Sekunden.

Was genau umschaltet und was gemessen wurde, steht unter [Hochverfügbarkeit](architecture.de.md#high-availability-optional).

> [!IMPORTANT]
> Die Backup-Appliance startet mit demselben Image-Standardpasswort wie der Primary, und ihre Web-GUI antwortet auf ihrer eigenen öffentlichen IP, bis die Richtlinie übertragen ist. Die obige Aussperrwarnung gilt für beide Knoten.

<a id="kubernetes-dns-automation-for-gateway-api-resources"></a>
### Kubernetes: DNS-Automatisierung für Gateway-API-Ressourcen

Native Unterstützung für `extensions.dns.gateway_api` ist seit v0.109.0 im STACKIT-Terraform-Provider verfügbar und standardmäßig aktiviert, sobald die SKE-DNS-Erweiterung mindestens eine Zone hat. Deaktivieren Sie sie ausdrücklich, wenn der Cluster keine Gateway-API-Ressourcen verwendet:

```hcl
platform_kubernetes = {
  my-cluster = {
    dns = {
      enabled     = true
      gateway_api = false
    }
    # ...
  }
}
```

Mit dem Standard `gateway_api = true` konfiguriert die SKE-DNS-Erweiterung ExternalDNS automatisch für Gateway-API-Ressourcen (`Gateway`, `HTTPRoute`). Sie müssen DNS-Einträge oder LoadBalancer-Endpunkte nicht mehr manuell verwalten beziehungsweise ermitteln.

> [!NOTE]
> Die SKE-DNS-Erweiterung installiert keine Gateway-API-CRDs. Die optionale Envoy-Gateway-Demo installiert sie automatisch. Installieren Sie für andere Gateway-API-Implementierungen kompatible CRDs separat. Sobald die CRDs verfügbar sind, wird ExternalDNS beim nächsten Cluster-Reconcile konfiguriert; ein zusätzliches OpenTofu-Apply ist nicht erforderlich.
