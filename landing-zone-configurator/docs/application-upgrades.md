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

The upgrade path also records how sensitive changes are approved. Approval is
the default. Direct self-service is available only when both template versions
permit direct deployment and the Platform Owner explicitly permits sensitive
self-service on that path. This does not bypass destructive-change protection.


The publication page guides the Platform Owner through three steps:

1. Select the saved template draft, platform target, deployment policy and catalogue access; publish the version.
2. After the server confirms publication, optionally offer an upgrade. The new target version is fixed. Select an earlier version of the same template family and review the sensitive-change policy before explicitly publishing the path. Alternatively choose **Finish without an upgrade**. A first version has no earlier version; finish publication instead.
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

The instance, project identity, State key and backend remain the same. The
standard path blocks resource deletions and replacements, including changes
that OpenTofu represents as replacement rather than an in-place update. Unknown
or incomplete evidence also blocks execution. A checkbox cannot override this.
Destructive migrations require a separate reviewed migration procedure.

IAM, credentials and networking can change without a deletion. Changes classified
as sensitive by the actual native Plan require the published sensitive-change
policy as well as the stricter deployment policy of the old and new versions.
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

With dependents, destructive shared changes and unknown or incomplete evidence
block the standard Platform Apply. Sensitive shared changes need explicit
Platform Owner acknowledgement bound to the exact Plan, artifact, State version
and dependency set. New dependencies or a different State invalidate it. Active
Application execution and Recovery also prevent conflicting shared changes.

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
