# Read-only platform check

[English](platform-check.md) | [Deutsch](platform-check.de.md)

<a id="lesende-plattformprüfung"></a>

As of: 2026-09-29. Target: the operator project from the local `landing-zone-configurator.env`, authenticated with its associated service-account file. IDs, keys and tokens are deliberately not repeated here.

<a id="ergebnis"></a>
## Results

| Check | Observation | Conclusion / limitation |
| --- | --- | --- |
| Service-account authentication | Short-lived token successfully obtained | No persistent CLI login changed |
| Read project | Successful; returned project ID matches the input | Project read access demonstrated; no verification of write permissions or organization membership |
| CF organizations | HTTP 200; 0 entries | No organization visible in the queried project/region |
| CF platform offerings | HTTP 200; 2 entries | Offerings accessible; specific foundation/quota still to be selected |
| PostgreSQL Flex instances | HTTP 200; 0 entries | No instance visible |
| PostgreSQL flavors | HTTP 200; 10 entries | Offering readable; HA, size, backup and costs still to be decided |
| Secrets Manager instances | HTTP 200; 0 entries | No instance visible; specific policies/isolation cannot yet be checked |
| Model Serving catalogue | HTTP 200; 10 models | General catalogue readable; not evidence of project-specific activation, inference permissions or booked capacity |
| Object Storage service status | HTTP 404 | Cross-checked against the official CLI: service not yet enabled in the project/region; the first IaC bucket enables it |

The first query used `eu01` as a probe region. Subsequently, **lzc-dev/eu01** was confirmed as the first development environment and recorded locally. Empty lists are not a promise that creation is permitted. List responses describe the service account's current view, not all resources that may exist elsewhere.

The Object Storage 404 occurred both through the installed STACKIT CLI and directly at the documented v2 service-status endpoint. The official CLI treats exactly this service-status 404 in `ProjectEnabled` as not enabled. The provider enables Object Storage when creating the first bucket. No bucket was created, and there was no failed attempt to access a bucket created by us.

Sources: [CLI handling](https://github.com/stackitcloud/stackit-cli/blob/main/internal/pkg/services/object-storage/utils/utils.go), [bucket activation in the pinned provider](https://github.com/stackitcloud/terraform-provider-stackit/blob/v0.114.0/stackit/internal/services/objectstorage/bucket/resource.go).

<a id="wiederholen"></a>
## Repeating the check

See the [development instructions](../app/README.md): `npm run platform:check`. The script uses Node.js system certificates, bounded timeouts, no HTTP redirects carrying tokens, and outputs only aggregated metadata. It returns exit code 1 for unexpected errors. The known Object Storage 404 is now a successful status determination with `enabled: false`; this does not yet mean deployment readiness.

Installed STACKIT CLI during the test: `0.61.0`. Service lists were therefore cross-checked directly through the confirmed APIs; the script still uses the CLI for token exchange and project read access. Older CLI output without JSON was not interpreted as an empty list.

API contracts from the official SDK: [SCF](https://github.com/stackitcloud/stackit-sdk-go/tree/main/services/scf), [PostgreSQL Flex](https://github.com/stackitcloud/stackit-sdk-go/tree/main/services/postgresflex), [Secrets Manager](https://github.com/stackitcloud/stackit-sdk-go/tree/main/services/secretsmanager), [Model Serving](https://github.com/stackitcloud/stackit-sdk-go/tree/main/services/modelserving), [Object Storage](https://github.com/stackitcloud/stackit-sdk-go/tree/main/services/objectstorage).

<a id="konsequenzen-für-den-nächsten-schritt"></a>
## Implications for the next step

- [x] Confirm project read access with the provided identity.
- [x] Read CF/DB/secret offerings or inventories and the model catalogue.
- [x] Confirm target region eu01 and name lzc-dev for development.
- [ ] Define CF foundation/quota.
- [x] Clarify the Object Storage 404: not yet enabled; activation as part of bucket IaC.
- [x] Implement state bootstrap and a separate versioning root; first real bootstrap plan successful.
- [ ] Apply bootstrap/versioning and practically test S3 locking and restore.
- [ ] Verify required create/update permissions against the planned resources; do not infer them from GETs.
- [ ] Plan the CF organization and technical CF access through IaC.
- [ ] Decide DB plan, secret policies and model/capacity selection.
- [ ] Practically demonstrate Runner isolation, private connectivity and S3 locking.

The STACKIT project service account and CF runtime service account are different credentials. The official IaC guide provisions a CF organization and a technical org manager through the STACKIT provider; the CF provider then manages runtime resources. The existing JSON file is therefore not automatically a working `cf login` credential. Bootstrap and secure storage of the generated credentials still need to be planned. [Official CF IaC guide](https://github.com/stackitcloud/terraform-provider-stackit/blob/main/docs/guides/scf_cloudfoundry.md)

<a id="lokale-entwicklungsprüfung"></a>
## Local development checks

- [x] Reproducible installation with Node.js 24.21.0, npm 11.19.0 and `npm ci`.
- [x] Biome lint/format and strict TypeScript checking, including test code.
- [x] Production build of API, shared packages and React UI.
- [x] Five tests: tenant boundary, role separation, invalid identities, health contract, rejected forged login headers.
- [x] HTTP smoke test: built API, Vite UI document and development proxy; processes stopped afterwards.
- [ ] Visual browser acceptance (no functional editor UI yet).
- [ ] GitHub CI execution (workflow created, not yet pushed/executed).
- [ ] CF deployment (no cloud mutation yet).

<a id="iac-fortschritt-nach-der-bestandsaufnahme"></a>
## IaC progress after the inventory

The confirmed environment is lzc-dev/eu01. A real bootstrap plan was successfully created and then checked from the encrypted plan file: **3 Create, 0 Update, 0 Delete**. The plan includes a bucket, credential group and S3 access until 2026-12-28. No Apply was executed.

The first combined plan with S3 versioning failed because the S3 provider already needs valid credentials at plan time. The final structure therefore uses separate roots `bootstrap`, `backend` (versioning) and `platform`. All three are validated; seven mock plan tests and three tests for plan hash/context/expiry pass. IaC CI has been extended accordingly.

The corrected platform check was run again and now completes successfully: Object Storage reports an understandable `enabled: false` with IaC provisioning pending. This is not evidence of an environment already having been created.

<a id="erstes-verwaltungs-backend-angewendet"></a>
## First management backend applied

Seed: 3 resources created; seed protection: versioning enabled. Bootstrap remote backend initialized and plan successful. S3 versioning, reading a previous test-object version and hash-verified backup of encrypted seed states successful. Keys remain separately local; independent durable key custody and a concurrent lock test are outstanding.

<a id="s3-locking-negatives-integrationsergebnis"></a>
## S3 locking: negative integration result

Two separate OpenTofu data directories, the same isolated S3 state key: the first Apply holds a visible `.tflock`, yet the second Plan with `-lock-timeout=0s` succeeds. Separate test with AWS CLI: repeated `put-object --if-none-match '*'` on an existing test object is not rejected with 412. Native S3 locking is therefore ineffective at the tested eu01 endpoint. Test objects and versions were removed; production states were not changed.
