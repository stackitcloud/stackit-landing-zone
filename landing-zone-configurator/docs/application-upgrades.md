# Application template and platform updates

[English](application-upgrades.md) | [Deutsch](application-upgrades.de.md)

An existing order has three independent versions: the desired execution source,
the Application template version and its platform contract. Open the order's
**Updates** tab to inspect them. Publishing a version or releasing the Configurator
does not silently upgrade an existing order.

## Publish a template upgrade

The Platform Owner first publishes the new template version, then explicitly
publishes an upgrade path from an earlier version of the same template. A new
name or a different template family is not a migration path. Existing published
versions and the original order remain immutable audit records.

The upgrade path also records how sensitive changes are approved. Approval is
the default. Direct self-service is available only when both template versions
permit direct deployment and the Platform Owner explicitly permits sensitive
self-service on that path. This does not bypass destructive-change protection.

## Upgrade an existing order

1. In **Updates**, select an offered version and compare its changes.
2. Existing parameter answers are retained. Supply any newly required answers;
   changing the selection or answers invalidates the previous preview.
3. Review and explicitly confirm the new desired binding. This starts no Plan
   or Apply and does not change the State.
4. Create a fresh Plan of the same order. The native Plan, rather than only a
   template comparison, determines whether the actual changes are permitted.
5. Obtain any required Platform Owner approval for that exact Plan and artifact,
   then explicitly release Apply through the normal flow.

The instance, project identity, State key and backend remain the same. The
standard path blocks resource deletions and replacements, including changes
that OpenTofu represents as replacement rather than an in-place update. Unknown
or incomplete evidence also blocks execution. A checkbox cannot override this.
Destructive migrations require a separate reviewed migration procedure.

IAM, credentials, networking, service plans and availability can change without
a deletion. These changes require the published sensitive-change policy as well
as the stricter deployment policy of the old and new versions. Required approval
is tied to the fresh actual Plan, its artifact hash and the desired upgrade
snapshot; it cannot authorize another Plan or a later change of parameters.

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
