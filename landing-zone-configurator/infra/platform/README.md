# Configurator platform

[English](README.md) | [Deutsch](README.de.md)

<a id="configurator-plattform"></a>

This root manages the CF organization and technical org manager, PostgreSQL Flex with database/migration user, Secrets Manager with provisioning user, artifact bucket and AI Model Serving including an auth token. The STACKIT provider enables Model Serving when creating the token.

Region, foundation, quota, DB plan and verified source CIDRs are explicit inputs. No open default ACL. The database owner is intended for migrations, not as the future app user; app roles/RLS and secret policies are added in the runtime layer.

Prerequisites: successfully applied state bootstrap and backend root with versioning enabled. The pipeline passes its backend access through a private temporary output file; normal OpenTofu output remains visible. [IaC instructions](../README.md).

A `sensitive` output masks only the display. Provider-generated credentials reside in encrypted state. Downstream IaC receives only the required outputs; unrestricted provisioning identities are not bound to customer Runners.

## Isolated plan runners

`6-plan-runners.tf` provisions a separate `lzc-dev-runners` CF organisation and
its manager. The initial reviewed plan contains exactly two creates and no changes
or deletes. This is Configurator infrastructure, not a customer Landing Zone apply.
The manager will be used by the trusted dispatcher and release pipeline only;
individual runner apps receive a short-lived per-job ticket, never this identity.
