# Configurator user guide

## Access and roles

Sign in with STACKIT. Authentication does not by itself grant access to an
organization or permission to provision infrastructure. Select the verified
working environment for your organization.

- **Platform Engineers** configure the shared platform and prepare project templates.
- **Application Owners** use the templates and instances they are authorized to access.
- Membership administration, credential use and execution approvals are separate
  capabilities. A role in one environment grants nothing in another.

Connect GitHub separately if you want repository and fork features. A GitHub
connection is not a replacement for STACKIT login or cloud permissions.

## Create and review a configuration

Start from a platform template or an existing configuration. Templates are
starting points, not a recommendation to enable every optional service.
Use the editor to inspect foundations, governance, networking and platform services.
Review inherited values as well as the fields you change.

The editor validates native Accelerator inputs. An unset override, an explicit
`null` and a configured value can have different meanings; removing an override
returns to native defaults. Validation does not prove regional product
availability, network reachability, service-account permissions or capacity.

Save changes explicitly. If you use a fork, saving to the repository is a separate
action. Exports support the independent Terraform/OpenTofu workflow.

## Assistant proposals

The Assistant explains reviewed service knowledge and proposes supported editor
changes. State requirements and concrete choices; it must ask when information
is missing rather than invent network addresses, product availability or credentials.

1. Review the proposed field-by-field differences.
2. Accept only the changes you want in the current draft.
3. Save the draft separately.
4. Review Plan and authorize Apply separately if deployment is intended.

Proposals do not save, publish templates, grant roles or provision infrastructure.
The server checks your authorization and the draft revision again on acceptance.
Refresh and review a new proposal if the underlying configuration has changed.
Never enter passwords, API tokens, VPN keys, kubeconfigs, state or raw plans in chat.
Use the separate authorized credential workflow.

For DNS, `primary` and `secondary` describe authoritative zone roles, not
public/private visibility. The native Secondary setup is incomplete; do not
assume that choosing the role configures primary-server replication.

## Templates and Application instances

Platform Engineers prepare, review and publish project template versions.
Published versions are immutable. Application Owners choose a permitted version
and provide its exposed parameters. A template draft is not an Application
instance, and publishing does not deploy one. Existing instances are not silently
upgraded when a new version is published.

## Plan and Apply

Choose the correct environment and target, bind the authorized technical
credentials, then create a preparation and request a Plan. Follow the job output
and review the resulting changes, source/configuration version and state binding.

Apply uses the reviewed saved Plan and requires its own authorization.
Changed inputs, source, state or an expired approval can require a new preparation.
Do not start parallel infrastructure writes to the same state.
The UI job status and diagnostic ID help an operator investigate failures;
retrying is not a substitute for resolving an expired or inconsistent preparation.

Destroy, upgrades and drift checks are distinct operations with their own
authorization. A successful configuration validation or Plan is not proof that
private endpoints will be reachable during Apply.

See [MVP scope and limits](mvp-scope.md) for deliberate exclusions and
[architecture](architecture.md) for components and state boundaries.
