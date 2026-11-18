# Git in Application Landing Zones

[English](application-git.md) | [Deutsch](application-git.de.md)

An Application template can include one optional managed STACKIT Git instance in
its project. This is separate from central platform Git and from GitHub login.
Corporate/SNA placement does not attach this managed service to a private project
network: access uses the service's public endpoint and explicit source-IP ACLs.

The Platform Owner controls `git.enabled`, `git.flavor` and `git.acl` in the
Application template. Each can be fixed or offered as an order parameter; flavors
and source networks must stay within the published choices. Git is disabled by
default. Enabling it requires a valid plan and a non-empty explicit ACL. A public
`0.0.0.0/0` or `::/0` is a deliberate allowlist choice, never a default.

Git10 is documented for up to 10 users, Git100 for up to 100 users **per instance**.
Size for the intended Git users and growth. Above 100 users, discuss separate team
or project instances or another supported architecture. Multiple instances do not
provide transparent federation, shared repositories or a single user directory.
See the [official sizing documentation](https://docs.stackit.cloud/products/developer-platform/git/basics/plan-size-of-git-service/).
The catalogue identifies offered plans; it does not override documented limits.

New templates require the Git-capable execution source. Existing published
versions, orders, State keys and resource identities remain unchanged. Publish a
new template version and explicitly select its supported execution source before
adding Git to an existing application. Review the resulting Plan. With the pinned
STACKIT provider 0.114.0, Git flavor **and ACL** changes replace the instance;
plan repository/data migration separately before approving those changes.

## Independent Accelerator use

No Configurator is required. For `src/application`, add to the `application` input:

```hcl
git = {
  enabled = true
  flavor  = "git-100"
  acl     = ["203.0.113.0/24"] # Replace with your actual public egress network.
}
```

The same object is available in `landing_zones.<key>.git` at the native platform
root. Omit it to keep Git disabled. The application output includes the Git
instance ID; it exposes no Git user password, token or private key. Git user
onboarding and repository setup remain separate service operations.

State recovery can identify and import the existing Git instance by its project, name, flavor and exact ACL. It requires read-only Git instance listing in the recovery credentials and rejects ambiguous or changing instances. This restores Terraform identity, not repository data or Git user credentials; service backup and repository migration remain separate.
