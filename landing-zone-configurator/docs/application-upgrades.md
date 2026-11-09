# Application template and platform updates

[English](application-upgrades.md) | [Deutsch](application-upgrades.de.md)

An existing order has three independent versions: the desired execution source,
the Application template version and its platform contract. Open the order's
**Updates** tab to inspect them. Publishing a version or releasing the Configurator
does not silently upgrade an existing order.

The order’s Updates tab shows the template name and version, the last applied version,
and the number of published target versions. Technical identifiers are collapsed
under details. Template, platform and product/Runner updates are separate sections;
selecting a technical execution replacement does not add template permissions.
If no matching template path is offered, verify its exact source version, template
family and the requester’s access to the target version. A published 3 → 4 path
does not apply to an order on version 1 or to a different template. The Platform
Owner can inspect named versions under Application Landing Zones → Publication.

## Publish a template upgrade

The Platform Owner first publishes the new template version, then explicitly
publishes an upgrade path from an earlier version of the same template. A new
name or a different template family is not a migration path. Existing published
versions and the original order remain immutable audit records.

The upgrade path owns the approval policy for this transition, independently of
new-order deployment policies on either template version. **Requester self-service**
lets the Application Owner review a fresh saved Plan and explicitly confirm Apply
without an additional Platform Owner approval. **Separate Plan approval required**
requires approval of that exact Plan, including ordinary changes. The default is
separate approval; destructive-change guards remain mandatory.

Under **Edit approval policy**, the Platform Owner can change an existing path.
The action opens a dedicated, prefilled editor; the path list is hidden while
editing, together with the other publication sections. The source and target stay fixed. Choose the execution policy, confirm
publication and select **Update policy**, or return with **Back to upgrade paths**
without publishing. New paths use the separate **Publish a new upgrade path** action.
This appends a new immutable publication for the same source/target pair; the list
shows its latest policy. Earlier publications, selected upgrade targets and Plans
retain their recorded policy. To use a revised policy for an already selected,
unapplied target, the Application Owner opens **Updates**, reviews **Updated
approval policy available**, confirms and selects **Adopt current policy**. This
appends a fresh binding for the same target, parameters and settings. Create a
new Plan; a direct path then needs no additional Platform Owner approval. The
previous Plan stays blocked for Apply. An approval-required policy still requires
its normal approval. Neither publication nor policy editing starts execution or
unlocks an existing Plan.



The publication page guides the Platform Owner through three steps:

1. Select the saved template draft, platform target, deployment policy and catalogue access; publish the version.
2. After the server confirms publication, optionally offer an upgrade. The new target version is fixed. Select an earlier version of the same template family and review the path execution policy before explicitly publishing the path. Alternatively choose **Finish without an upgrade**. A first version has no earlier version; finish publication instead.
3. The completion step links to the catalogue. No existing order, State or cloud resource is changed by publication.

Version publication and path publication remain separate authorized transactions.
If publishing a path fails, the version remains published and the wizard retains
the chosen versions for correction; retrying the path does not republish the version.
A failed catalogue refresh after successful publication is reported explicitly and
does not return to version publication. After reloading, use **Manage existing
template upgrade paths** to add a path for an already published version.

Existing paths for all template families are shown in the collapsed management
area below the wizard. Each card names source, target and approval policy.
Existing paths cannot be overwritten. Direct sensitive changes require both
versions to allow direct deployment. Separate platform-contract paths have their
own collapsed management area and are not part of template publication.

## Upgrade an existing order

1. In **Updates**, select an offered version in the wizard and choose **Next: review changes**.
2. Existing parameter answers are retained. Supply any newly required answers;
   changing the selection or answers invalidates the previous preview.
3. The comparison is a separate step. Use **Back: target version and answers**
   to revise it; a new review is required afterwards. Confirm and choose
   **Save upgrade target and continue**. This starts no Plan
   or Apply and does not change the State.
4. **Next: review a new Plan** opens the same order's Plan view without starting a job.
   This action is also available after reloading a saved, unapplied template target.
   Create a fresh Plan of the same order. The native Plan, rather than only a
   template comparison, determines whether the actual changes are permitted.
5. Obtain any required Platform Owner approval for that exact Plan and artifact,
   then review its resource preview. In the wizard, **Next: prepare Apply** opens
   a separate final confirmation; only the explicit Apply action changes resources.
   Going back does not start a job or grant approval.

### Change or discard an unapplied upgrade

From the Plan step, choose **Change or discard upgrade target** to return to
Updates. The original requester can choose **Change upgrade target** or
**Discard upgrade**, review the restored version and explicitly confirm withdrawal.
The first action returns to target selection; the second leaves the previous
version as the desired version. This also works after a completed no-change Plan.

The server records a new immutable binding with the last successful Apply's
settings, answers and platform contract. Before any first Apply it restores the
original order instead. It preserves order/project/State identity and execution
source maintenance. It does not run infrastructure, reset State or unlock anything.
Historical Plans and approvals remain in history, but cannot be used for Apply;
a fresh binding also prevents them becoming valid after selecting the same target
again. A new target requires a published path from the restored version, a fresh
Plan and the normal Apply approvals; an unapplied intermediate version is optional.

Withdrawal is blocked during an active execution or unresolved Recovery, after
any Apply has already been prepared since the baseline, or when the baseline's
platform proof is no longer current. A failed/partial Apply must be reconciled
through Recovery; metadata withdrawal never reverses its cloud changes. The UI
shows blockers before confirmation and the server rechecks binding, baseline,
requester and execution state atomically. A concurrent Apply and withdrawal
cannot both be admitted.

Preview and saving use the same reviewed execution-source resolver. If an older
order and an older target template both explicitly name the same supported
successor, the saved upgrade selects that successor and requires a fresh Plan.
This does not rewrite the original template or order. Unknown, withdrawn target
sources, unrelated supported sources and missing Runner packages remain blocked;
no arbitrary source or implicit downgrade is accepted. A failed save focuses its
error message and retains the comparison and answers for correction.

Supported technical execution is shown as ready; its independent maintenance form
is collapsed under **Optional technical maintenance**. A withdrawn or unavailable
execution source keeps its warning and maintenance options visible. Technical
maintenance does not change template permissions.

The instance, project identity, State key and backend remain the same. A change
of the central initial project owner, including switching a legacy template to
the granular access profile, is a sensitive permission change and may reach a
fresh Plan. The actual saved Plan decides whether Apply is possible: in-place
project updates and project-role changes follow the published approval policy;
project, network, service, identity and credential deletion or replacement remain
blocked. Only deletions/replacements of project custom roles and project role
assignments are allowed as sensitive IAM transitions. Their exact counts must
match the saved Plan summary. Unknown or incomplete evidence blocks execution;
a checkbox cannot override this. Review removed rights before Apply. A successful
Plan does not prove that a removed role has no impact on existing workloads.

Direct bootstrap Owner grants are migrated in two reviewed Plan/Apply cycles.
Changing `owner_email` alone only changes creation metadata; it does not revoke an
existing Owner. The Runner reads only the exact project's direct memberships,
secured by the instance labels and bound folder. First it creates or imports the
central Owner and imports historical `owner`, `project.owner` and `project.admin`
grants for the requester and Application Service Account, retaining those grants.
The UI explicitly asks for a second Plan/Apply to remove the old direct grants.
Before cleanup, the Runner checks that the central Owner still exists; after Apply,
it checks the direct grants again. Other users' direct grants and inherited
folder/organization permissions remain outside this migration. An explicit full
Owner profile remains supported. These steps use the path's published approval
policy; a direct path requires no additional Platform Owner handoff. The frozen
IAM context and native Plan share one encrypted, hashed artifact, including during
interrupted-Apply recovery. Drift does not adopt new grants; Destroy retains their
managed configuration so it can delete the managed assignments consistently.

IAM, credentials and networking can change without a deletion. Changes classified
as sensitive by the actual native Plan follow the published path execution
policy.
Observability and Secrets Manager creation and in-place updates are also sensitive,
including service-plan, capacity, availability and retention changes. A successful
Plan shows what the provider can perform; it does not guarantee retained data or
that a smaller plan fits existing usage. Review the service limits and data-retention
impact before approval. No ordering of provider plan names is assumed, and no
automatic data migration or backup is performed. The published policy can explicitly
permit sensitive self-service; it does not remove destructive-change protection.
Required approval
is tied to the fresh actual Plan, its artifact hash and the desired upgrade
snapshot; it cannot authorize another Plan or a later change of parameters.

A completed bootstrap-to-remote backend migration keeps its metadata for safe,
idempotent confirmation. These historical markers do not by themselves mean an
open migration. Upgrade admission verifies the matching successful migration Apply,
its exact version increment, current remote backend and cleared bootstrap State;
the latest platform proof must still match the current unlocked State. Incomplete,
failed or contradictory migration evidence continues to block upgrades. No State
or lock is changed merely to make an upgrade available.

A blocked comparison cannot be unlocked by approving a Plan. Resolve its prerequisites
first. After an executable target has been explicitly selected, create a fresh Plan.
For an approval-required upgrade, the Platform Owner opens that order's **Plan** tab
and uses **Approve this upgrade Plan** on the successful saved Plan. Apply is separate.

## Platform changes affect shared infrastructure

Before a Platform Apply, inspect its Application impact. The server determines
which existing orders depend on the platform State and evaluates the native Plan.
A shared firewall or routing change affects those Applications when that Platform
Apply runs. An Application cannot keep a private copy of the old shared firewall
by declining a contract upgrade.

With dependents, complete known platform changes—including deletions and
replacements—need the Platform Owner's explicit impact acknowledgement. The
Apply step shows create/update/delete/replace counts, affected Applications and
a data-loss warning. Review the saved Plan's resource changes to decide whether
the change is responsible. Acknowledgement binds the exact Plan, artifact hash,
State version and dependency set; it does not start Apply. Normal Plan review,
organization confirmation and explicit destructive-change approval remain required.
Unknown or incomplete evidence, active Application executions/Recovery and changed
State remain blockers. These are missing prerequisites, not a blanket prohibition
on destructive changes. Application Owner template/platform upgrades retain their
own infrastructure deletion/replacement protections.

The audit Logs-to-Observability migration follows this same review. Its old Logs
instance, history, tokens and destination are intentionally removed; review that
loss together with the preserved Router, links, projects and S3 archive. No special
resource-address exception is needed.

After adopting this fix, create a **new Cloud Plan** using the existing valid
preparation/configuration. Old immutable Plans keep their original classification;
they are not retroactively unlocked. No configuration edit or new Application
template version is needed for this admission correction.

After a successful Platform Apply, approve its actual resulting platform contract.
A published platform upgrade path may then offer that contract to an existing
order while retaining the same template version. The binding uses real approved
contracts; it does not rewrite a published template to invent a target contract.
Changing organization, project placement, network area or backend identity is a
migration and is outside this standard upgrade path.

## Failed upgrades and Recovery

Running or unresolved jobs, live Runner permissions and open Recovery block a
binding change. A failed partial Apply retains the desired upgrade binding and
may already have changed resources and State. Recovery uses the interrupted job's
frozen template, platform, execution source and inputs. It does not use the last
successful Apply as a substitute for the current State or silently downgrade a
partial upgrade. After reconciliation, create and review a new Plan.

The Assistant can explain these steps. Chat acceptance does not publish an
upgrade path, change a binding, release a Plan, unlock State or authorize Apply.


A completed Plan's unexpired Runner ticket does not prevent changing or discarding
an unapplied upgrade target, or adopting its revised path policy. Running jobs,
unresolved recovery, active Apply credentials and any Apply attempt after the
baseline remain blockers. Adopting a path policy does not revert a shared Platform
to its earlier revision; the selected target Platform must still be current.

### Release a usable platform upgrade path

Under **Manage separate platform upgrade paths**, select the previous platform
contract and the approved target, choose the approval policy and confirm publication.
The release verifies the target's technical STACKIT credentials and adopts the
execution backend from that explicitly selected predecessor. This setup and path
publication commit together: a failed verification or publication leaves both
unchanged. It does not change an order, write its State or run a Plan or Apply.
Different backends are never silently reconciled. The predecessor must already
have an active execution binding; the target credentials must belong to the
releasing Platform Owner and match the approved contract.

For an older published path missing its target binding, use **Edit approval policy**,
keep the policy if appropriate, confirm and select **Check and release upgrade path**.
This also repairs setup without creating a duplicate path when its policy is unchanged.
The Application Owner then refreshes Updates, selects the released platform target,
reviews a fresh Plan and performs Apply under the published approval policy.
Missing execution setup is reported separately from an actual backend change or
an outdated platform proof; an extra Plan approval cannot repair those conditions.
