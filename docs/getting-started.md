# Getting Started

This guide walks you through deploying the STACKIT Landing Zone from scratch.

> [!NOTE]
> The modules in this Terraform repository are not intended to be used directly. Clone the repository and adjust the modules to your specific requirements. No guarantees are made about migration paths or that the modules will remain unchanged.

## Prerequisites

- A **STACKIT organization** with your user account registered
- **Owner permissions** on the STACKIT organization
- **STACKIT CLI** installed ([Installation guide](https://github.com/stackitcloud/stackit-cli/blob/main/INSTALLATION.md))
- **OpenTofu** (>= 1.10) or **Terraform** (>= 1.10) installed
- **`bash`, `curl` and `jq`** on the machine running OpenTofu, for the Hub-Spoke + Firewall flavour only. The API key bootstrap and the HA configuration are shell provisioners; `jq` is used by the HA scripts

> [!NOTE]
> This guide uses `tofu` commands throughout. If you are using Terraform, replace `tofu` with `terraform` — all commands work identically.

## Deployment Flavours

Three ready-to-use configurations are provided in `src/config/`:

| Flavour                  | Config file                     | Description                                                                                                      |
| ------------------------ | ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Standalone**           | `standalone.tfvars`             | Governance, management, devops, and public landing zones only. No network area or firewall.                      |
| **Hub-Spoke**            | `hub-and-spoke.tfvars`          | Adds a connectivity hub with a network area and DNS zones. Corporate landing zones connect via the network area. |
| **Hub-Spoke + Firewall** | `hub-and-spoke-firewall.tfvars` | Full hub-spoke topology with an OPNsense firewall appliance on the WAN/LAN boundary.                             |

Choose the flavour that matches your requirements and adjust the corresponding `.tfvars` file before deployment (step 7). At a minimum, update `owner_email`, `organization_id`, `company_name`, and `company_code`.

The firewall flavour takes one extra step: the appliance boots unconfigured and its policy is pushed in a second apply, from the `firewall_config` block that ships commented out in the same `.tfvars` file. Until then it filters nothing and its web GUI is reachable from the internet — see [Configure OPNsense firewall](#configure-opnsense-firewall). It deploys a single appliance by default, which is the default route of every corporate landing zone and therefore a single point of failure; the commented `connectivity.firewall.ha` block turns it into an active/passive CARP pair — see [Make the firewall highly available](#make-the-firewall-highly-available).

Both hub-spoke flavours can additionally terminate a site-to-site IPsec VPN in the hub. It is disabled by default — see the commented `connectivity.vpn` block in the `.tfvars` file and [Site-to-Site VPN](architecture.md#site-to-site-vpn-optional). If you deploy the firewall flavour, read [what traffic the firewall actually sees](architecture.md#what-goes-through-the-firewall) before relying on it for VPN inspection.

> [!NOTE]
> This single-root-module approach works well for smaller environments. At larger scale — typically beyond 10 landing zones — you may encounter STACKIT API rate limits during applies and slower plan/refresh cycles due to a growing state file. Tools like [Terragrunt](https://terragrunt.gruntwork.io/), [Terramate](https://terramate.io/), or [Spacelift](https://spacelift.io/) can help by splitting landing zones into isolated state files and orchestrating root module calls with proper concurrency controls. If you are planning a larger enterprise deployment, reach out to [STACKIT](https://stackit.de) or a partner offering a verified landing zone solution via the [STACKIT Marketplace](https://marketplace.stackit.cloud/de/catalog?marketplaceFilters=industries:Service%20%26%20IT%20Provider,deliveryMethod:PROFESSIONAL_SERVICE,categories:DevOps).

---

## Step-by-Step Deployment

### 1. Clone the repository

```bash
git clone https://github.com/stackitcloud/stackit-landing-zone.git
cd stackit-landing-zone/src
```

### 2. Download the OPNsense firewall image (Hub-Spoke + Firewall only)

If you are deploying the Hub-Spoke + Firewall flavour, download the OPNsense image into the `src/` directory:

```bash
curl -o firewall-image.qcow2 https://opnsense.object.storage.eu01.onstackit.cloud/opnsense-26.1-amd64-21-05-2026.qcow2
```

### 3. Authenticate with STACKIT

Log in interactively via browser:

```bash
stackit auth login
```

### 4. Create a temporary bootstrap project

A short-lived project is needed to create the initial service account for Terraform/OpenTofu authentication:

```bash
# get the organization id
stackit organization list

# create the project
stackit project create --name tmp-bootstrap --parent-id <ORGANIZATION_ID>
```

Note the `project_id` from the output.

### 5. Create a bootstrap service account

```bash
stackit service-account create --name bootstrap-sa --project-id <PROJECT_ID>

# Grant the service account owner permissions at the organization level so it can provision all resources:
stackit organization member add <SERVICE_ACCOUNT_EMAIL> --role organization.owner --organization-id <ORGANIZATION_ID>
```

### 6. Configure service account credentials

Create a service account key and configure it for the STACKIT Terraform provider:

```bash
mkdir -p ~/.stackit
stackit service-account key create --email <SERVICE_ACCOUNT_EMAIL> --project-id <PROJECT_ID> -y --verbosity error > ~/.stackit/credentials.json

export STACKIT_SERVICE_ACCOUNT_KEY_PATH=/home/<USER>/.stackit/credentials.json
```

> [!IMPORTANT]
> `STACKIT_SERVICE_ACCOUNT_KEY_PATH` needs to be persisted across terminal sessions.

> [!NOTE]
> `~` does not work for referencing the home folder. If using mise, you can omit the `STACKIT_SERVICE_ACCOUNT_KEY_PATH` export.

Refer to the [STACKIT Terraform provider documentation](https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs) for all supported authentication methods.

### 7. Configure variables

Copy and edit the `.tfvars` file matching your chosen deployment flavour:

```bash
cp config/standalone.tfvars terraform.auto.tfvars
```

Update the values to match your organization. Required variables:

| Variable          | Description                                   |
| ----------------- | --------------------------------------------- |
| `owner_email`     | Technical owner email registered in STACKIT   |
| `company_name`    | Company name for folder naming                |
| `company_code`    | Short prefix for resource naming (e.g. `exc`) |
| `organization_id` | Root organization container ID                |

### 8. Initialize OpenTofu/Terraform

```bash
tofu init
```

### 9. Deploy the landing zone

If you enabled the `connectivity.vpn` block, export the pre-shared keys as an environment variable first. They are kept out of the `tfvars` on purpose:

```bash
export TF_VAR_vpn_pre_shared_keys='{"onprem"={"tunnel1"="<20+ chars>","tunnel2"="<20+ chars>"}}'
```

> [!NOTE]
> If you deploy the provided OPNsense firewall make sure to follow [Configure OPNsense firewall](#configure-opnsense-firewall) afterwards. Until then the appliance filters nothing and its web GUI answers on the public IP.

In any case run opentofu to deploy the infrastructure:

```bash
tofu apply
```

Review the plan and confirm with `yes`.

> [!NOTE]
> If you did not copy your tfvars file with the `.auto.tfvars` suffix, pass it explicitly: `tofu apply -var-file ./config/<flavor>.tfvars`

---

## Migrating State to the Created Backend

After the first successful apply, the management module has created an S3 bucket for remote state and a service account for ongoing automation. Migrate to this backend to enable team collaboration.

### 10. Enable the S3 backend

Uncomment the `backend "s3"` block in `backend.tf` and update the `bucket` name to match the Terraform output `management_bucket_name_tfstate`:

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

In the STACKIT Portal, navigate to the management project → Secrets Manager → Secrets. Open the secret prefixed with `object_storage_credentials_` and copy the `ACCESS_KEY` and `SECRET_ACCESS_KEY` values.

Set the S3 backend credentials:

```bash
export AWS_ACCESS_KEY_ID=<ACCESS_KEY>
export AWS_SECRET_ACCESS_KEY=<SECRET_ACCESS_KEY>
```

> [!IMPORTANT]
> These values need to be persisted across terminal sessions.

### 11. Migrate state

```bash
tofu init -migrate-state
```

Confirm the migration when prompted.

### 12. Switch to the management service account

Replace the bootstrap credentials with the service account created by the management module.

In the STACKIT Portal, navigate to the management project → Secrets Manager → Secrets. Open the secret prefixed with `service_account_key_`, copy its value and save it to `/home/<USER>/.stackit/credentials.json`, overwriting the bootstrap credentials.

> [!NOTE]
> Use the absolute path — `~` does not work here.

### 13. Verify the migration

Run a plan to confirm no changes are detected:

```bash
tofu plan
```

The output should show `No changes. Your infrastructure matches the configuration.`

> [!NOTE]
> If you did not copy your tfvars file with the `.auto.tfvars` suffix, pass it explicitly: `tofu plan -var-file ./config/<flavor>.tfvars`

---

## Cleanup

### 14. Delete the bootstrap project

The temporary bootstrap project with the service account is no longer needed:

```bash
stackit project delete --project-id <BOOTSTRAP_PROJECT_ID>
```

> [!NOTE]
> Resource Manager folders can only be deleted 7 days after the last project within them has been removed. Running `tofu apply` followed by `tofu destroy` will therefore fail — the destroy will error when attempting to delete the folders while projects are still within their retention period.

---

## Post-Deployment (Optional)

### Configure OPNsense firewall

Step 9 boots the appliance but leaves it unconfigured: it filters nothing and its web GUI answers on the public IP. Pushing a policy is a **second apply**, because the API key is derived from the appliance login and a provider configuration has to resolve before any resource is planned, so a key created during an apply cannot configure the provider in that same run.

What the policy does, and which traffic directions it can actually see, is in [What goes through the firewall](architecture.md#what-goes-through-the-firewall).

> [!NOTE]
> The policy is pushed with the [`browningluke/opnsense`](https://registry.terraform.io/providers/browningluke/opnsense/latest/docs) provider. It maps OPNsense's expanded read format back to what was written, so in-place updates and drift detection work — the generic `Mastercard/restapi` provider cannot do this and makes objects effectively write-once. It is community maintained and its author advises against production use, so weigh that before relying on it.

**1. Enable the policy**

Uncomment the `firewall_config` block in `config/hub-and-spoke-firewall.tfvars`. It comes with default rules: internet egress with NAT, spoke-to-spoke limited to HTTPS and ICMP, and the two floating rules that take the web GUI off the internet.

Two entries need your values:

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
> Whatever runs OpenTofu must be covered by the `fw_management` alias before this apply. Otherwise the same run that closes the GUI cuts off its own path to the API, and recovery goes through the serial console (`stackit server console <server-id> --project-id <connectivity-project-id>`).
>
> A dynamic home or office address will eventually change and lock out a later run.

**2. Bootstrap the API key, then push the policy**

```bash
tofu apply -var firewall_bootstrap=true && tofu apply -var firewall_bootstrap=true
```

The first `tofu apply` derives the API key (waiting for the appliance to finish booting, which takes a few minutes) and caches it in `src/.firewall-api-credentials.json`, gitignored. The second `tofu apply` stores it in the management Secrets Manager and pushes aliases, static routes, rules and NAT. 

Two runs are unavoidable: the provider needs the key at plan time, and a value created during an apply cannot configure a provider in that same run.

The appliance login it uses comes from `firewall_admin_password`, which defaults to the `root` password baked into the STACKIT OPNsense image, so nothing has to be exported for a fresh deployment.

> [!IMPORTANT]
> Change the password on the appliance (**System → Access → Users**). The password is only used to derive the API key. Once the key exists, it is no longer read at all.

**3. Drop the bootstrap variable and delete the cache file**

From here on every apply is a plain `tofu apply` with no variables:

```bash
rm src/.firewall-api-credentials.json
tofu apply
```

**Rotating the key**

Re-running the bootstrap revokes every existing API key on the appliance and mints a fresh one, which immediately invalidates the copy in the Secrets Manager. The follow-up is therefore not optional: bump `firewall_api_secret_version` by one, so the new key is written through. Forgetting the bump fails with a 401 instead of silently keeping a dead key.

```bash
rm -f src/.firewall-api-credentials.json
tofu apply -var firewall_bootstrap=true   # mints the new key
# bump firewall_api_secret_version in your tfvars, then
tofu apply -var firewall_bootstrap=true   # writes it to the Secrets Manager
rm src/.firewall-api-credentials.json
```

### Make the firewall highly available

A single appliance is the default route of every corporate landing zone, so losing it takes the platform offline. Uncomment the `ha` block in `connectivity.firewall` to deploy a second appliance in another availability zone as an active/passive CARP pair:

```hcl
ha = {
  backup_zone = "eu01-1" # must differ from firewall.zone
}
```

`tofu apply` then does the rest. It deploys the backup, logs into both appliances to write their node-local CARP settings (backup first, primary last, so the primary wins the election), and adds the `fw_cluster` alias plus the `allow-fw-carp` and `allow-fw-pfsync` rules to the policy — those are injected automatically, there is nothing to add to the `.tfvars`.

Two consequences are worth knowing before you enable it:

- **The landing zone routes change.** `firewall_next_hop_ip` becomes the CARP virtual IP (`.6` of `lan_network_range`) instead of the primary's LAN address, so every corporate landing zone gets a rewritten default route in the same apply. Expect a short interruption while those routes are updated.
- **The public IP does not fail over.** STACKIT binds a public IP 1:1 to a NIC. Egress from the backup is translated to the backup's own address, and inbound port forwards stay on the primary until you repoint DNS at `tofu output connectivity_firewall_backup_public_ip`. Long-lived outbound connections break for the duration of an outage; new ones recover in seconds.

What exactly fails over, and what was measured, is in [High availability](architecture.md#high-availability-optional).

> [!IMPORTANT]
> The backup appliance boots with the same image default password as the primary and its web GUI answers on its own public IP until the policy is pushed. The lockout warning above applies to both nodes.

### Kubernetes: DNS automation for Gateway API resources

For Gateway API resources (for example Envoy Gateway with `Gateway` + `HTTPRoute`), use DNS records directly via `stackit_dns_record_set` until native provider support for `extensions.dns.gatewayApi` is available.

For the existing sample content in this repository (`landing_zone_sample_gateway` + `landing_zone_sample_http_route` in `src/_landing-zone-kubernetes.tf`), the DNS record is created automatically based on the Envoy Gateway LoadBalancer endpoint discovered via `kubernetes_resources`.

Implementation pattern:

```hcl
# Discover Envoy-managed LoadBalancer service endpoint for each sample gateway
data "kubernetes_resources" "landing_zone_sample_gateway_service" {
  provider = kubernetes.platform

  api_version    = "v1"
  kind           = "Service"
  namespace      = "envoy-gateway-system"
  label_selector = "gateway.envoyproxy.io/owning-gateway-name=<gateway-name>,gateway.envoyproxy.io/owning-gateway-namespace=<namespace>"
}

# Create A or CNAME record depending on endpoint type
resource "stackit_dns_record_set" "landing_zone_sample_gateway" {
  project_id = module.landing_zone["corp-exmpl"].project_id
  zone_id    = module.landing_zone["corp-exmpl"].dns_zone_id

  name = "app.${module.landing_zone["corp-exmpl"].dns_zone_dns_name}"
  type = local.endpoint.ip != null ? "A" : "CNAME"
  ttl  = 60

  records = [coalesce(local.endpoint.ip, local.endpoint.hostname)]

  lifecycle {
    precondition {
      condition     = local.endpoint.ip != null || local.endpoint.hostname != null
      error_message = "Gateway load balancer endpoint is not available yet for DNS record creation."
    }
  }
}
```

This ensures a stable, Terraform-managed DNS path without external scripts until provider-native `gatewayApi` DNS extension support is available.