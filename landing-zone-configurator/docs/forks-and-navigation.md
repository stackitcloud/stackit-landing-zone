<a id="fork-speicherung-und-browser-navigation"></a>
# Fork storage and browser navigation

[English](forks-and-navigation.md) | [Deutsch](forks-and-navigation.de.md)

As of 2026-09-30. Deployed on lzc-dev; browser navigation checked live. Fork creation, app access and personal saving confirmed by the user.

<a id="benutzerablauf"></a>
## User flow

1. Sign in with GitHub and open **GitHub forks** on the left.
2. Use **Create fork on GitHub** if needed. The user confirms creation
   directly on GitHub.
3. Open **Set up app access to fork** and install the app on selected own
   repositories (`Only select repositories`).
4. **Refresh forks**, optionally **Check more repositories**, then
   select the desired fork.
5. Complete a Standalone draft and select **Save to fork**.
   First save creates the working branch `lzc/configurations` from the
   fork's current default branch. The default branch is not changed.
6. Saved configurations can be reopened in the same area,
   edited and saved as a new revision. **Prepare new copy** gives the
   current draft a new identity when it is saved.

Current canonical file format:

```text
src/config/custom/<uuid>/landing-zone.json
src/config/custom/<uuid>/landing-zone.tfvars
```

It contains schema version, configuration ID, approved template identity
with source hash and the domain editor draft. `kind` is
`landing-zone-configurator-configuration`; this distinguishes editable
storage from the previous download format. Unknown input fields are not
adopted. No credentials, GitHub tokens, Terraform modules or HCL expressions
are accepted as additional payload. Deterministic export additionally produces
`landing-zone.tfvars` in native HCL. Download and backend use the same serializer.
Strings remain data, even with `${…}` and `%{…}`. Export uses the
validated Standalone configuration including unchanged template attributes.
Previous JSON-only configurations receive the second file on next save.
The JSON file remains the editor's source; manual tfvars changes are not imported.
Output is a variable file, not complete cloud/Plan acceptance.
The Configurator starts no Plan/Apply when saving. Repository-specific
GitHub workflows remain subject to their configured commit triggers.

<a id="zugriff-und-konflikte"></a>
## Access and conflicts

- Every request requires a valid backend session; writes additionally require exact
  origin and session-bound CSRF value.
- The backend reads only the GitHub App user token belonging to the session, user
  and tenant from Secrets Manager. No GitHub CLI, operator
  or installation tokens for user repositories.
- Before each access, GitHub confirms repository ID, fork status, write permission and
  `source.id == 1168467997` (Accelerator). Archived or disabled repositories
  and upstream itself are rejected. Changed permissions apply immediately on
  the next API access; UI selection is not proof of permission.
- Commit target is fixed to `lzc/configurations`; the file path is derived from
  a UUID. Symlinks, submodules, incomplete Git trees and incompatible files
  must not be overwritten.
- Expected branch commit is checked before writing. The new tree is based on
  this snapshot and contains exactly the two configuration paths. The new commit has exactly
  this parent. Branch updates use `force: false`; parallel changes
  cause a conflict. No automatic retry on a new base and no
  silent overwrite. On concurrent initial creation, ref creation
  fails; at most unreferenced Git objects remain.
- Existing tfvars must, as a regular Git blob, exactly match the export of the previous
  JSON document (Git blob hash including UTF-8 length). Deviations,
  symlinks and orphan export files cause a conflict before writes.
  Missing exports are added. Future serializer changes require
  an explicit export migration; never bypass the comparison.
- A network interruption initially leaves the result uncertain. The UI preserves
  configuration ID and draft; users should check GitHub's state and
  reopen if necessary. A retry does not overwrite a new head.
- Other template versions are rejected, not silently converted.
  Backend and frontend use the same HCL-generated catalogue.

GitHub requires GitHub Apps to have access to all repositories on the target account
and access to the source repo on the source account for automatic fork creation.
We do not expand installation permissions for this. The GitHub fork dialog is the current
creation path; automatic API creation remains open.

<a id="urls-und-history"></a>
## URLs and history

| View | URL |
| --- | --- |
| Template catalogue | `/templates` (also `/`) |
| Template preview | `/templates/<template-id>` |
| Editor | `/configurations/edit/basics`, `/projects`, `/review` under the same prefix |
| Fork selection | `/repositories` |

View changes and editor steps use `history.pushState`. `popstate`
restores the view on back/forward; inputs remain in the running
tab. Only short OAuth redirects secure drafts for a limited time
in session storage. A normal reload does not replace Git saving;
without a local draft the editor offers restoration from a fork.

The API server serves the UI only for explicitly known page paths. Missing
API/auth endpoints and assets retain their error response. Direct preview links
and reload are therefore also possible on CF.

<a id="abnahme-und-nächste-schritte"></a>
## Acceptance and next steps

- [x] 35 application tests: origin/ID/permissions, session/CSRF, path protection, commit content,
  stale head, concurrent writing and initial creation.
- [x] Twelve desktop/mobile browser cases: editor, login, history, deep links,
  fork selection, conflict, new copy and reopening after reload.
- [x] HCL importer checked; common catalogue byte-identical to the previous state.
- [x] [Validation 36700860848](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36700860848) and [release 36700861231](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36700861231) successful (`c77345a`).
- [x] Live browser: preview URL, editor steps, back/forward, draft preservation,
  fork URL and reload checked; anonymous reads/writes 401, missing assets 404.
  Test without user session or real repository writes.
- [x] Connect personal fork and qualify actual GitHub commit through UI (user confirmation).
- [x] Add field help including stable identifier and resource prefix.
- [x] HCL export: semantically compare all eight templates and special characters with a real HCL parser; test atomic JSON/tfvars storage and conflict protection.
- [ ] Add PR workflow for protected working branches; currently clear error message.
- [ ] Automatic fork creation with suitable installation prerequisites.
- [ ] Versioned compiler output and deployment support.
- [ ] Expand pagination: currently 25 repository entries per page (max. 100 pages),
  at most 30 configuration files in the selected branch. Unsupported
  files and truncated configuration lists are shown.

Sources:
- https://docs.github.com/en/rest/repos/forks#create-a-fork
- https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user
- https://docs.github.com/en/rest/git/refs
- https://docs.github.com/en/rest/git/trees

<a id="bedeutung-der-projektfelder-und-verwendung-des-exports"></a>
## Meaning of project fields and using the export

- **Unique identifier:** key in `landing_zones`, giving stable assignment for
  OpenTofu `for_each` and references. Example `kundenportal-prod`. Changes after
  deployment require planned state/address migration, otherwise recreation may occur.
- **Project code:** part of the resource prefix, for example
  `acme-lz-portal-prod` from company code `acme`, project code `portal` and
  environment `prod`. It may also contribute to DNS names. Changes can
  rename or replace resources.
- **Project name:** readable name in the Configurator. The current root Accelerator does
  not pass `project_name` to the Landing Zone module; the STACKIT project name
  therefore comes from the prefix. Sandbox names, by contrast, contribute to project name and
  resource identity.

For manual use in a matching initialized Accelerator checkout:

```sh
tofu -chdir=src plan -var-file=config/custom/<uuid>/landing-zone.tfvars
```

Credentials and backend must be configured separately. The Configurator
selects approved Accelerator code for future managed deployments;
export alone executes no Plan or Apply. Provider/variable validation and Plan
acceptance remain required before a first cloud deployment.

<a id="abnahme-feldhilfen-und-tfvars-export"></a>
### Acceptance of field help and tfvars export

Commit `c2f15e2`, feature branch only. [Validation 36703394675](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36703394675)
and [release 36703394711](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36703394711)
successful. 35 application tests, twelve browser cases, PostgreSQL integration and
HCL round-trip check green. CF connection tests to PostgreSQL and Secrets Manager
successful. Mobile live check confirms accessible field help, native
`landing-zone.tfvars` download, no browser errors and no horizontal overflow;
screenshot visually checked. No user login or real fork write access
for this live test. The new two-file output is additionally checked with the
GitHub API test double; personal acceptance of the previous JSON saving
is confirmed. Save an existing configuration again to add tfvars.

<a id="arbeitsstand-beim-wiederkommen"></a>
## Working state on return

Forks load automatically after login. In the same browser, the
app remembers the selected fork, configuration binding,
editor draft and last page including editor step per user ID and tenant. Opening
`/` resumes there; explicit links keep their destination. Access to
a saved fork is rechecked server-side before restoration.

The local copy also preserves incomplete or unsaved inputs. It
keeps the original Git commit as its write base: a meanwhile-changed
branch still causes a conflict, never automatic overwrite.
On access/network failure, the local restoration copy remains
untouched. Switching to another fork is a deliberate new selection.
Logout/identity change removes the visible draft; other signed-in
accounts are not assigned this local selection.

Storage: `localStorage`, schema 1, with template hash and size/shape checks. No
GitHub/STACKIT keys, CSRF values or sessions. Configuration contents such as
organization ID and owner addresses reside locally in the browser profile;
this is neither encrypted storage nor separation from people with access
to this browser profile. Clearing browser history/data also removes
this working state. On another device, the explicitly saved fork remains the
source; cross-device working states are not yet implemented.
Disabled/full browser storage produces an error in the fork area.
**Save to fork** remains explicitly required for Git storage.


Folder adjustments use document version 2 with four stable keys in
`draft.folders`. Version 1 remains compatible without folder overrides and exports
unchanged. See [common editor](common-editor.md).
