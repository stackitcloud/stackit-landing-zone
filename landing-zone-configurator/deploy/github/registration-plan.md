# One-time GitHub App registration

[English](registration-plan.md) | [Deutsch](registration-plan.de.md)

<a id="einmalige-github-app-registrierung"></a>

Registration completed by the user on 2026-09-30. The App belongs to the Configurator project;
it is neither a user token nor a central repository service account.

<a id="konkrete-registrierung"></a>

## Registration details

- Name: `LZ Configurator Dev 7dbff805` (availability is checked by GitHub).
- Confirmed development owner: `lweberru`; transferable to `stackitcloud` later.
- Alternative: `stackitcloud`, provided the signed-in user may create Apps for the organization.
  The verified organization membership of `lweberru` is `member`, not `admin`.
- Visibility: publicly installable App for multiple independent users/customers.
- Homepage and OAuth callback: see `app-manifest.json`.
- Repository permissions: Metadata read, Contents write, Administration write.
  GitHub requires Administration write for the fork API. This permission is
  broader than the fork operation offered by the Configurator; therefore limit
  installations to the required repositories. Automatic forks have
  additional GitHub installation prerequisites; see README.
- No operator PATs or installation tokens for user repository actions.
- Keep Expiring User Tokens enabled; initially sign in again after at most 8 hours.

<a id="registrierung-und-credential-ablage"></a>

## Registration and credential storage

After explicit approval, start a short-lived registration helper bound
only to `127.0.0.1`. The local page contains the versioned manifest
and takes the user to GitHub confirmation. Secure state and browser binding;
exchange the code once for client ID/client secret. Do not read existing
browser credentials; no secret in chat or logs.

Store client ID/client secret exclusively under `.local/github/app-registration.json`
with file mode 0600. Do not use a generated GitHub App private key for
repository access. Backend binding and environment secrets follow as a
separate, reviewable deployment step; no secrets in the manifest or frontend.

## Status

- [x] Owner and permissions explicitly approved.
- [x] App registered: https://github.com/apps/lz-configurator-dev-7dbff805
- [x] Client credentials stored locally with mode 0600; no secrets versioned.
- [x] Manifest corrected: `hook_attributes.url` is required even with `active: false`.
- [ ] Confirm installation on selected user repositories.
- [x] Protected backend binding and OAuth redirect verified live (release 36695423593).
- [x] Personal login and logout confirmed by the user.

Installation: https://github.com/apps/lz-configurator-dev-7dbff805/installations/new

Source: https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest
