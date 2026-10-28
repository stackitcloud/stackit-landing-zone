<a id="stackit-login-optionale-github-verbindung-und-mandantentrennung"></a>
# STACKIT login, optional GitHub connection and tenant isolation

[English](github-login.md) | [Deutsch](github-login.de.md)

As of 2026-10-06. STACKIT as primary login implemented and tested locally.
Explicit dev-client approval does not replace production registration.
Migrations through 039 are activated locally after private backups and complete isolated
restore checks. Real human login, complete
owner proof and explicit organization binding have passed acceptance in the existing
customer organization. GitHub remains as legacy mode.

The Configurator session has an absolute eight-hour lifetime, independent of the
shorter STACKIT identity proof. With migration 075 and configured session encryption,
PKCE login retains a refresh grant encrypted on the server, bound to that session,
user and base workspace. The browser receives neither provider access nor refresh
tokens. While the tab is visible, a periodic check and checks on return to the tab
renew the identity proof shortly before expiry. Token rotation is serialized across
tabs and API instances. Renewal verifies the signed ID token, issuer, audience,
authorized party, subject and verified userinfo; a changed identity is rejected.
It never extends the eight-hour app session, revives revoked identities, or extends
organization-owner permission proofs. Those proofs still need separate confirmation.
Logout removes the app session and attempts to revoke its provider refresh grant.
Older sessions without a grant require signing in again when their proof expires.

Web login with Authorization Code and PKCE redirects immediately in the same tab,
without an additional Configurator confirmation dialog. A required STACKIT login,
MFA or consent screen remains controlled by STACKIT. Renewal of the client grant
cannot keep the separate STACKIT Portal browser cookie alive. The compatible Device
Flow with login code retains its dialog and separate provider tab for polling.

A rejected or unavailable renewal never silently discards an edit or redirects the
user. While the app session remains valid, configuration saves remain available;
protected cloud actions require current proof. If the app session itself expires,
the editor keeps its draft and offers local download and sign-in. A tab-local,
24-hour checkpoint preserves the draft, original database configuration ID/revision,
saved baseline and editor location. It contains no login tokens or CSRF secrets.
It is restored only for the same authenticated user and workspace. After a fresh
login starts in the personal workspace, the previous organization is selected only
if a fresh server membership check still permits it. Different accounts and
workspaces do not receive the private draft; explicit logout clears that account's
checkpoint. If browser storage is unavailable, sign-in navigation is blocked until
the draft can be secured or downloaded. Reauthentication never saves, publishes,
plans or applies a draft automatically. Original revision conflict checks remain.

Resource Manager returns an IAM container reference for the exact requested organization UUID.
Verification uses only this reference for
IAM permissions and roles; other containers remain blocked. The real response with
965 owner permissions is checked in full. Parser and migration 037 allow
at most 4096 permissions, with unchanged response-size and authority checks.
Migration 023 was not changed. PKCE proof returns to
`/organisation#stackit-proof`; protected polling resumes it.
User management permits another time-limited owner check even after binding,
without offering another binding.

<a id="cli-pkce-und-nachweisdiagnose"></a>
## CLI PKCE and proof diagnostics

The following diagnostic and activation sections document historical
intermediate states. For current acceptance, the status above this section applies.

An anonymous browser without an existing STACKIT session reaches the provider page
`/ui/login/user` with the approved CLI Device client, but only with a
continue button and hidden form fields, without login input. Continue
returns to the same page. This was also reproduced with `openid email profile` and
manual code entry at the base confirmation link. Scope or
link changes are therefore not a proven fix. Comparison with the locally cloned
STACKIT CLI corrects the original classification as a general provider error:
`stackit auth login` uses Authorization Code with PKCE, not Device Flow.
A fresh anonymous CLI-style Authorization Code request actually provides
a username field. Full human login has not yet passed acceptance.

The local start script now uses the same CLI client, S256 PKCE and
`openid offline_access email`. Random state and nonce additionally protect
the browser flow. A loopback listener selects a free port between 8000 and
8020 and uses exactly `http://localhost:<port>` as registered callback.
Redirect is limited to the fixed local Configurator origin;
code and callback URLs are not logged. The Configurator callback requires
the original browser cookie or real proof session and the same
tenant. Foreign, expired, repeated or mismatched callbacks are rejected.
Only existing browser-bound polling exchanges the code with the verifier
and checks signed ID token, nonce, issuer, audience and userinfo. The
callback creates no session and binds no organization automatically.
Refresh tokens are not stored despite the CLI-compatible scope.

PKCE is prepared locally only, not activated in the running API. The
standard Device Flow remains compatible. The CLI loopback callback is not
a deployment method for hosted apps; a separately registered web OIDC client
with matching callback remains required for production. Existing sessions
and paused Application migrations are not automatically changed.

The proof interface shows the signed-in Configurator user and
last confirmed STACKIT email. Expired proofs remain marked as such;
user/tenant changes remove the previous display.
Known access, permission, identity and provider-response errors have
controlled DE/EN messages. Unknown codes and provider details are not
displayed. Errors permit neither organization binding nor reuse of
old owner permissions. The actual reported organization error is not yet
identified: reload in the user's own authenticated browser, check proof
and inspect the specific message and displayed identity. Do not share tokens.

Evidence: 61 Device/translation tests, TypeScript and 14 existing extended
desktop/mobile browser cases passed. Browser cases use synthetic
identities and mocked APIs; they are not real organization acceptance.
No API restarts, customer migrations, cloud Plans or Applies for this
diagnostic change. #91 remains open.

PKCE follow-up check: 62 auth tests, 395 tests in total with 45 expected skips,
TypeScript and 4 login plus 16 proof browser cases passed. Before
resumption, global `npm run check` stops at five formatting/import diagnostics
in the paused Applied Platform changes; the bounded login Biome check
has no errors. This historical blocker was fixed on resumption.

<a id="lokale-aktivierung-2026-10-06"></a>
### Local activation (2026-10-06)

The approved login-only revision is activated locally. An isolated runtime revision
contains base `056d4df`, proof interface `929f7fd` and CLI PKCE `ce6db69`, but
not subsequent group/Application migrations. Before the API restart,
the private backup was fully restored in its own PostgreSQL container
and unchanged migration revision 034 checked. After
restart, all 33 customer tables are unchanged. The existing platform Runner
remains the same; Application execution remains disabled.

The real anonymous start through the running UI reaches the provider page with
a visible username field and no Device code. The agent's own verification flow was
ended. Full human login and real organization proof
remain to be accepted; #91 remains open. Isolated activation does not permit
unchecked launch of the current repository script with migrations 035/036.

<a id="rueckkehr-tab-und-session-uebernahme"></a>
### Return tab and session adoption

The user confirms successful login at STACKIT, but the app in the
return tab remained signed out. Previous initialization queried the session
only once; at return time, the original tab might not yet have
converted the code into a session through protected polling.
Two new sessions were already stored without updating the open
return tab.

The callback now redirects to fixed `/#stackit-login` at the Configurator origin.
The marker contains neither code nor tokens and is removed from the browser address.
The return tab resumes browser-bound polling itself,
even if the original tab was closed. If another tab has
already completed the flow, only the session confirmed by the server through the real
session cookie is read. A marker without valid flow
or session creates no login. State, nonce, replay and cookie gates
remain unchanged; the callback itself still creates no session.

The login-only fix is activated locally after another private backup;
schema remains 034, all 33 customer tables are unchanged after restart.
62 auth and 10 desktop/mobile login cases pass, including return
without original tab and parallel completion. Browser cases use API mocks.
The actual display in the user's browser must be checked again.

<a id="primärer-stackit-login"></a>
## Primary STACKIT login

Platform Engineer and Application Owner sign in with their personal
STACKIT identity and select their active tenant when they have multiple memberships.
The Application Owner needs neither GitHub nor a service account.
The Platform Engineer stores technical STACKIT service-account credentials;
product catalogues then automatically use the same credentials without additional
profile or project selection in the editor. Personal access tokens are discarded
after identity verification. Encrypted personal refresh grants are used only for
authentication renewal, never for Runner or technical STACKIT automation.

`POST /auth/stackit/start` begins the configured browser-bound flow.
Locally this is CLI PKCE; without an explicit flow factory it remains Device Flow.
With Device Flow the browser receives the public confirmation code and
STACKIT confirmation link; with PKCE only the authorization link without Device code.
`/auth/stackit/poll` verifies identity server-side
and creates the normal opaque session. An existing ID token is fully
checked; if absent, only userinfo with the access token received in the same
Device Grant is used. A confirmed personal account is mandatory.
Issuer and subject determine the stable user, never email alone.

Device cookies are `Secure`, `HttpOnly`, `SameSite=Strict`; for the PKCE
callback return, browser binding uses `SameSite=Lax`. Sessions use
`SameSite=Lax`. Pre-auth POSTs require exact origin; authenticated
changes additionally CSRF. Sessions last at most eight hours; the independent
identity proof and encrypted refresh grant follow the renewal rules above.
Open Device Flows reside only in one instance's memory: restart discards them;
multiple instances need shared storage or sticky routing before activation.

<a id="autoritativer-organisationsnachweis"></a>
## Authoritative organization proof

Login or Resource Manager read access is not administrator proof. In the active
organization workspace, a Platform Engineer with membership management
explicitly starts verification. Their previous current
organization proof is removed; human identity and historical audits
remain. A failed new proof must not reuse old
owner approval.

The new Device Grant verifies the same human identity and exact
organization. The same short-lived human ****** queries the following APIs at the fixed
IAM origin `https://authorization.api.stackit.cloud`:

- `GET /v2/users/{verifiedEmail}/permissions?resourceType=organization&resource={verifiedOrganizationResourceId}`
- `GET /v2/organization/{verifiedOrganizationResourceId}/roles`

`verifiedOrganizationResourceId` is the container reference from the successfully
checked Resource Manager response, falling back to its organization UUID if
no container reference was supplied. Returned IAM resources must exactly match
this reference; the bound organization retains its real UUID.

Responses are checked for organization, resource type, scope and structure.
The conservative minimum includes all permissions of exactly one nonempty
official `owner` role. Effective user permissions must contain this set
in full. Read access, missing/ambiguous owner roles and
blocked role queries grant no binding authority. The basis is the
official STACKIT Go SDK contract, revision
`7746310c7fe0a5e3f5c5e6e9b1be69d48c6184d9`, `services/authorization/v2api`.

Only separate confirmation sends
`POST /api/v1/stackit/identity/bind-organization` with only
`{"confirmOrganizationBinding":true}`. Origin, CSRF, tenant, real current
DB session, PE role, membership management and unexpired/unrevoked
identity/owner proofs are checked again. SQL-generated
immutable authorization records bind organization, user,
issuer/subject, permissions and validity. Atomic binding references this
record in the audit; repetitions return the same binding record.

Migrations `023_organization_authorizations.sql` and
`024_organization_binding.sql` are required. Old APIs without capability
do not display the control. `organization_verified` denotes the
historically confirmed assignment, not unlimited current owner rights.
Binding starts neither cloud Plan nor Apply and replaces no technical
job grant. Real two-organization acceptance, production client registration
and least-privilege provider qualification remain required for #91.

<a id="github-nur-für-repository-funktionen"></a>
## GitHub only for repository features

In STACKIT mode, GitHub is needed only under GitHub forks through **Connect GitHub**.
Start is authenticated through `POST /auth/github/connect` with origin/CSRF.
The OAuth callback is bound to the same existing session and connects the
verified GitHub ID to this user without switching user or tenant.
Identities already assigned elsewhere are rejected; accounts are not merged
based on matching email addresses. Connection is not required for login or
Application Owner orders.

The existing fork-based platform Plan remains a repository feature and
therefore still needs this optional connection. A real isolated
Application Plan is not yet connected through this login change.

<a id="aktivierung-und-bestandskonten"></a>
## Activation and existing accounts

Before activation, migrations `011_stackit_identity.sql` and
`012_stackit_login.sql` must be applied. With `LZC_AUTH_ENABLED=true` and
`LZC_STACKIT_DEVICE_ENABLED=true`, STACKIT becomes primary; GitHub client ID and
client secret are then optional but must be set together.
`LZC_STACKIT_CLI_CLIENT_APPROVED=true` is explicit approval to
reuse the CLI client, not a technical switch to bypass the
registration question. The user explicitly approved usage for Configurator dev on
2026-10-02; the ticket for a dedicated OIDC client
remains open. This dev approval is not production approval.

Existing users can explicitly bind their STACKIT identity with a still-valid old session;
user ID, tenant and saved GitHub assignment are preserved.
An unbound GitHub identity already signed out is not automatically merged on
STACKIT login. Rollout therefore requires
controlled binding of existing accounts before switching.

Current operational limitations are in the [architecture](architecture.md) and
[MVP scope](mvp-scope.md). Run-specific results belong in
their respective CI artifacts, not an ongoing historical report.

<a id="legacy-ablauf-github-als-login"></a>
## Legacy flow: GitHub as login

1. `/auth/github/start` stores a login transaction valid for five minutes in
   PostgreSQL: state hash, browser-binding hash and PKCE verifier. The browser cookie
   is `Secure`, `HttpOnly`, `SameSite=Lax` and has the `__Host-` prefix.
2. The callback atomically consumes the transaction and exchanges the code with PKCE for
   a time-limited GitHub App **user token**. `/user` confirms identity.
   Installation tokens and nonexpiring tokens are rejected.
3. The database creates a personal workspace with membership.
   The application stores the GitHub token in Secrets Manager. Only then does
   the browser receive a random session cookie; the database contains only its hash.
4. The session lasts at most eight hours, with a margin before token expiry. Refresh
   tokens are initially discarded; afterwards signing in again is required.
5. Logout requires exact origin and a session-bound CSRF value. First
   the DB session is invalidated, then its secret deleted.

Drafts are secured for OAuth redirect for at most ten minutes in the tab's
`sessionStorage`, checked for structure and template hash and removed
after return. This replaces neither database persistence nor saving to a fork. No
GitHub tokens, client secrets or session tokens in JavaScript storage.

<a id="vertrauensgrenzen"></a>
## Trust boundaries

- `configurator_app` is neither database owner nor superuser nor BYPASSRLS.
- Configurations, tenants and memberships have forced RLS.
  The server sets user and tenant IDs only transaction-locally
  from a validated session. Missing context grants no access.
- Small SECURITY DEFINER functions manage login/sessions with fixed
  `search_path`; the app may not directly read sessions or memberships
  or change memberships. SQL injection remains a critical
  backend boundary: parameterized queries are mandatory.
- Secrets Manager permissions apply to the entire dedicated instance.
  Paths and stored metadata bind tokens to session, user and tenant.
  This is application authorization, not a per-tenant policy enforced by Vault.
  Instance-wide write permissions were explicitly approved on 2026-09-30.
- No customer repository operation uses operator PATs, app private keys or
  installation tokens. The client secret serves only OAuth code exchange.

<a id="migration-und-release"></a>
## Migration and release

SQL migrations under `app/apps/api/db/` run with `configurator_migration` in a
separate CF task app without route or GitHub/Secrets/Model Serving bindings.
The release pipeline visibly executes `cf push --task`, `cf run-task ... --wait` and then
`cf delete`. The web app never receives the database owner's password.
Migrations are transactional, serialized through advisory lock and protected with SHA-256
against changes to already-applied files. No automatic
down migrations; old releases must remain compatible with the new schema.

In legacy mode, `LZC_AUTH_ENABLED=true` activates login only together with `LZC_GITHUB_CLIENT_ID`
and `LZC_GITHUB_CLIENT_SECRET` from the protected release environment. The API
checks the session function at startup. The release connection test additionally checks
writing, reading and permanently deleting secrets at a random probe path.
Raw CF router logs are not printed in CI, since OAuth codes can appear in URLs.
Application logs contain no request URLs or cookie/token values.

<a id="abnahme-und-offene-arbeiten"></a>
## Acceptance and open work

- [x] GitHub App registered under `lweberru`; client credentials local 0600.
- [x] Build, 25 application tests and six real PostgreSQL integration tests passed.
- [x] Six desktop/mobile browser cases including login redirect,
  draft preservation and logout successful (GitHub simulated).
- [x] CI receives PostgreSQL tests before validation and release.
- [x] Platform output enabled through [CI Apply 36693151989](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36693151989) (no resource change).
- [x] Secrets write permissions enabled through [CI Apply 36693644577](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36693644577) (one update, no replacement).
- [x] [Validation 36693906434](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36693906434) for `cd9d79f` successful, including PostgreSQL and browsers.
- [x] OAuth credentials supplied in release environment and CF backend after explicit approval.
- [x] [Release 36693906545](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36693906545): migration successful; privileged task app removed; web app, PostgreSQL and Secrets connection tests successful.
- [x] [Login release 36695423593](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36695423593): GitHub login enabled, secrets write/read/delete successful; health 200 and anonymous session 401. OAuth redirect, client ID, callback, PKCE S256, state and secure cookie checked live.
- [x] Real GitHub login and logout confirmed by user.
- [ ] Check installation on required repositories and fork prerequisites.
- [x] Fork selection, saving and reopening implemented and tested with simulation; live acceptance in [forks and navigation](forks-and-navigation.md).
- [ ] Implement organizations, invitations and tenant switching. Currently
  each user receives their own isolated workspace.
- [ ] Regularly clean up expired session records and orphaned secrets.
  Expired tokens are unusable; failed deletions are not yet
  a durably processed cleanup job. Complete before wider release.
- [ ] Check distributed rate limit, audit retention and GitHub revocation; current
  start limit applies only per instance, revocations are detected at latest on API use.

<a id="credential-freigabe"></a>
## Credential approval

On 2026-09-30, the user explicitly approved transfer of `LZC_GITHUB_CLIENT_ID` and
`LZC_GITHUB_CLIENT_SECRET` for `lweberru/lz-configurator-dev-7dbff805` to
`stackitcloud/stackit-landing-zone`, environment `lzc-dev-release`, and the
subsequent CF backend binding. Both environment secrets
are stored; `LZC_AUTH_ENABLED=true` is set for the next release.
Live activation and secrets round trip completed successfully with release `36695423593`.
