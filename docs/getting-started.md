# Getting Started

This guide walks you through deploying the STACKIT Landing Zone from scratch.

## Prerequisites

- A **STACKIT organization** with your user account registered
- **Owner permissions** on the STACKIT organization
- **STACKIT CLI** installed ([Installation guide](https://github.com/stackitcloud/stackit-cli/blob/main/INSTALLATION.md))
- **OpenTofu** (>= 1.10) or **Terraform** (>= 1.10) installed

> [!NOTE]
> This guide uses `tofu` commands throughout. If you are using Terraform, replace `tofu` with `terraform` — all commands work identically.

## Deployment Flavours

Three ready-to-use configurations are provided in `src/config/`:

| Flavour | Config file | Description |
|---------|-------------|-------------|
| **Standalone** | `standalone.tfvars` | Governance, management, devops, and public landing zones only. No network area or firewall. |
| **Hub-Spoke** | `hub-and-spoke.tfvars` | Adds a connectivity hub with a network area and DNS zones. Corporate landing zones connect via the network area. |
| **Hub-Spoke + Firewall** | `hub-and-spoke-firewall.tfvars` | Full hub-spoke topology with a pfSense firewall appliance on the WAN/LAN boundary. |

Choose the flavour that matches your requirements and adjust the corresponding `.tfvars` file before deployment (step 7). At a minimum, update `owner_email`, `organization_id`, `company_name`, and `company_code`.

> [!NOTE]
> This single-root-module approach works well for smaller environments. At larger scale — typically beyond 10 landing zones — you may encounter STACKIT API rate limits during applies and slower plan/refresh cycles due to a growing state file. Tools like [Terragrunt](https://terragrunt.gruntwork.io/), [Terramate](https://terramate.io/), or [Spacelift](https://spacelift.io/) can help by splitting landing zones into isolated state files and orchestrating root module calls with proper concurrency controls. If you are planning a larger enterprise deployment, reach out to [STACKIT](https://stackit.de) or a partner offering a verified landing zone solution via the [STACKIT Marketplace](https://marketplace.stackit.cloud).

---

## Step-by-Step Deployment

### 1. Clone the repository

```bash
git clone https://github.com/stackitcloud/stackit-landing-zone.git
cd stackit-landing-zone/src
```

### 2. Download the pfSense firewall image (Hub-Spoke + Firewall only)

If you are deploying the Hub-Spoke + Firewall flavour, download the pfSense image into the `src/` directory:

```bash
curl -o firewall-image.qcow2 https://pfsense.object.storage.eu01.onstackit.cloud/pfsense-ce-2.7.2-amd64-10-12-2024.qcow2
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

| Variable | Description |
|----------|-------------|
| `owner_email` | Technical owner email registered in STACKIT |
| `company_name` | Company name for folder naming |
| `company_code` | Short prefix for resource naming (e.g. `exc`) |
| `organization_id` | Root organization container ID |

### 8. Initialize OpenTofu/Terraform

```bash
tofu init
```

### 9. Deploy the landing zone

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

### Configure pfSense firewall

If you deployed the Hub-Spoke + Firewall flavour, configure the pfSense appliance as described in the [STACKIT pfSense documentation](https://docs.stackit.cloud/products/quick-deployments/pfsense-firewall/tutorials/configure-pfsense/).