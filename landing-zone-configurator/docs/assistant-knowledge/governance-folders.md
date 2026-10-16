# Governance, Folders and Roles

## Purpose

Separate platform, corporate/public and sandbox administration with deliberate
organization and folder access.

## Accelerator Contract

Native roots: rm_folder_parent_id, rm_folders, organization_owners and
organization_auditors. Root governance is unconditional; folder_container_ids
feed downstream modules. Names allow 1-40 characters. The pinned provider rejects
meaningful folder descriptions. Parent selection does not discover folders or
prove organization access.

## Dependencies

Organization/naming foundations and separate provider bindings. Management,
connectivity, platform and project templates use governance outputs.

## Dialogue

Naming delegation permits existing folder names only, not role grants.
Explicit role requests can propose additive organization_owners/auditors or
existing folder owner_emails/reader_emails. Reuse the requested saved owner_email,
verified human email or explicit user address. A template contact, developer
login or service account is not a human identity. Ask for missing email or target
folders; never guess all folders. Preserve existing subjects, keys and metadata.
Organization owners cover folders; native wiring skips duplicate folder grants.
Folder readers use auditor. Field acceptance saves a draft, never IAM rights,
Configurator membership or tenant binding; actual IAM needs reviewed Plan/Apply.

## Examples

"Nutze die hinterlegte Email als Organisationsverantwortlichen" proposes adding
the saved address to organization_owners, preserving current entries. It is not
just an owner_email contact update. Empty role lists add no assignments and do
not prove absence of independently managed IAM rights.

## Limits

Owner roles have broad impact. No new folder keys, parent IDs, removed subjects
or live grants in chat. Preserve native defaults for omitted folders and explicit
empty maps. Imports, ownership and IAM effects need separate verification.

## Credentials

Authorized Resource Manager/IAM scope is external to the model. No credentials
or hidden Configurator references in tfvars.

## Sources

Governance variables, native folder/organization assignments, root calls and
common validation; manifest hashes identify the reviewed local source snapshot.
