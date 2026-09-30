# GitHub App registration draft

`app-manifest.json` is the reviewable registration draft for lzc-dev. It does not
register an app, create credentials, install an app or activate login by itself.
Owner and final available app name must be chosen during registration.

Use GitHub App user authorization with expiring user access tokens. Repository
operations must use the signed-in user's token, never the operator's GitHub CLI
session, a central PAT, or an installation token. Keep token expiration enabled.

Requested permissions:

- Metadata read: repository identity and access checks.
- Contents write: read templates and commit a configuration to the chosen fork.
- Administration write: required by the fork endpoint; expose no repository
  administration operation through the Configurator beyond creating a fork.

A GitHub App needs installation at the upstream account and the destination
account for API-created forks. Without those prerequisites, offer GitHub's manual
fork page and connect the existing fork afterwards. Do not silently broaden scopes
or use operator credentials. Check these prerequisites with the registered app
before claiming end-to-end fork support.

Callback URL:
`https://lzc-dev-configurator-7dbff805.apps.01.cf.eu01.stackit.cloud/auth/github/callback`

Backend inputs to provision after registration: `LZC_GITHUB_CLIENT_ID` and
`LZC_GITHUB_CLIENT_SECRET`. The client secret must be supplied through protected
runtime configuration, never committed or included in a frontend build. Registration
and binding are not complete yet. Login stays disabled until session persistence,
PKCE/state validation and safe token storage are implemented and verified.

Sources:
- https://docs.github.com/en/apps/creating-github-apps/setting-up-a-github-app/registering-a-github-app
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app
- https://docs.github.com/en/rest/repos/forks#create-a-fork
