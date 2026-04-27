# Email of the technical owner registered in STACKIT
owner_email = "platform-team@example.com"

# Company name used for folder naming in the resource manager
company_name = "Example Corp"

# Short company code used as prefix in resource naming (e.g. project names, service accounts)
company_code = "exc"

# Root organization container ID from STACKIT resource manager
organization_id = "org-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

region = "eu01"

# Labels applied to all resources for cost tracking / filtering
labels = {
  managed_by = "opentofu"
}

# Users with full organization-level owner permissions
organization_owners = [
  "org-owner@example.com"
]

# Users with read-only audit access at the organization level
organization_auditors = [
  "auditor@example.com"
]

# Sandbox projects for experimentation / PoCs
sandboxes = [
  {
    project_name        = "Sandbox Team Alpha"
    project_owner_email = "alpha-lead@example.com"
    owner_emails        = ["dev1@example.com", "dev2@example.com"]
  }
]

# Landing zones keyed by a unique identifier
landing_zones = {
  "fe-dev" = {
    project_code = "fe"
    owner_email  = "frontend-team@example.com"
    env          = "dev"

    role_assignments = [
      {
        role    = "project.owner"
        subject = "frontend-lead@example.com"
      }
    ]
  }
}
