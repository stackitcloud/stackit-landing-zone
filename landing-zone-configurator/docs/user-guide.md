# Configurator user guide

[English](user-guide.md) | [Deutsch](user-guide.de.md)

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


### Retire, archive and delete versions

The catalogue shows active versions. Platform Engineers can retire a version after
confirmation; it moves to **Archive** and no longer accepts new orders. Existing
orders and their State bindings remain available. Application Owners see active
versions permitted for their groups.

In **Archive**, an unused version can be deleted after a separate confirmation.
Deletion is allowed only if nobody has ever ordered that version; even deleted
or archived orders prevent deletion. Deletion removes the version from the UI,
while immutable publication and deletion evidence and version numbers are retained.
Publishing again creates a new version and does not reuse deleted version numbers.

### Bind published templates to an applied platform

Open the saved platform configuration as Platform Engineer in the same workspace.
Publication reads its template drafts from this open configuration; platform contracts
and State backends are loaded independently. Under **Platform binding**, renew current
personal **STACKIT organization proof** if the successful-Apply list is empty. A technical
service account does not replace that proof. Only successful Applies matching current,
unlocked State appear. Review the selected Apply's outputs and folders and approve its
platform contract using the technical credential profile.

Under **Publication**, select the template, approved contract, matching target and
permitted Application Owner groups. Publish a new immutable version; existing versions
and orders are not rebound. The invited owner selects that version in the same workspace.
Public projects support optional local networking; Corporate projects use the approved
SNA target. Both support optional Secrets Manager and Observability. Accelerator Namespace
services target **Platform Kubernetes only** and are excluded from current Application
project orders. Namespaces in a cluster within an Application Landing Zone belong to the workload.
Possible future Building Blocks built on Application Landing Zones are a separate,
later product decision. Private/SNA access to Platform Kubernetes remains tracked in
[#37](https://github.com/stackitcloud/stackit-landing-zone/issues/37).
Symbolic Observability network ACL
bindings remain blocked until their effective egress source is qualified. Existing
versions on older Runner sources retain their previous execution scope. Each order uses
its own State key; publication and ordering do not approve an infrastructure Apply.

### Corporate IPv4 network size

Leave **Network size (IPv4 prefix length)** empty for **Automatic**. Corporate
networks inherit the default prefix of their attached regional SNA: the native
module reads that value during Plan/Apply and passes it explicitly to the STACKIT
provider while retaining DNS settings. Public automatic sizing remains managed
by the provider. An explicit prefix overrides the default; review capacity and
the resulting Plan before Apply. Automatic does not guarantee free addresses.

The correction requires a new template version using the corrected Runner
revision. Existing versions and orders keep their immutable source/settings;
create an order from the corrected version. No existing State is reset or moved.
A failed Plan creates no cloud resources. Human-readable provider diagnostics
include their explanation, without forwarding structured snippets or expressions.
The Assistant explains inheritance and proposes null for requested Automatic or
the explicitly requested numeric override, without publishing or executing it.

## Plan and Apply

Application order details show **Execution logs** on the **Plan**, **Drift** and
**Destroy** steps as well as during Apply. The user who requested the job can read
its redacted progress and retained failure output and refresh it without starting
another execution. A code such as `plan_failed` identifies the failed phase;
the OpenTofu error in the logs is needed to diagnose its cause. Logs do not grant
Plan/Apply permission and are not shared with another requester.

If an Application Plan stops progressing after its Runner was stopped, keep the
same order. In **Plan**, choose **Check and complete interrupted Plan**. The
server verifies the exact Runner app and immutable source, its stopped process
or terminal task, and the order-bound State and lock. Only then is that Plan
recorded as failed and **Start Cloud Plan** becomes available again. This needs
no further Platform Owner approval. A missing State is accepted only before any
Apply attempt for this order; existing State must match the order. Active or
unverifiable Runners, changed or locked State, saved Plan artifacts and recovery
State remain blocked. The action neither stops a Runner nor writes State, clears
a lock, starts a new Plan or authorizes Apply. Review the separately started new
Plan before applying it. This path applies exclusively to Plan jobs.

If an Application Apply stops progressing without a completion report, use
**Apply → Check interrupted Apply** on the same order. The server independently
checks the exact Runner and its immutable source. A verified stopped Runner
allows the Apply to be recorded as **unresolved**, with an immutable receipt.
This action does not inspect or change infrastructure, State or a lock. It does
not authorize a new Plan or Apply. A stopped Runner alone cannot establish
whether all cloud changes were persisted. Operator reconciliation of cloud
resources, the exact State, any separate recovery State and a possible orphaned
lock remains necessary. Active or unverifiable Runners remain blocked. Keep the
existing order and do not replay its old saved Plan.

After a normally reported Application Apply failure (`apply_failed`), keep the
existing order. In its **Apply** step, choose **Check Application checkpoint**.
The server verifies the exact order-bound S3 state, checks for a lock and separate
recovery evidence, and verifies the Runner's terminal report. Confirm that you
want to replan the same order, then switch to **Plan** and start a new Cloud Plan.
The Application Owner can do this without another Platform Owner approval and
without waiting for the old grant to expire. Existing credentials and the
original source, order and State binding are preserved. No Apply starts from
this action, and the old saved Plan cannot be reused.

A new Plan refreshes cloud resources; review its complete changes before another
Apply. A service timeout can leave an asynchronous cloud operation unresolved,
so a readable checkpoint alone does not prove that every cloud resource matches
State. Missing Apply completion reports, State write failures, separate recovery State,
locks or mismatched checkpoints remain blocked. For eligible uncertain
completion, the originally approving Platform Owner can separately attest an
external Runner/cloud reconciliation after the old execution credentials expire;
this is not an automatic cloud verification or State repair.

Choose the correct environment and target, bind the authorized technical
credentials, then create a preparation and request a Plan. Follow the job output
and review the resulting changes, source/configuration version and state binding.

For Firewall HA, create a credential profile with the optional OPNsense
administration username and password for both appliances before preparing the
deployment. These credentials are protected separately from configuration and
must match the appliances; saving them does not change their passwords. Existing
HA Plans without this credential binding need a new preparation and Plan.
Single-node Firewall infrastructure does not require this additional credential.
Firewall policy/bootstrap and VPN PSKs remain outside this execution contract.
See [deployment credentials](deployment-credentials.md#optional-firewall-ha-administration).

Active platform jobs stream **OpenTofu output** as it becomes available, including
native Plan progress before the final diff. **Follow output** can be switched off
to inspect earlier lines. Collapse the console to disconnect; reopening shows
the latest captured output without restarting the job. The final normal Plan
text remains available after completion and reload. Output is limited to 2 MiB;
truncation and connection errors are shown. OpenTofu may remain quiet during a
long operation: phase and elapsed time are not an estimated percentage.

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


## Complete a missing order identity after login

An order may be created before its owner's valid STACKIT login proof is available.
After logging in, the owner can check that same order's Plan inputs. If the verified
owner binding was missing and the order has no approval or job yet, the server
completes the binding once and derives only the template's declared owner-context
roles. The original settings and completion are retained in an immutable audit.
The order ID, template/version, parameters and State key stay unchanged; no cloud
Plan or Apply runs as part of this completion. A duplicate order is unnecessary.

A different email on an already bound order remains blocked. Sign in with the
identity originally used. An order with approval or execution evidence is not
rebound automatically; ask the Platform Owner to review its existing binding and
evidence rather than changing the State or silently replacing the order.
