export const assistantKnowledgeTopics = {
  schemaVersion: 1,
  engineRevision: "a256f6896d11134fdc351786f1be5eba4e56b2e2",
  topics: [
    {
      id: "credential-foundations",
      file: "credential-foundations.md",
      version: 3,
      checkedOn: "2026-10-29",
      qualification: "local-draft-not-reviewed-release",
      groups: [],
      mandatory: true,
      inputs: [
        "platform_kubernetes_kube_config_override",
        "vpn_pre_shared_keys",
        "firewall_admin_password",
        "firewall_api_credentials",
      ],
      dependencies: [],
      sources: [
        {
          path: "landing-zone-configurator/docs/common-feature-model.md",
          sha256:
            "fbb34277b25bd5e37eafc74952f57eb295af87f3669956612b43a8ccccef791d",
        },
        {
          path: "landing-zone-configurator/docs/deployment-credentials.md",
          sha256:
            "e003def890db3ea64fff99593d8dae7d2cb635541bb5eb2be5a71abea04322e2",
        },
        {
          path: "src/variables.tf",
          sha256:
            "534690b7f98b7ed6af03292dbefc180f05d0ecd6048997b93084f678589681d3",
        },
        {
          path: "src/providers.tf",
          sha256:
            "14edbcc911095468aaa5ee05448246bfce68952f0ddb03c8084c07f38b6ab6d0",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/assistant/dialogue.ts",
          sha256:
            "b0458a83022eaa535d687c705519b313bcdeede0b3869c6f88ab43ec1d697268",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/assistant/service.ts",
          sha256:
            "08d92c79105d2fd65e8e33863b6a8e310db37771ecb4f012a079b185ae069390",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/assistant/editor.ts",
          sha256:
            "5076218b416332f23aee032d0c302d444cef7e07012547e4060b232ea2a92672",
        },
      ],
      externalSources: [
        "https://docs.stackit.cloud/platform/access-and-identity/service-accounts/how-tos/manage-service-account-keys/",
      ],
      scenarios: ["A16", "A23"],
      fieldPaths: [
        "platform_kubernetes_kube_config_override",
        "vpn_pre_shared_keys",
        "vpn_pre_shared_keys[*]",
        "vpn_pre_shared_keys[*].tunnel1",
        "vpn_pre_shared_keys[*].tunnel2",
        "firewall_admin_password",
        "firewall_api_credentials",
        "firewall_api_credentials.api_key",
        "firewall_api_credentials.api_secret",
      ],
      source:
        "landing-zone-configurator/docs/assistant-knowledge/credential-foundations.md",
      text: '# Credential Foundations\n\n## Purpose\n\nSeparate declarative Accelerator configuration from access credentials, secret\nbindings, runtime authorization and cloud execution. This mandatory knowledge\napplies to every service discussion, including pre-configuration template advice.\n\n## Accelerator Contract\n\nOnly supported native Accelerator inputs may be exported. Current output is\ntfvars, not free Terraform or a second YAML schema. The matching Accelerator\ncan consume the configuration outside the Configurator, provided documented\nexternal provider credentials and any required secret inputs are supplied.\nProvider authentication and workload/service secret bindings are different\nrequirements; a STACKIT login alone does not resolve every service credential.\nDo not put Configurator-only secret paths or profile IDs into native inputs.\n\n## Dependencies\n\nEach future service topic must describe its credential requirements explicitly.\nConfiguration, credential availability, permissions and execution readiness are\nseparate facts. A stored profile is not a proof of usable permissions. Current\nauthorization, tenant/owner binding and safe secret resolution must be checked\nby the backend at the authorized operation, never inferred by the model.\n\n## Dialogue\n\nAsk about non-secret business requirements and explain the separate authorized\ncredential setup when needed. Never request a private key, password, API token,\nVPN preshared key, kubeconfig or secret version in chat. Do not ask users for\ntechnical IDs to work around missing configuration support. Do not invent\npermission errors or assume operator credentials are available to a customer.\nIf a credential-binding capability is not implemented, name the limitation;\ndo not claim a complete executable configuration.\n\n## Examples\n\nUser: "Configure the central network and add a firewall later."\nAnswer: prepare only supported network inputs and explain that provisioning\nrequires separate authorized STACKIT provider access. Do not request a key.\n\nUser: "Here is my VPN password; put it in the export."\nAnswer: do not accept or reproduce the secret. Direct the user to the authorized\nbinding workflow. Do not create a placeholder secret value in native configuration.\n\n## Limits\n\nNo model-controlled credential read/write, grant, order, publish, plan, apply or\ndestroy. A configuration proposal requires explicit acceptance and unchanged\nrevision/current authorization. A reviewed receipt or valid export never unlocks\nexecution. Do not promise fully qualified outside-Configurator credential\nportability: the complete binding/runner path remains an acceptance gate.\nDocumentation and examples contain no live credentials, raw state or raw plans.\nRecognizable secret-input checks are not comprehensive DLP or injection proof.\n\n## Credentials\n\nSecrets remain in authorized server-side secret storage and are resolved only\nfor the specific operation. No customer credentials, profile metadata, raw\nprovider errors, state or plans go to Model Serving. Credentials required for\nstandalone Accelerator execution must be externally supplyable through its\ndocumented provider/input contract, not hidden Configurator state. Public PIM\nfacts need no customer credential; authorized product availability is separate.\n\n## Sources\n\nManifest hashes bind local sources. deployment-credentials.md mixes historical\nand current sections; check qualification limits. External key documentation is\nnot runtime-fetched. Review each service binding against actual provider/module\ninputs; Assistant and identity tests are separate evidence.',
      sha256:
        "07e072896406b0d052eca34aee845d9207f86df7d85ef5b0251674d31c974d67",
    },
    {
      id: "stackit-network-components",
      file: "sna.md",
      version: 3,
      checkedOn: "2026-10-12",
      qualification: "local-draft-not-reviewed-release",
      groups: ["network"],
      mandatory: false,
      inputs: ["connectivity", "connectivity_regions"],
      dependencies: ["identity-foundations", "governance-folders"],
      sources: [
        {
          path: "src/modules/connectivity/variables.tf",
          sha256:
            "c9e31385e7a17d36e1752ad14d5b424435212f2d67b140d2f6166f1bf6344af5",
        },
        {
          path: "src/modules/connectivity/1-network-area.tf",
          sha256:
            "2db9c7fd6f831ea823cffbcecb09e2d5b1eb398bbff569ae5943f944b7b34bbc",
        },
        {
          path: "src/variables.tf",
          sha256:
            "534690b7f98b7ed6af03292dbefc180f05d0ecd6048997b93084f678589681d3",
        },
        {
          path: "landing-zone-configurator/app/packages/domain/src/common-validation.ts",
          sha256:
            "fa801f254244eaf9124d7d406aeac95321f55b8d3c1750e9738a37f2d2d8291c",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/assistant/knowledge.ts",
          sha256:
            "141ed56d92cc70924b965def21ea9f7863a4b33e4058bab238abb01b746622ab",
        },
        {
          path: "src/modules/landing-zone/3-network.tf",
          sha256:
            "0f37a5a088f8555a2c3019d63c2a1b4087aab032bd2fb455d391726deb953471",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/assistant/editor.ts",
          sha256:
            "5076218b416332f23aee032d0c302d444cef7e07012547e4060b232ea2a92672",
        },
      ],
      externalSources: [
        "https://registry.terraform.io/providers/stackitcloud/stackit/latest/docs/resources/network_area",
      ],
      scenarios: ["A04", "A05", "A15", "A24"],
      fieldPaths: [
        "connectivity",
        "connectivity.naming_pattern",
        "connectivity.network_area",
        "connectivity.network_area.default_nameservers",
        "connectivity.network_area.default_nameservers[*]",
        "connectivity.network_area.default_prefix_length",
        "connectivity.network_area.max_prefix_length",
        "connectivity.network_area.min_prefix_length",
        "connectivity.network_area.ranges",
        "connectivity.network_area.ranges[*]",
        "connectivity.network_area.transfer_network",
        "connectivity.network_areas",
        "connectivity.network_areas[*]",
        "connectivity.network_areas[*].default_nameservers",
        "connectivity.network_areas[*].default_nameservers[*]",
        "connectivity.network_areas[*].default_prefix_length",
        "connectivity.network_areas[*].max_prefix_length",
        "connectivity.network_areas[*].min_prefix_length",
        "connectivity.network_areas[*].name",
        "connectivity.network_areas[*].ranges",
        "connectivity.network_areas[*].ranges[*]",
        "connectivity.network_areas[*].transfer_network",
        "connectivity_regions",
        "connectivity_regions[*]",
        "connectivity_regions[*].naming_pattern",
        "connectivity_regions[*].network_areas",
        "connectivity_regions[*].network_areas[*]",
        "connectivity_regions[*].network_areas[*].default_nameservers",
        "connectivity_regions[*].network_areas[*].default_nameservers[*]",
        "connectivity_regions[*].network_areas[*].default_prefix_length",
        "connectivity_regions[*].network_areas[*].max_prefix_length",
        "connectivity_regions[*].network_areas[*].min_prefix_length",
        "connectivity_regions[*].network_areas[*].name",
        "connectivity_regions[*].network_areas[*].ranges",
        "connectivity_regions[*].network_areas[*].ranges[*]",
        "connectivity_regions[*].network_areas[*].transfer_network",
      ],
      source: "landing-zone-configurator/docs/assistant-knowledge/sna.md",
      text: "# STACKIT Network Areas (SNA)\n\n## Purpose\n\nSNA is the STACKIT Network Area for central project networking, not AWS VPC,\nShared VPC or Direct Connect. Separate it from firewall, VPN and external sites.\n\n## Accelerator Contract\n\nNative single form: connectivity.network_area; map: connectivity.network_areas\nwith stable keys; regional form: connectivity_regions. Never mix forms.\nArea fields: ranges, transfer_network (IPv4 CIDRs), min_prefix_length,\nmax_prefix_length, default_prefix_length, optional name/default_nameservers.\nPrefix order: min <= default <= max, integers within 0..32. Backend patch schema\nand shared compiler decide editable capabilities, not knowledge text.\n\n## Dependencies\n\nCredential/governance foundations apply. Corporate projects need an area in\nthe same region; omitted corporate retains the Corporate default. Preserve\nreferenced area keys. Project count is no quota guarantee. OPNsense is the\nsupported central firewall, not Palo Alto/Fortinet/AWS Network Firewall; an SNA\nnever implies enabling it.\n\n## Dialogue\n\nReuse context/answers; ask at most three missing questions: unused pool, project\nsubnet size and free transfer subnet. Explain CIDRs and required communication,\nnot invented isolation switches. /16 contains 256 /24s before reservations:\narithmetic, not quota. /16 contains 512 /25s; /25 has128 addresses, not128\nproject subnets. Infrastructure reservations reduce usable capacity.\nAny suggested pool is an assumption until confirmed free.\nOnce inputs are known propose an SNA patch, not another questionnaire. Do not\nrepeat unchanged company/owner/region or ask about firewall/VPN/secret versions\nwhen those are later steps. Inherited firewall/DNS values are not consent:\nwarn about conflicting pools or enabled services without silently changing\nthem. Explicit combined SNA/firewall requests retain firewall/HA requirements:\nreuse a complete saved SNA and continue the firewall contract, not an artificial\nSNA-first restriction. Missing SNA inputs remain actual dependencies.\nProject-specific prefixes override SNA defaults.\n\n## Examples\n\nSynthetic confirmed pool10.64.0.0/16, transfer10.63.0.0/24, fixed /24,\neu01/key default, firewall later. network_areas.default holds these fields;\nretain network_area in existing single drafts. No implicit firewall/routes.\nExport native tfvars, not free Terraform.\n\n## Limits\n\nThe specialized SNA dialogue supports single/map add/edit. Other reviewed public\nsettings use typed native Editor proposals, never implicit migrations or\nexecution. Firewall uses its separate reviewed central\ninfrastructure/HA patch contract, not an implicit part of SNA. Preserve unknown imports outside model\ncontext. Validate before presentation/acceptance; only explicit authorized\nacceptance saves. Never claim deployed. Full overlap, quota, availability and\nfirewall-containment checks remain separate; clean compilation is not proof.\nOnly reviewed Editor paths may change; protected inputs remain excluded.\n\n## Credentials\n\nExternal provider credentials/current permissions are required for provisioning,\nnot for mere draft advice. No keys, passwords, IDs, state, plans or profiles in\nmodel context; do not invent missing-permission errors.\n\n## Sources\n\nManifest hashes bind local connectivity/validation sources. External provider\nlinks are informational, not live/latest behavior. Re-review contract changes;\nAssistant, Common-Configuration and identity tests remain separate evidence.",
      sha256:
        "15ed1b421e4a280afd2e313521666d4a27b0df1e3a5de7f2072f7e1955252fc0",
    },
    {
      id: "identity-foundations",
      file: "identity-foundations.md",
      version: 3,
      checkedOn: "2026-10-12",
      qualification: "local-draft-not-reviewed-release",
      groups: ["identity"],
      mandatory: false,
      inputs: [
        "organization_id",
        "owner_email",
        "company_name",
        "company_code",
        "region",
        "labels",
        "platform_contract_namespace",
      ],
      dependencies: ["credential-foundations"],
      sources: [
        {
          path: "src/variables.tf",
          sha256:
            "534690b7f98b7ed6af03292dbefc180f05d0ecd6048997b93084f678589681d3",
        },
        {
          path: "src/providers.tf",
          sha256:
            "14edbcc911095468aaa5ee05448246bfce68952f0ddb03c8084c07f38b6ab6d0",
        },
        {
          path: "src/main.tf",
          sha256:
            "300c357f9f3eb5e296f77f5a5ebfb1556e8e3f886c0cecfd335810bcddb4d951",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/assistant/editor.ts",
          sha256:
            "5076218b416332f23aee032d0c302d444cef7e07012547e4060b232ea2a92672",
        },
      ],
      externalSources: [],
      scenarios: ["A01", "A21", "A23"],
      fieldPaths: [
        "owner_email",
        "company_name",
        "company_code",
        "organization_id",
        "region",
        "platform_contract_namespace",
        "labels",
        "labels[*]",
      ],
      source:
        "landing-zone-configurator/docs/assistant-knowledge/identity-foundations.md",
      text: '# Organization and Naming Foundations\n\n## Purpose\n\nOrganization, ownership, naming and region precede platform services.\nA company name is not an organization ID or access proof.\n\n## Accelerator Contract\n\nRoots: organization_id, owner_email, company_name, company_code, region, labels,\nplatform_contract_namespace. Namespace is stable handoff metadata, not authorization.\nNames derive from company_code, project codes and environments, not company_name.\nProvider regions must match root/module wiring.\n\n## Dependencies\n\nGovernance uses organization/ownership; regional services and projects use naming.\nCredentials remain separate; dependencies never activate services.\n\n## Dialogue\n\nUse supplied company names verbatim. Explicit suitable-name delegation permits\nreviewable names/codes, not region, guessed emails, Cloud IDs or access.\nPropose organization_id only from the exact user-supplied existing UUID:\nno access verification or tenant binding. owner_email may reuse user requirements,\nsaved foundations or currently verified human login email; never invent it.\nTemplate placeholders are not user decisions. Resolve access outside chat.\nPreserve company/region during SNA-only work; flag remaining placeholders separately.\n\n## Examples\n\nSynthetic naming fragment: company_name = "Example GmbH", company_code = "ex",\nregion = "eu01", labels = { environment = "lab" }. This is not a complete\ndeployable configuration or a grant to create resources.\n\n## Limits\n\nLabels prove neither resource names nor membership. Naming/region changes may\nreplace resources; saved values are not cloud inventory. Preserve imports and\nstable identities. Compilation proves neither permissions nor deployment.\n\n## Credentials\n\nUse externally supplied provider credentials and authorized organization scope.\nNever request service-account keys, tokens or internal credential-profile paths.\n\n## Sources\n\nManifest binds variables/providers/feature model to the engine revision.\nRe-review naming, region and handoff before regeneration; local draft only.',
      sha256:
        "ec40592ee5a9831ed9abfc87cfaf8bc879944f6b5b9f6d22e78c09acce920387",
    },
    {
      id: "governance-folders",
      file: "governance-folders.md",
      version: 3,
      checkedOn: "2026-10-12",
      qualification: "local-draft-not-reviewed-release",
      groups: ["governance"],
      mandatory: false,
      inputs: [
        "rm_folder_parent_id",
        "rm_folders",
        "organization_owners",
        "organization_auditors",
      ],
      dependencies: ["identity-foundations"],
      sources: [
        {
          path: "src/modules/governance/variables.tf",
          sha256:
            "ddd29245d3bd76cf621b2e89663c0571b61313781404b78bb89afc8e57565b23",
        },
        {
          path: "src/modules/governance/1-rm-folders.tf",
          sha256:
            "f1ff318487c780914620a3b516f55b2f17f13af4dd38364937d9567c93cd865b",
        },
        {
          path: "src/modules/governance/3-organization-roles.tf",
          sha256:
            "209a6456b0d627516c36c8cfcfe0cf8444840c8b62ac01d352cef8f0ba4391da",
        },
        {
          path: "src/main.tf",
          sha256:
            "300c357f9f3eb5e296f77f5a5ebfb1556e8e3f886c0cecfd335810bcddb4d951",
        },
        {
          path: "landing-zone-configurator/app/packages/domain/src/common-validation.ts",
          sha256:
            "fa801f254244eaf9124d7d406aeac95321f55b8d3c1750e9738a37f2d2d8291c",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/assistant/editor.ts",
          sha256:
            "5076218b416332f23aee032d0c302d444cef7e07012547e4060b232ea2a92672",
        },
      ],
      externalSources: [],
      scenarios: ["A02", "A23"],
      fieldPaths: [
        "rm_folder_parent_id",
        "organization_owners",
        "organization_owners[*]",
        "organization_auditors",
        "organization_auditors[*]",
        "rm_folders",
        "rm_folders[*]",
        "rm_folders[*].description",
        "rm_folders[*].name",
        "rm_folders[*].owner_emails",
        "rm_folders[*].owner_emails[*]",
        "rm_folders[*].reader_emails",
        "rm_folders[*].reader_emails[*]",
      ],
      source:
        "landing-zone-configurator/docs/assistant-knowledge/governance-folders.md",
      text: '# Governance, Folders and Roles\n\n## Purpose\n\nSeparate platform, corporate/public and sandbox administration with deliberate\norganization and folder access.\n\n## Accelerator Contract\n\nNative roots: rm_folder_parent_id, rm_folders, organization_owners and\norganization_auditors. Root governance is unconditional; folder_container_ids\nfeed downstream modules. Names allow 1-40 characters. The pinned provider rejects\nmeaningful folder descriptions. Parent selection does not discover folders or\nprove organization access.\n\n## Dependencies\n\nOrganization/naming foundations and separate provider bindings. Management,\nconnectivity, platform and project templates use governance outputs.\n\n## Dialogue\n\nNaming delegation permits existing folder names only, not role grants.\nExplicit role requests can propose additive organization_owners/auditors or\nexisting folder owner_emails/reader_emails. Reuse the requested saved owner_email,\nverified human email or explicit user address. A template contact, developer\nlogin or service account is not a human identity. Ask for missing email or target\nfolders; never guess all folders. Preserve existing subjects, keys and metadata.\nOrganization owners cover folders; native wiring skips duplicate folder grants.\nFolder readers use auditor. Field acceptance saves a draft, never IAM rights,\nConfigurator membership or tenant binding; actual IAM needs reviewed Plan/Apply.\n\n## Examples\n\n"Nutze die hinterlegte Email als Organisationsverantwortlichen" proposes adding\nthe saved address to organization_owners, preserving current entries. It is not\njust an owner_email contact update. Empty role lists add no assignments and do\nnot prove absence of independently managed IAM rights.\n\n## Limits\n\nOwner roles have broad impact. No new folder keys, parent IDs, removed subjects\nor live grants in chat. Preserve native defaults for omitted folders and explicit\nempty maps. Imports, ownership and IAM effects need separate verification.\n\n## Credentials\n\nAuthorized Resource Manager/IAM scope is external to the model. No credentials\nor hidden Configurator references in tfvars.\n\n## Sources\n\nGovernance variables, native folder/organization assignments, root calls and\ncommon validation; manifest hashes identify the reviewed local source snapshot.\n',
      sha256:
        "3a82f540d113bbbb671f7a4cfd43f0a153cef3fcbcff9e8a178f81065403ebf4",
    },
    {
      id: "management-state",
      file: "management-state.md",
      version: 2,
      checkedOn: "2026-10-21",
      qualification: "local-draft-not-reviewed-release",
      groups: ["management"],
      mandatory: false,
      inputs: ["bucket_naming"],
      dependencies: ["governance-folders"],
      sources: [
        {
          path: "src/main.tf",
          sha256:
            "300c357f9f3eb5e296f77f5a5ebfb1556e8e3f886c0cecfd335810bcddb4d951",
        },
        {
          path: "src/modules/management/variables.tf",
          sha256:
            "18dfe8a96a86a7a7f000cca741d8b52211437dba7e326ccb3871489afda5006a",
        },
        {
          path: "src/modules/management/1-project.tf",
          sha256:
            "06b018417f0b10b5e7a48cc2f1709bf817b3cef38b5030d211737838fec5176c",
        },
        {
          path: "src/modules/management/2-secrets-manager.tf",
          sha256:
            "5b6726907ccf710537d65e44da7326e984e8175b2c69e36b1eae74f7ee74ebc8",
        },
        {
          path: "src/modules/management/3-object-storage.tf",
          sha256:
            "3adda3f12df344f2b7db40a32f606c755ccd45ab84ed4d5cd6d59174c16c4f3b",
        },
        {
          path: "src/modules/management/4-service-account.tf",
          sha256:
            "06b94bd9d34475c55db7e0f807a309658ae2b3ae06200c7166f7c2d7ff764703",
        },
        {
          path: "landing-zone-configurator/docs/common-feature-model.md",
          sha256:
            "fbb34277b25bd5e37eafc74952f57eb295af87f3669956612b43a8ccccef791d",
        },
        {
          path: "landing-zone-configurator/docs/deployment-credentials.md",
          sha256:
            "e003def890db3ea64fff99593d8dae7d2cb635541bb5eb2be5a71abea04322e2",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/deployments/preparations.ts",
          sha256:
            "86a2708906940ec745aa8f80fa0d9fedbedcc98ad2f6eec38a8eb6775dd25d36",
        },
        {
          path: "landing-zone-configurator/app/packages/domain/src/initial-plan.ts",
          sha256:
            "5a5b2fe26d1231d1e2eb866cb82df35720f4cd366043723fba42fe166d7a6197",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/assistant/editor.ts",
          sha256:
            "5076218b416332f23aee032d0c302d444cef7e07012547e4060b232ea2a92672",
        },
      ],
      externalSources: [],
      scenarios: ["A03", "A16", "A23"],
      fieldPaths: ["bucket_naming"],
      source:
        "landing-zone-configurator/docs/assistant-knowledge/management-state.md",
      text: "# Management Project and State Foundations\n\n## Purpose\n\nManagement project, state storage and operating identities; distinguish optional\nmonitoring and the backend of the current Accelerator deployment.\n\n## Accelerator Contract\n\nmodule.management always exists under the governance platform folder; no\nmanagement_enabled switch. Root inputs derive ownership, naming and labels.\nSecrets Manager is a foundation, independent of workload secretsmanager_enabled.\nBackend bootstrap/configuration is a separate execution prerequisite.\n\nbucket_naming defaults to project-id: all management/workload bucket names contain\nthe full owning project UUID and distinct purpose suffixes within 63 characters.\nSTACKIT names are global. Explicit legacy preserves existing bucket names; never\nswitch existing buckets without reviewing replacement/migration. A failed Apply\nwith no buckets can keep its original project/state and use project-id naming.\n\n## Dependencies\n\nGovernance, naming and credentials. Monitoring, audit and federation stay optional.\n\n## Dialogue\n\n“Only SNA first” scopes the draft change, not a targeted cloud operation. Full\nnative Apply includes management and other enabled inputs. Discuss ownership,\nlifecycle and recovery without requesting state or credentials.\n\n## Examples\n\nobservability=null, audit_logs=null, federated_identity_providers=[] disables\noptional services, not management/governance. This is not a complete run.\n\n## Limits\n\nA bucket proves no backend setup, migration, encryption, locking or recovery.\nNever pull/mutate state as a chat action. Plan, Apply, Destroy, recovery and\npublication require separate authorization. No targeted Terraform workaround.\nA source correction may reuse a failed Bootstrap checkpoint only after explicit\nowner reconciliation of its exact state version, with supported pinned provenance\nand no lock, migration, separate recovery or active run. Use a new preparation\nand reviewed Plan; never restart with empty state or retry the consumed Plan.\n\n## Credentials\n\nUse approved external bindings. No keys, passphrases, state or plans in chat.\n\n## Sources\n\nFingerprint root/management and credential docs. Re-review before regeneration;\nsource snapshots do not qualify operational recovery.\n",
      sha256:
        "33139dc2767df839f67b761b2084ad43cb5747693f8ef6b6bb80d6ae18f4d94e",
    },
    {
      id: "observability",
      file: "observability.md",
      version: 2,
      checkedOn: "2026-10-21",
      qualification: "local-draft-not-reviewed-release",
      groups: ["management"],
      mandatory: false,
      inputs: ["observability"],
      dependencies: ["management-state"],
      sources: [
        {
          path: "src/variables.tf",
          sha256:
            "534690b7f98b7ed6af03292dbefc180f05d0ecd6048997b93084f678589681d3",
        },
        {
          path: "src/modules/management/variables.tf",
          sha256:
            "18dfe8a96a86a7a7f000cca741d8b52211437dba7e326ccb3871489afda5006a",
        },
        {
          path: "src/modules/management/5-observability.tf",
          sha256:
            "5d5e5e0c6e75679c07cf54a6885acd71b278ed16ad594b36383edbca7163bd18",
        },
        {
          path: "landing-zone-configurator/app/packages/domain/src/observability-plans.ts",
          sha256:
            "04b12f2744c453ff44f7b386ba6d6b7052b53f66fc483d46e9d5af0f5f75bbe5",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/credentials/catalogues.ts",
          sha256:
            "bbd12b1dfbe5c8c73da327db32ff587d3b675cb3ec1e93cfb3710beb49135d15",
        },
        {
          path: "src/modules/landing-zone/variables.tf",
          sha256:
            "b42f23055c9b2cf2878bf4c38a44dc8aa1a4a36ba8af32ccbb6a3a4574d00b8f",
        },
        {
          path: "src/modules/platform-kubernetes/variables.tf",
          sha256:
            "e28b32bc80ca8c3e6a74c12b93318912e30af17f2c7b7bc2d8b37361cf7514e7",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/assistant/service.ts",
          sha256:
            "08d92c79105d2fd65e8e33863b6a8e310db37771ecb4f012a079b185ae069390",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/assistant/model-serving.ts",
          sha256:
            "7cb7830953c356f9c6ec7341ed4e6e03e2134449d3d178147d0936e23d66a89e",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/assistant/editor.ts",
          sha256:
            "5076218b416332f23aee032d0c302d444cef7e07012547e4060b232ea2a92672",
        },
      ],
      externalSources: [
        "https://docs.stackit.cloud/products/logging-and-monitoring/observability/reference/service-plans-observability/",
        "https://github.com/stackitcloud/stackit-sdk-go/blob/main/services/observability/v1api/model_plan.go",
      ],
      scenarios: ["A03", "A09", "A10", "A24"],
      fieldPaths: [
        "observability",
        "observability.acl",
        "observability.acl[*]",
        "observability.logs_retention_days",
        "observability.metrics_retention_days",
        "observability.metrics_retention_days_1h_downsampling",
        "observability.metrics_retention_days_5m_downsampling",
        "observability.plan_name",
        "observability.traces_retention_days",
      ],
      source:
        "landing-zone-configurator/docs/assistant-knowledge/observability.md",
      text: "# Central and Project Observability\n\n## Purpose\n\nChoose signals, scope, retention and dashboard access for operating needs.\n\n## Accelerator Contract\n\nobservability=null disables central management monitoring. Project and\nplatform_kubernetes have separate nested observability contracts. Central fields:\nplan_name, acl and logs/traces/metrics/downsampling retention. Project monitoring\nimplies neither central monitoring nor its authorization.\n\n## Dependencies\n\nManagement, credentials, project/cluster, ingestion and deliberate ACLs.\nTelemetry does not prove audit logging.\n\n## Dialogue\n\nClarify signals/projects, retention and access. Reuse live plan catalogues;\nnative defaults prove no availability, quota, price or cross-region support.\n\n## Examples\n\nFor metrics_retention_days=30, propose that value and the user's plan/ACL.\nOmit other retention overrides; do not copy sample values or repeat answered ACLs.\nAll central retention fields accept null/omission for service defaults.\nFresh live capacities override static families per signal; missing data uses the\nreviewed fallback, not an availability claim. Monitoring has metrics only;\nFrontend/MetricsEndpoint have no configurable retention. Unknown support is not\npermission. Whole-day limits: logs/traces 1-30, metrics/downsampling 1-780.\nNever change plans or discard saved values silently. Optional overrides are not\nmandatory decisions. Editor, preparation and proposal acceptance share validation.\n\n## Limits\n\nEstimates need measured volume and current limits. Default ACLs are not\ninherently private. Demos prove no production coverage. Typed Editor proposals\nchange only the local draft; execution is separate.\n\n## Credentials\n\nSeparate provisioning from ingestion/dashboard access. No passwords, tokens,\nOTLP secrets or customer logs in chat.\n\n## Sources\n\nNative variables and manifest/engine binding; refresh after review.\nLive product facts and operational qualification remain separate.\n",
      sha256:
        "4f9782dcc14ae4a83857ff539c462347f45e81c026ffb7bd5e0388c177ed9649",
    },
    {
      id: "audit-logs",
      file: "audit-logs.md",
      version: 4,
      checkedOn: "2026-11-06",
      qualification: "local-draft-not-reviewed-release",
      groups: ["management"],
      mandatory: false,
      inputs: ["audit_logs"],
      dependencies: ["management-state"],
      sources: [
        {
          path: "src/variables.tf",
          sha256:
            "534690b7f98b7ed6af03292dbefc180f05d0ecd6048997b93084f678589681d3",
        },
        {
          path: "src/main.tf",
          sha256:
            "300c357f9f3eb5e296f77f5a5ebfb1556e8e3f886c0cecfd335810bcddb4d951",
        },
        {
          path: "src/modules/management/variables.tf",
          sha256:
            "18dfe8a96a86a7a7f000cca741d8b52211437dba7e326ccb3871489afda5006a",
        },
        {
          path: "src/modules/management/6-audit-logs.tf",
          sha256:
            "6ac3743cab43e0c0149fd92267e3315b31f618e8893e09903d78d184fb339d43",
        },
        {
          path: "src/audit-coverage.tf",
          sha256:
            "0b9b2f5f63a4367688c7d07fc6850b1436e52529d6d044ca357ae37133629fdb",
        },
        {
          path: "src/platform-contract.tf",
          sha256:
            "d710a8f41bcf94bb8e933df6e210847fcf781018a526d369885e4410fbc330e7",
        },
        {
          path: "src/application/audit.tf",
          sha256:
            "d03dad829c2e7af3ce3187f1393fbf15d458f6e3c41abb84f98b934e9c88f41d",
        },
        {
          path: "src/application/variables.tf",
          sha256:
            "c184c2677b23cab5aa57d4a53541ee18ef2d34795cbe1d18417e9f4222cf221e",
        },
        {
          path: "src/modules/management/3-object-storage.tf",
          sha256:
            "3adda3f12df344f2b7db40a32f606c755ccd45ab84ed4d5cd6d59174c16c4f3b",
        },
        {
          path: "landing-zone-configurator/app/packages/contracts/src/recovery/catalogue.ts",
          sha256:
            "2d8231b4e96374663c3cf79ddf8417b74671481605e4cca13fcddcbbb8e4f9ef",
        },
        {
          path: "src/modules/management/5-observability.tf",
          sha256:
            "5d5e5e0c6e75679c07cf54a6885acd71b278ed16ad594b36383edbca7163bd18",
        },
        {
          path: "src/modules/management/outputs.tf",
          sha256:
            "9e0e181769e941a05d42f2db72b041e92eca9115e91909fb6f288fa991868a26",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/assistant/editor.ts",
          sha256:
            "5076218b416332f23aee032d0c302d444cef7e07012547e4060b232ea2a92672",
        },
      ],
      externalSources: [],
      scenarios: ["A03", "A16", "A23", "A24"],
      fieldPaths: [
        "audit_logs",
        "audit_logs.acl",
        "audit_logs.acl[*]",
        "audit_logs.link_scopes",
        "audit_logs.link_scopes[*]",
        "audit_logs.link_scopes[*].resource_id",
        "audit_logs.link_scopes[*].resource_type",
        "audit_logs.managed_resources",
        "audit_logs.retention_days",
        "audit_logs.router_egress_cidrs",
        "audit_logs.router_egress_cidrs[*]",
        "audit_logs.s3_object_lock",
      ],
      source:
        "landing-zone-configurator/docs/assistant-knowledge/audit-logs.md",
      text: "# Audit Routing and Archive Retention\n\n## Purpose\n\nAudit routing.\n\n## Accelerator Contract\n\naudit_logs=null skips routing/retention, not archive bucket.\nSinks: S3 + ONE query store. With central observability,\nuse its OTLP endpoint and built-in Grafana Audit Logs Dashboard via technical\ncredential, no Grafana admin; no separate Logs instance/tokens/destination.\nWithout Observability: Logs. Needs logs-capable plan, not\nMonitoring/Frontend/MetricsEndpoint. Observability has own retention/cost;\nretention_days controls S3 and, only in fallback, Logs.\nDev Plan/Apply removes dedicated Logs/history/tokens/target; adds Observability\ntarget/credential. S3/Router/links/projects stay. No order upgrade for linked\nprojects, no historical replay. Dashboard: 24h/all filters; may lag. UUIDs are\nmetadata. acl controls Logs clients, observability.acl Observability.\nRouter ranges join the selected store's ACL, preserving clients.\nrouter_egress_cidrs=null uses public STACKIT feed (not Router-only); nonempty IPv4\nlist narrows. Authentication required; empty feed fails.\nObject Lock defaults true, including nested null; retention 180. Explicit false\nopts out before creation. With lock: 1..365 days, GOVERNANCE; not reversible\nor compliance certification.\nOrganization links capture ONLY organization events, no inheritance.\nmanaged_resources=false by default; true links managed folders/projects and new\norders via platform contract. Existing unlinked orders need approved platform\nupgrade + fresh Plan/Apply. No explicit link_scopes with managed coverage.\nManaged scopes same-region; others need reviewed routers. link_scopes supports\norganization/folder/project. External links need reviewed import.\n\n## Dependencies\n\nCentral identity, same-region router/link. Default workload identities cannot\nread central ingestion secrets.\n\n## Dialogue\n\nAsk retention/ACL/Lock/coverage; preserve choices, defaults are not consent.\nEditor creation needs explicit retention/ACL/Lock. Managed coverage uses\nmanaged_resources=true, no invented IDs.\n\n## Examples\n\nDraft: audit_logs={retention_days=90,s3_object_lock=false}.\n\n## Limits\n\nFuture events only. Default rights exclude audit mutation; Owner/inherited grants\ncan alter routing: no deny guarantee. Verify query/S3/dashboard delivery/access.\nRecovery preserves links; lost secrets need exact approved revocation + fresh\nPlan/Apply, never fabricated keys.\n\n## Credentials\n\nNo tokens, S3 keys, State or audit contents in chat/public contracts.\nProtected execution only.\n\n## Sources\n\nManifest binds sources; configuration proves no delivery/compliance.\n",
      sha256:
        "81e7f15ca6db913e4d0fefa882d9e4ca7ee7c60b1030852252fb3c57b32bff08",
    },
    {
      id: "federated-identities",
      file: "federated-identities.md",
      version: 1,
      checkedOn: "2026-10-10",
      qualification: "local-draft-not-reviewed-release",
      groups: ["management"],
      mandatory: false,
      inputs: ["federated_identity_providers"],
      dependencies: ["management-state"],
      sources: [
        {
          path: "src/variables.tf",
          sha256:
            "534690b7f98b7ed6af03292dbefc180f05d0ecd6048997b93084f678589681d3",
        },
        {
          path: "src/main.tf",
          sha256:
            "300c357f9f3eb5e296f77f5a5ebfb1556e8e3f886c0cecfd335810bcddb4d951",
        },
        {
          path: "src/modules/management/variables.tf",
          sha256:
            "18dfe8a96a86a7a7f000cca741d8b52211437dba7e326ccb3871489afda5006a",
        },
        {
          path: "src/modules/management/4-service-account.tf",
          sha256:
            "06b94bd9d34475c55db7e0f807a309658ae2b3ae06200c7166f7c2d7ff764703",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/assistant/editor.ts",
          sha256:
            "5076218b416332f23aee032d0c302d444cef7e07012547e4060b232ea2a92672",
        },
      ],
      externalSources: [],
      scenarios: ["A03", "A16", "A23"],
      fieldPaths: [
        "federated_identity_providers",
        "federated_identity_providers[*]",
        "federated_identity_providers[*].assertions",
        "federated_identity_providers[*].assertions[*]",
        "federated_identity_providers[*].assertions[*].item",
        "federated_identity_providers[*].assertions[*].operator",
        "federated_identity_providers[*].assertions[*].value",
        "federated_identity_providers[*].issuer",
        "federated_identity_providers[*].name",
      ],
      source:
        "landing-zone-configurator/docs/assistant-knowledge/federated-identities.md",
      text: '# Federated Operating Identities\n\n## Purpose\n\nAllow narrowly scoped external workload identities to operate through the\nmanagement service account without treating federation as a general login switch.\n\n## Accelerator Contract\n\nNative federated_identity_providers is a list of name, issuer and assertions\nwith item/operator/value. The management module attaches this configuration to\nits service-account workflow. Federation does not create Configurator users,\nreplace their authorization or enable every external identity provider feature.\n\n## Dependencies\n\nManagement operating identity, provider/IAM permissions and a verified issuer\nand assertion contract. Governance rights remain independently scoped.\n\n## Dialogue\n\nAsk which CI/workload must act, who owns the issuer and which repository,\nenvironment or subject assertions limit trust. Do not infer "trust all" from\na vendor name. Verify issuer/assertions before advising; never request bearer\ntokens, signing keys or identity-provider secrets.\n\n## Examples\n\nSynthetic opt-out: federated_identity_providers = []. Enabling federation needs\nan explicit reviewed issuer and least-privilege assertions, not a guessed sample\noperator, wildcard subject or credentials copied from a pipeline.\n\n## Limits\n\nSource schema support is not issuer compatibility or successful token exchange.\nOperators, claims, audience and IAM privileges need independent verification.\nNative Editor proposals support typed issuer/assertion configuration, not live\ntrust grants, automatic identity creation or scope escalation.\n\n## Credentials\n\nProvisioning credentials and exchanged workload tokens stay outside configuration\nhistory and model context. Bind credentials externally for native execution;\nfederation is not permission to rotate existing model/provider tokens.\n\n## Sources\n\nThe management variable and implementation contract is authoritative. Manifest\nfingerprints track the reviewed local revision, not external issuer freshness\nor a production security qualification.',
      sha256:
        "47e2fff9ad48a4227672a20410bdd1cd8bb07a1b7807240868fad040f0876570",
    },
    {
      id: "dns-zones",
      file: "dns-zones.md",
      version: 6,
      checkedOn: "2026-10-16",
      qualification: "local-draft-not-reviewed-release",
      groups: ["network"],
      mandatory: false,
      inputs: ["connectivity", "connectivity_regions"],
      dependencies: ["stackit-network-components"],
      sources: [
        {
          path: "src/modules/connectivity/variables.tf",
          sha256:
            "c9e31385e7a17d36e1752ad14d5b424435212f2d67b140d2f6166f1bf6344af5",
        },
        {
          path: "src/modules/connectivity/6-dns-zones.tf",
          sha256:
            "3ed40a2dcf27f44816fbc0c5296ba259f4a9c11d1dd4b667a861a423132e3269",
        },
        {
          path: "src/modules/landing-zone/7-dns-zone.tf",
          sha256:
            "2cbe38b24e7e840b61b0ecc5e8a72d893e64d782837a6a8ec03a6b6776f6df4f",
        },
        {
          path: "src/modules/connectivity/1-network-area.tf",
          sha256:
            "2db9c7fd6f831ea823cffbcecb09e2d5b1eb398bbff569ae5943f944b7b34bbc",
        },
        {
          path: "src/main.tf",
          sha256:
            "300c357f9f3eb5e296f77f5a5ebfb1556e8e3f886c0cecfd335810bcddb4d951",
        },
        {
          path: "landing-zone-configurator/app/packages/domain/src/common-validation.ts",
          sha256:
            "fa801f254244eaf9124d7d406aeac95321f55b8d3c1750e9738a37f2d2d8291c",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/assistant/editor.ts",
          sha256:
            "5076218b416332f23aee032d0c302d444cef7e07012547e4060b232ea2a92672",
        },
      ],
      externalSources: [
        "https://docs.stackit.cloud/products/network/core-networking/dns/how-tos/manage-dns-zones/",
        "https://raw.githubusercontent.com/stackitcloud/terraform-provider-stackit/v0.114.0/stackit/internal/services/dns/zone/resource.go",
      ],
      scenarios: ["A04", "A05", "A09", "A12", "A15", "A24"],
      fieldPaths: [
        "connectivity.dns_zones",
        "connectivity.dns_zones[*]",
        "connectivity.dns_zones[*].acl",
        "connectivity.dns_zones[*].contact_email",
        "connectivity.dns_zones[*].default_ttl",
        "connectivity.dns_zones[*].description",
        "connectivity.dns_zones[*].dns_name",
        "connectivity.dns_zones[*].name",
        "connectivity.dns_zones[*].network_area_key",
        "connectivity.dns_zones[*].region",
        "connectivity.dns_zones[*].type",
        "connectivity_regions[*].dns_zones",
        "connectivity_regions[*].dns_zones[*]",
        "connectivity_regions[*].dns_zones[*].acl",
        "connectivity_regions[*].dns_zones[*].contact_email",
        "connectivity_regions[*].dns_zones[*].default_ttl",
        "connectivity_regions[*].dns_zones[*].description",
        "connectivity_regions[*].dns_zones[*].dns_name",
        "connectivity_regions[*].dns_zones[*].name",
        "connectivity_regions[*].dns_zones[*].network_area_key",
        "connectivity_regions[*].dns_zones[*].region",
        "connectivity_regions[*].dns_zones[*].type",
      ],
      source: "landing-zone-configurator/docs/assistant-knowledge/dns-zones.md",
      text: "# DNS Zones and Resolver Assignment\n\n## Purpose\n\nSeparate authoritative DNS zones, records and SNA resolvers.\n\n## Accelerator Contract\n\nZone fields: dns_name, name, description, default_ttl, type, contact_email, acl,\nnetwork_area_key (existing SNA/project). Project zones use dns_zone_name;\nSNA default_nameservers sets resolvers, not zones.\n\n## Dependencies\n\nExisting SNA/project; Kubernetes/namespace DNS follows its own contracts.\n\n## Dialogue\n\nFree primary-zone suffixes:\nruns.onstackit.cloud, stackit.rocks, stackit.gg, stackit.zone, stackit.run.\nstackit.cloud is NOT a provided suffix. Add exactly ONE lowercase DNS label:\nletters/digits/hyphens, no leading/trailing hyphen, max63 characters.\nReuse confirmed domains. Requested remaining settings: propose name (lowercase/\nhyphens,max63), factual description(max1024), TTL3600s/native baseline;300s for\nexplicit frequent changes (range60..99999999). Explain caching/change tradeoff.\ntype: primary/secondary, never public/private visibility. Both are authoritative:\nprimary manages records at STACKIT (choose for new company zones); secondary\nreplicates external primaries. Their configuration is absent from this module:\nno complete secondary setup; never silently convert an existing secondary.\nContact: preserve an existing DNS contact; otherwise propose saved owner_email,\nthen the currently verified human login email as a reviewable default. Explain\nits source; never invent an address. Ask only if no contact is known. ACL currently\nhas NO enforcement in pinned provider, never promise restricted access; retain\nunless explicitly supplied. Preserve area unless explicit valid reassignment.\nAvailability unverified; free subdomain is NOT free DNS service.\n\n## Examples\n\nExample GmbH: example-gmbh.runs.onstackit.cloud; name example-gmbh-dns, TTL3600s.\ndev/prod/test below it are records, not additional free-zone labels.\n\n## Limits\n\nDedicated central-DNS dialogue: EXISTING-key patches only, no creation/regional\nconversion. Native Editor: explicit add/update/complete-set replacement,\nincluding regional zones. Corrections reuse zone keys; complete sets expose\nreviewable removals. Add only on explicit additional intent. Ask the target if\nseveral zones are ambiguous; preserve omitted fields.\nField-selection acceptance saves, never deploys; remaining suggestions stay available.\nNo SNA-only zones; empty map none.\nNo propagation/certificate/reachability/delegation proof.\n\n## Credentials\n\nSeparate provider/registrar access; no passwords, tokens or signing keys in chat.\n\n## Sources\n\nNative manifest and pinned provider0.114.0, reviewed2026-10-12.\nListed runs.onstackit.cloud controls over singular run.onstackit.cloud typo.",
      sha256:
        "4a1f648d10e6adff0561a9e0a81a03c8e5bc10948563d352d2a626a56f76e895",
    },
    {
      id: "firewall-infrastructure",
      file: "firewall-infrastructure.md",
      version: 5,
      checkedOn: "2026-10-13",
      qualification: "local-draft-not-reviewed-release",
      groups: ["network", "firewall"],
      mandatory: false,
      inputs: ["connectivity", "connectivity_regions"],
      dependencies: ["stackit-network-components"],
      sources: [
        {
          path: "src/modules/connectivity/variables.tf",
          sha256:
            "c9e31385e7a17d36e1752ad14d5b424435212f2d67b140d2f6166f1bf6344af5",
        },
        {
          path: "src/modules/connectivity/5-firewall.tf",
          sha256:
            "e2d3186eed0e4ddb5ac6158b75ca037e3ce3bc05650d598e18b68ce5ae9a7e1e",
        },
        {
          path: "src/modules/connectivity/3-external-network.tf",
          sha256:
            "b89087871dcc96219d41f09cd452bdcbe75d33758b09673fdfbab0461a829c33",
        },
        {
          path: "src/modules/connectivity/4-internal-network.tf",
          sha256:
            "55a60f45e45fd8cb6ddd6633e47aaf9c8285bb99ce470314cfd57ff25c0b7152",
        },
        {
          path: "src/modules/firewall-config/5-ha-sync.tf",
          sha256:
            "0cf264ea4e1bbc487d65e6ee31ef9fd3ad75f758087239e5bc071ba38df3e39f",
        },
        {
          path: "src/modules/firewall-config/variables.tf",
          sha256:
            "91ddcfba3028268a01e939f36dd8a8f35758a6229da78f28f9b02a57cca3c803",
        },
        {
          path: "src/main.tf",
          sha256:
            "300c357f9f3eb5e296f77f5a5ebfb1556e8e3f886c0cecfd335810bcddb4d951",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/assistant/editor.ts",
          sha256:
            "5076218b416332f23aee032d0c302d444cef7e07012547e4060b232ea2a92672",
        },
      ],
      externalSources: [],
      scenarios: ["A04", "A06", "A15", "A24"],
      fieldPaths: [
        "connectivity.firewall",
        "connectivity.firewall.flavor",
        "connectivity.firewall.ha",
        "connectivity.firewall.ha.backup_lan_ip",
        "connectivity.firewall.ha.backup_name",
        "connectivity.firewall.ha.backup_wan_ip",
        "connectivity.firewall.ha.backup_zone",
        "connectivity.firewall.ha.lan_vip",
        "connectivity.firewall.ha.vhid",
        "connectivity.firewall.lan_ip",
        "connectivity.firewall.lan_network_range",
        "connectivity.firewall.name",
        "connectivity.firewall.volume_performance_class",
        "connectivity.firewall.volume_size",
        "connectivity.firewall.wan_ip",
        "connectivity.firewall.wan_network_range",
        "connectivity.firewall.zone",
        "connectivity.firewalls",
        "connectivity.firewalls[*]",
        "connectivity.firewalls[*].flavor",
        "connectivity.firewalls[*].ha",
        "connectivity.firewalls[*].ha.backup_lan_ip",
        "connectivity.firewalls[*].ha.backup_name",
        "connectivity.firewalls[*].ha.backup_wan_ip",
        "connectivity.firewalls[*].ha.backup_zone",
        "connectivity.firewalls[*].ha.lan_vip",
        "connectivity.firewalls[*].ha.vhid",
        "connectivity.firewalls[*].lan_ip",
        "connectivity.firewalls[*].lan_network_range",
        "connectivity.firewalls[*].name",
        "connectivity.firewalls[*].volume_performance_class",
        "connectivity.firewalls[*].volume_size",
        "connectivity.firewalls[*].wan_ip",
        "connectivity.firewalls[*].wan_network_range",
        "connectivity.firewalls[*].zone",
        "connectivity_regions[*].firewalls",
        "connectivity_regions[*].firewalls[*]",
        "connectivity_regions[*].firewalls[*].flavor",
        "connectivity_regions[*].firewalls[*].ha",
        "connectivity_regions[*].firewalls[*].ha.backup_lan_ip",
        "connectivity_regions[*].firewalls[*].ha.backup_name",
        "connectivity_regions[*].firewalls[*].ha.backup_wan_ip",
        "connectivity_regions[*].firewalls[*].ha.backup_zone",
        "connectivity_regions[*].firewalls[*].ha.lan_vip",
        "connectivity_regions[*].firewalls[*].ha.vhid",
        "connectivity_regions[*].firewalls[*].lan_ip",
        "connectivity_regions[*].firewalls[*].lan_network_range",
        "connectivity_regions[*].firewalls[*].name",
        "connectivity_regions[*].firewalls[*].volume_performance_class",
        "connectivity_regions[*].firewalls[*].volume_size",
        "connectivity_regions[*].firewalls[*].wan_ip",
        "connectivity_regions[*].firewalls[*].wan_network_range",
        "connectivity_regions[*].firewalls[*].zone",
      ],
      source:
        "landing-zone-configurator/docs/assistant-knowledge/firewall-infrastructure.md",
      text: '# OPNsense Firewall Infrastructure and HA\n\n## Purpose\n\nCentral OPNsense active/passive HA; never implicit for SNA-only.\n\n## Accelerator Contract\n\nconnectivity.firewall applies per area; firewalls maps stable area keys.\nNative zone/flavor/name, volume class/size, LAN/WAN CIDRs/IPs; ha is an object\nrequiring a different backup_zone, with optional backup_name/node IPs/lan_vip/vhid.\nLAN VIP is the platform next hop. HA uses unicast CARP, pfsync over LAN and XMLRPC.\nPost-API policy sync separately replicates aliases/categories/rules/NAT/routes.\n\n## Dependencies\n\nSNA pools, area keys and authorized zones/flavors. Confirm free LAN/WAN subnets;\ntransfer network is not HA transport. Dependencies never activate services.\n\n## Dialogue\n\nRetain requested HA. Combined requests continue with firewall on complete saved\nSNA; never force SNA-first or re-ask HA consent.\nBroad setup asks one unresolved traffic/capacity/operations decision even with\nHA patches; narrow changes need no questionnaire. Up to three missing native\ninputs. Same-subnet traffic is not a routed path. Defaults are not consent;\nSNA acceptance never proves whole-apply safety.\n\n## Examples\n\nha = { backup_zone = "eu01-2" }: synthetic, not availability.\nfirewall=null disables natively, never via chat.\n\n## Limits\n\nNo active/active, automatic public ingress IP failover, throughput/session/SLA\nguarantee. Backup has its own WAN public IP; primary stays bound to its NIC.\nCentral single/map chat patches preserve forms/keys/HA and unrelated values.\nSeveral areas require explicit target selection. New maps cover every area:\nask before enabling additional appliances; no implicit all-area scope.\nNew appliances require all five mandatory fields together; existing ones accept\npartial updates. Validate containment in each affected area, non-overlapping\nLAN/WAN/transfer, usable distinct IPs and different zones. Native cidrhost\ndefaults4/5/6 stay implicit; propose IPs only when saved/user-confirmed.\nProject count proves neither free CIDRs nor\nflavor capacity. Product choices need saved/user values or authorized catalogues.\nNo removal, regional conversion/patch, policy, access/bootstrap or execution.\nIncomplete field selections save nothing. Acceptance saves only drafts;\nPlan/Apply need separate review/authorization. No IPAM/failover proof.\n\n## Credentials\n\nProtected provisioning/node/API bindings; HA needs both nodes.\nNever ask for or expose passwords, SSH keys or API secrets.\n\n## Sources\n\nFingerprint local connectivity/policy. PR #55, d7633e2/1fb8f0c implemented HA;\n#32 OPNsense, #51 VPN/policy. Implementation is not live failover qualification.',
      sha256:
        "15e7bcf3d9bd15f63472ac1e2e7f26f2f4c75cd180dde0e787cf577efca488bc",
    },
    {
      id: "vpn",
      file: "vpn.md",
      version: 1,
      checkedOn: "2026-10-10",
      qualification: "local-draft-not-reviewed-release",
      groups: ["network"],
      mandatory: false,
      inputs: ["connectivity", "connectivity_regions", "vpn_pre_shared_keys"],
      dependencies: ["stackit-network-components"],
      sources: [
        {
          path: "src/variables.tf",
          sha256:
            "534690b7f98b7ed6af03292dbefc180f05d0ecd6048997b93084f678589681d3",
        },
        {
          path: "src/main.tf",
          sha256:
            "300c357f9f3eb5e296f77f5a5ebfb1556e8e3f886c0cecfd335810bcddb4d951",
        },
        {
          path: "src/modules/connectivity/variables.tf",
          sha256:
            "c9e31385e7a17d36e1752ad14d5b424435212f2d67b140d2f6166f1bf6344af5",
        },
        {
          path: "src/modules/connectivity/7-vpn.tf",
          sha256:
            "b96c19cfcc70dfdb21d69f29c92d7c71343cfb272e72588d456248502a2a261b",
        },
        {
          path: "landing-zone-configurator/docs/vpn-configuration-scope.md",
          sha256:
            "4745879cf0ab0272132319425e2e916593f437c7b27c4b74f7a7fd5b59a6fd32",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/assistant/editor.ts",
          sha256:
            "5076218b416332f23aee032d0c302d444cef7e07012547e4060b232ea2a92672",
        },
      ],
      externalSources: [],
      scenarios: ["A07", "A16", "A24"],
      fieldPaths: [
        "connectivity.vpn",
        "connectivity.vpn.availability_zones",
        "connectivity.vpn.availability_zones.tunnel1",
        "connectivity.vpn.availability_zones.tunnel2",
        "connectivity.vpn.connections",
        "connectivity.vpn.connections[*]",
        "connectivity.vpn.connections[*].display_name",
        "connectivity.vpn.connections[*].enabled",
        "connectivity.vpn.connections[*].local_subnets",
        "connectivity.vpn.connections[*].local_subnets[*]",
        "connectivity.vpn.connections[*].remote_subnets",
        "connectivity.vpn.connections[*].remote_subnets[*]",
        "connectivity.vpn.connections[*].static_routes",
        "connectivity.vpn.connections[*].static_routes[*]",
        "connectivity.vpn.connections[*].tunnel1",
        "connectivity.vpn.connections[*].tunnel1.peering",
        "connectivity.vpn.connections[*].tunnel1.peering.local_address",
        "connectivity.vpn.connections[*].tunnel1.peering.remote_address",
        "connectivity.vpn.connections[*].tunnel1.phase1",
        "connectivity.vpn.connections[*].tunnel1.phase1.dh_groups",
        "connectivity.vpn.connections[*].tunnel1.phase1.dh_groups[*]",
        "connectivity.vpn.connections[*].tunnel1.phase1.encryption_algorithms",
        "connectivity.vpn.connections[*].tunnel1.phase1.encryption_algorithms[*]",
        "connectivity.vpn.connections[*].tunnel1.phase1.integrity_algorithms",
        "connectivity.vpn.connections[*].tunnel1.phase1.integrity_algorithms[*]",
        "connectivity.vpn.connections[*].tunnel1.phase1.rekey_time",
        "connectivity.vpn.connections[*].tunnel1.phase2",
        "connectivity.vpn.connections[*].tunnel1.phase2.dh_groups",
        "connectivity.vpn.connections[*].tunnel1.phase2.dh_groups[*]",
        "connectivity.vpn.connections[*].tunnel1.phase2.dpd_action",
        "connectivity.vpn.connections[*].tunnel1.phase2.encryption_algorithms",
        "connectivity.vpn.connections[*].tunnel1.phase2.encryption_algorithms[*]",
        "connectivity.vpn.connections[*].tunnel1.phase2.integrity_algorithms",
        "connectivity.vpn.connections[*].tunnel1.phase2.integrity_algorithms[*]",
        "connectivity.vpn.connections[*].tunnel1.phase2.rekey_time",
        "connectivity.vpn.connections[*].tunnel1.phase2.start_action",
        "connectivity.vpn.connections[*].tunnel1.remote_address",
        "connectivity.vpn.connections[*].tunnel2",
        "connectivity.vpn.connections[*].tunnel2.peering",
        "connectivity.vpn.connections[*].tunnel2.peering.local_address",
        "connectivity.vpn.connections[*].tunnel2.peering.remote_address",
        "connectivity.vpn.connections[*].tunnel2.phase1",
        "connectivity.vpn.connections[*].tunnel2.phase1.dh_groups",
        "connectivity.vpn.connections[*].tunnel2.phase1.dh_groups[*]",
        "connectivity.vpn.connections[*].tunnel2.phase1.encryption_algorithms",
        "connectivity.vpn.connections[*].tunnel2.phase1.encryption_algorithms[*]",
        "connectivity.vpn.connections[*].tunnel2.phase1.integrity_algorithms",
        "connectivity.vpn.connections[*].tunnel2.phase1.integrity_algorithms[*]",
        "connectivity.vpn.connections[*].tunnel2.phase1.rekey_time",
        "connectivity.vpn.connections[*].tunnel2.phase2",
        "connectivity.vpn.connections[*].tunnel2.phase2.dh_groups",
        "connectivity.vpn.connections[*].tunnel2.phase2.dh_groups[*]",
        "connectivity.vpn.connections[*].tunnel2.phase2.dpd_action",
        "connectivity.vpn.connections[*].tunnel2.phase2.encryption_algorithms",
        "connectivity.vpn.connections[*].tunnel2.phase2.encryption_algorithms[*]",
        "connectivity.vpn.connections[*].tunnel2.phase2.integrity_algorithms",
        "connectivity.vpn.connections[*].tunnel2.phase2.integrity_algorithms[*]",
        "connectivity.vpn.connections[*].tunnel2.phase2.rekey_time",
        "connectivity.vpn.connections[*].tunnel2.phase2.start_action",
        "connectivity.vpn.connections[*].tunnel2.remote_address",
        "connectivity.vpn.display_name",
        "connectivity.vpn.plan_id",
        "connectivity.vpn.routing_type",
        "connectivity_regions[*].vpn",
        "connectivity_regions[*].vpn.availability_zones",
        "connectivity_regions[*].vpn.availability_zones.tunnel1",
        "connectivity_regions[*].vpn.availability_zones.tunnel2",
        "connectivity_regions[*].vpn.connections",
        "connectivity_regions[*].vpn.connections[*]",
        "connectivity_regions[*].vpn.connections[*].display_name",
        "connectivity_regions[*].vpn.connections[*].enabled",
        "connectivity_regions[*].vpn.connections[*].local_subnets",
        "connectivity_regions[*].vpn.connections[*].local_subnets[*]",
        "connectivity_regions[*].vpn.connections[*].remote_subnets",
        "connectivity_regions[*].vpn.connections[*].remote_subnets[*]",
        "connectivity_regions[*].vpn.connections[*].static_routes",
        "connectivity_regions[*].vpn.connections[*].static_routes[*]",
        "connectivity_regions[*].vpn.connections[*].tunnel1",
        "connectivity_regions[*].vpn.connections[*].tunnel1.peering",
        "connectivity_regions[*].vpn.connections[*].tunnel1.peering.local_address",
        "connectivity_regions[*].vpn.connections[*].tunnel1.peering.remote_address",
        "connectivity_regions[*].vpn.connections[*].tunnel1.phase1",
        "connectivity_regions[*].vpn.connections[*].tunnel1.phase1.dh_groups",
        "connectivity_regions[*].vpn.connections[*].tunnel1.phase1.dh_groups[*]",
        "connectivity_regions[*].vpn.connections[*].tunnel1.phase1.encryption_algorithms",
        "connectivity_regions[*].vpn.connections[*].tunnel1.phase1.encryption_algorithms[*]",
        "connectivity_regions[*].vpn.connections[*].tunnel1.phase1.integrity_algorithms",
        "connectivity_regions[*].vpn.connections[*].tunnel1.phase1.integrity_algorithms[*]",
        "connectivity_regions[*].vpn.connections[*].tunnel1.phase1.rekey_time",
        "connectivity_regions[*].vpn.connections[*].tunnel1.phase2",
        "connectivity_regions[*].vpn.connections[*].tunnel1.phase2.dh_groups",
        "connectivity_regions[*].vpn.connections[*].tunnel1.phase2.dh_groups[*]",
        "connectivity_regions[*].vpn.connections[*].tunnel1.phase2.dpd_action",
        "connectivity_regions[*].vpn.connections[*].tunnel1.phase2.encryption_algorithms",
        "connectivity_regions[*].vpn.connections[*].tunnel1.phase2.encryption_algorithms[*]",
        "connectivity_regions[*].vpn.connections[*].tunnel1.phase2.integrity_algorithms",
        "connectivity_regions[*].vpn.connections[*].tunnel1.phase2.integrity_algorithms[*]",
        "connectivity_regions[*].vpn.connections[*].tunnel1.phase2.rekey_time",
        "connectivity_regions[*].vpn.connections[*].tunnel1.phase2.start_action",
        "connectivity_regions[*].vpn.connections[*].tunnel1.remote_address",
        "connectivity_regions[*].vpn.connections[*].tunnel2",
        "connectivity_regions[*].vpn.connections[*].tunnel2.peering",
        "connectivity_regions[*].vpn.connections[*].tunnel2.peering.local_address",
        "connectivity_regions[*].vpn.connections[*].tunnel2.peering.remote_address",
        "connectivity_regions[*].vpn.connections[*].tunnel2.phase1",
        "connectivity_regions[*].vpn.connections[*].tunnel2.phase1.dh_groups",
        "connectivity_regions[*].vpn.connections[*].tunnel2.phase1.dh_groups[*]",
        "connectivity_regions[*].vpn.connections[*].tunnel2.phase1.encryption_algorithms",
        "connectivity_regions[*].vpn.connections[*].tunnel2.phase1.encryption_algorithms[*]",
        "connectivity_regions[*].vpn.connections[*].tunnel2.phase1.integrity_algorithms",
        "connectivity_regions[*].vpn.connections[*].tunnel2.phase1.integrity_algorithms[*]",
        "connectivity_regions[*].vpn.connections[*].tunnel2.phase1.rekey_time",
        "connectivity_regions[*].vpn.connections[*].tunnel2.phase2",
        "connectivity_regions[*].vpn.connections[*].tunnel2.phase2.dh_groups",
        "connectivity_regions[*].vpn.connections[*].tunnel2.phase2.dh_groups[*]",
        "connectivity_regions[*].vpn.connections[*].tunnel2.phase2.dpd_action",
        "connectivity_regions[*].vpn.connections[*].tunnel2.phase2.encryption_algorithms",
        "connectivity_regions[*].vpn.connections[*].tunnel2.phase2.encryption_algorithms[*]",
        "connectivity_regions[*].vpn.connections[*].tunnel2.phase2.integrity_algorithms",
        "connectivity_regions[*].vpn.connections[*].tunnel2.phase2.integrity_algorithms[*]",
        "connectivity_regions[*].vpn.connections[*].tunnel2.phase2.rekey_time",
        "connectivity_regions[*].vpn.connections[*].tunnel2.phase2.start_action",
        "connectivity_regions[*].vpn.connections[*].tunnel2.remote_address",
        "connectivity_regions[*].vpn.display_name",
        "connectivity_regions[*].vpn.plan_id",
        "connectivity_regions[*].vpn.routing_type",
      ],
      source: "landing-zone-configurator/docs/assistant-knowledge/vpn.md",
      text: '# Site-to-Site VPN\n\n## Purpose\n\nConnect explicitly requested external networks to the platform through supported\nsite-to-site VPN gateways and tunnels. VPN is not required for project-to-project\ncommunication inside an SNA and must not be introduced into an SNA-first task.\n\n## Accelerator Contract\n\nNative connectivity.vpn and supported connectivity_regions entries carry the\ngateway, plan, routing type, connections, tunnel peers, routes/subnets and\nIKE/IPsec settings defined by the root schema. vpn_pre_shared_keys is a separate\nprotected input. Use actual gateway/connection/tunnel keys; do not flatten the\ncontract or invent arbitrary VPN appliances. Regional root calls exist, but\nservice availability and plan compatibility still need authorized live checks.\nNative defaults: `plan_id = "p100"` and `routing_type = "ROUTE_BASED"` (not\n`static`/`dynamic`). Both tunnels use native peering, phase1 and phase2 settings.\n\n## Dependencies\n\nSNA routing, confirmed non-overlapping local/remote networks, reachable peers\nand separate credential bindings. Public PIM product facts are not proof of\navailability for the target project or region. A billing SKU is not a plan ID.\n\n## Dialogue\n\nFirst confirm that external connectivity is needed now. Ask about site count,\npeer capability, required throughput/connections, local/remote networks and\navailability. Use labels and business requirements, not requests for plan IDs.\nMatch live PIM attributes to authorized plan options when selecting; unavailable\neu02 data must not be substituted with eu01. Never ask for PSKs or private keys.\n\n## Examples\n\nSynthetic intent: one approved external site, two tunnels if the confirmed\nconnection contract calls for them, explicit peer subnets. connectivity.vpn =\nnull disables that optional configuration. This field fragment is not a full\ngateway proposal and never contains a preshared key.\n\n## Limits\n\nNative Editor proposals support reviewed public VPN settings, not credentials.\nAcceptance changes only the draft. Do not\nassume compatible encryption, peer routes, performance or failover from a plan\nname. Plans, quotas and tunnel state are live facts. Configuration does not\nprove packets traverse the connection; routing and overlap checks are separate.\n\n## Credentials\n\nProvider access and tunnel PSKs use separate externally supplied bindings.\nNever request or export PSK values through the model. Key rotation and gateway\ncreation need explicit authorized execution, not a conversational recommendation.\nSupply `vpn_pre_shared_keys` per connection/tunnel through\n`TF_VAR_vpn_pre_shared_keys` or gitignored tfvars, outside the Assistant.\n\n## Sources\n\nRoot variables, connectivity wiring and VPN implementation are manifest sources.\nRe-review regional/plan/tunnel contract changes before regeneration. Live\ncatalogues/PIM remain separately fetched facts, not a frozen Markdown SKU list.',
      sha256:
        "ad975fb118c2e323af9bee2973691ff73c986fb2dc81f8e9f65381694f7f3bad",
    },
    {
      id: "firewall-policy",
      file: "firewall-policy.md",
      version: 1,
      checkedOn: "2026-10-10",
      qualification: "local-draft-not-reviewed-release",
      groups: ["firewall"],
      mandatory: false,
      inputs: ["firewall_config"],
      dependencies: ["firewall-infrastructure", "firewall-access-bootstrap"],
      sources: [
        {
          path: "src/variables.tf",
          sha256:
            "534690b7f98b7ed6af03292dbefc180f05d0ecd6048997b93084f678589681d3",
        },
        {
          path: "src/modules/firewall-config/variables.tf",
          sha256:
            "91ddcfba3028268a01e939f36dd8a8f35758a6229da78f28f9b02a57cca3c803",
        },
        {
          path: "src/main.tf",
          sha256:
            "300c357f9f3eb5e296f77f5a5ebfb1556e8e3f886c0cecfd335810bcddb4d951",
        },
        {
          path: "src/providers.tf",
          sha256:
            "14edbcc911095468aaa5ee05448246bfce68952f0ddb03c8084c07f38b6ab6d0",
        },
        {
          path: "src/_firewall-bootstrap.tf",
          sha256:
            "f86dfcdee4ed87209e4576fd0ae7e74849edb619f7e59c6c5a4319acb1514829",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/assistant/editor.ts",
          sha256:
            "5076218b416332f23aee032d0c302d444cef7e07012547e4060b232ea2a92672",
        },
      ],
      externalSources: [],
      scenarios: ["A13", "A16", "A23", "A24"],
      fieldPaths: [
        "firewall_config",
        "firewall_config.aliases",
        "firewall_config.aliases[*]",
        "firewall_config.aliases[*].content",
        "firewall_config.aliases[*].content[*]",
        "firewall_config.aliases[*].description",
        "firewall_config.aliases[*].enabled",
        "firewall_config.aliases[*].stats",
        "firewall_config.aliases[*].type",
        "firewall_config.aliases[*].update_freq",
        "firewall_config.endpoint",
        "firewall_config.insecure",
        "firewall_config.outbound_nat",
        "firewall_config.outbound_nat[*]",
        "firewall_config.outbound_nat[*].description",
        "firewall_config.outbound_nat[*].destination_net",
        "firewall_config.outbound_nat[*].disable_nat",
        "firewall_config.outbound_nat[*].enabled",
        "firewall_config.outbound_nat[*].interface",
        "firewall_config.outbound_nat[*].ip_protocol",
        "firewall_config.outbound_nat[*].log",
        "firewall_config.outbound_nat[*].protocol",
        "firewall_config.outbound_nat[*].sequence",
        "firewall_config.outbound_nat[*].source_net",
        "firewall_config.outbound_nat[*].target_ip",
        "firewall_config.port_forwards",
        "firewall_config.port_forwards[*]",
        "firewall_config.port_forwards[*].description",
        "firewall_config.port_forwards[*].destination_net",
        "firewall_config.port_forwards[*].destination_port",
        "firewall_config.port_forwards[*].enabled",
        "firewall_config.port_forwards[*].interfaces",
        "firewall_config.port_forwards[*].interfaces[*]",
        "firewall_config.port_forwards[*].ip_protocol",
        "firewall_config.port_forwards[*].log",
        "firewall_config.port_forwards[*].nat_reflection",
        "firewall_config.port_forwards[*].protocol",
        "firewall_config.port_forwards[*].sequence",
        "firewall_config.port_forwards[*].source_net",
        "firewall_config.port_forwards[*].target_ip",
        "firewall_config.port_forwards[*].target_port",
        "firewall_config.routes",
        "firewall_config.routes[*]",
        "firewall_config.routes[*].description",
        "firewall_config.routes[*].enabled",
        "firewall_config.routes[*].gateway",
        "firewall_config.routes[*].network",
        "firewall_config.rules",
        "firewall_config.rules[*]",
        "firewall_config.rules[*].action",
        "firewall_config.rules[*].description",
        "firewall_config.rules[*].destination_invert",
        "firewall_config.rules[*].destination_net",
        "firewall_config.rules[*].destination_port",
        "firewall_config.rules[*].direction",
        "firewall_config.rules[*].enabled",
        "firewall_config.rules[*].interfaces",
        "firewall_config.rules[*].interfaces[*]",
        "firewall_config.rules[*].ip_protocol",
        "firewall_config.rules[*].log",
        "firewall_config.rules[*].protocol",
        "firewall_config.rules[*].quick",
        "firewall_config.rules[*].sequence",
        "firewall_config.rules[*].source_invert",
        "firewall_config.rules[*].source_net",
        "firewall_config.rules[*].source_port",
      ],
      source:
        "landing-zone-configurator/docs/assistant-knowledge/firewall-policy.md",
      text: "# OPNsense Policy, Routes and NAT\n\n## Purpose\n\nExplain native OPNsense policy; distinguish filtering, routes and NAT.\n\n## Accelerator Contract\n\nNative firewall_config has endpoint/TLS and aliases, routes, rules, outbound_nat,\nport_forwards maps. Rules use pass/block/reject, in/out, sequence, interfaces,\naddresses, ports and protocols. Alias/gateway references must resolve;\nurltable aliases need update_freq. Root bootstrap/provider wiring controls\navailability. The singleton policy path does not manage every area/appliance.\n\n## Dependencies\n\nInfrastructure/access/bootstrap are prerequisites. API-written policy needs\nexplicit HA sync. Firewall routing alone does not prove tenant isolation.\n\n## Dialogue\n\nDisclose immediately: chat cannot define/propose rules or NAT. Guided editor\npolicy management and chat proposals are outside MVP (#101). Existing generic\nfields remain under Operations / Firewall rules, not a qualified workflow.\nThe MVP firewall admin configures policy manually in OPNsense after provisioning.\nNo questionnaire promising rules. Traffic requirements inform infrastructure,\nnot policy. Never insert allow-any, wildcard aliases or public management.\n\n## Examples\n\nfirewall_config = null is native opt-out. HTTPS rules need explicit source,\ndestination and interface. Empty maps do not prove deny-all or absence of\nunmanaged rules; fragments do not automatically replace live policy.\n\n## Limits\n\nSubnet/alias/gateway references and rule ordering need dedicated validation and\npacket tests. Saved policy or HA sync is not isolation, reachability or live-state\nproof. No automatic apply; takeover needs manual-policy/state reconciliation.\n\n## Credentials\n\nAPI credentials, admin access and private reachability are external bindings.\nNever request or show keys/secrets.\n\n## Sources\n\nModule variables, root provider/bootstrap and module calls define behavior.\nRe-review API/schema/HA changes; production packet tests remain separate.",
      sha256:
        "be59069139954e7ed83e69766a4f9182c5280b6770a75fd4331eea778e4599d4",
    },
    {
      id: "firewall-access-bootstrap",
      file: "firewall-access-bootstrap.md",
      version: 1,
      checkedOn: "2026-10-10",
      qualification: "local-draft-not-reviewed-release",
      groups: ["firewall", "credentials"],
      mandatory: false,
      inputs: [
        "firewall_admin_username",
        "firewall_admin_password",
        "firewall_api_credentials",
        "firewall_bootstrap",
        "firewall_api_secret_version",
      ],
      dependencies: ["firewall-infrastructure", "management-state"],
      sources: [
        {
          path: "src/variables.tf",
          sha256:
            "534690b7f98b7ed6af03292dbefc180f05d0ecd6048997b93084f678589681d3",
        },
        {
          path: "src/_firewall-bootstrap.tf",
          sha256:
            "f86dfcdee4ed87209e4576fd0ae7e74849edb619f7e59c6c5a4319acb1514829",
        },
        {
          path: "src/providers.tf",
          sha256:
            "14edbcc911095468aaa5ee05448246bfce68952f0ddb03c8084c07f38b6ab6d0",
        },
        {
          path: "landing-zone-configurator/docs/deployment-credentials.md",
          sha256:
            "e003def890db3ea64fff99593d8dae7d2cb635541bb5eb2be5a71abea04322e2",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/assistant/editor.ts",
          sha256:
            "5076218b416332f23aee032d0c302d444cef7e07012547e4060b232ea2a92672",
        },
      ],
      externalSources: [],
      scenarios: ["A13", "A16", "A23"],
      fieldPaths: [
        "firewall_admin_username",
        "firewall_bootstrap",
        "firewall_api_secret_version",
      ],
      source:
        "landing-zone-configurator/docs/assistant-knowledge/firewall-access-bootstrap.md",
      text: "# Firewall Access and Bootstrap Phases\n\n## Purpose\n\nPrepare secure appliance access for supported bootstrap and policy operations\nwithout embedding secrets in conversations, configuration documents or exports.\n\n## Accelerator Contract\n\nNative roots: firewall_admin_username, firewall_admin_password,\nfirewall_api_credentials, firewall_bootstrap and firewall_api_secret_version.\nBootstrap is a boolean phase control, not an invented object. Current root\nbootstrap handles the single connectivity.firewall path, can create local API\ncredentials and use management Secrets Manager/Vault in later phases. Existing\nfile/secret/provider paths are native execution concerns, not instructions for\nthe model to read them. Policy activation follows the actual bootstrap predicates.\n\n## Dependencies\n\nAn explicitly required supported firewall, management secret storage, provider\nand appliance connectivity. HA access requirements cover primary and backup.\nCredential foundations stay mandatory even when discussing only infrastructure.\n\n## Dialogue\n\nAsk whether this is infrastructure creation, bootstrap or policy maintenance,\nwhich authorized runner can reach the appliance and who owns credentials.\nDirect users to secure binding controls. Never ask for password/API values or\ninternal secret-version IDs. Defaults in an image/schema are not a safe access\ndecision or approval to initialize an appliance.\n\n## Examples\n\nSynthetic native phase fragment: firewall_bootstrap = false. It is not alone a\ncomplete policy prerequisite; external credentials, secret availability and\nthe enabled firewall_config contract must be checked independently.\n\n## Limits\n\nDo not claim generic regional/multi-appliance bootstrap parity, automatic\ncredential rotation or fully qualified execution outside the Configurator.\nCurrent chat cannot alter secrets, bootstrap access or execution grants.\nLocal credential-file creation is a sensitive execution side effect; it must\nnot be triggered merely by selecting a template or accepting an SNA proposal.\n\n## Credentials\n\nPasswords/API keys stay in secure external bindings; never echo defaults from\nsource code. Secret-version metadata is not a value to infer. No token rotation,\ncredential-file reads, raw state or plan transfer to model context.\n\n## Sources\n\nRoot variables, bootstrap logic, providers and deployment credentials document\nthe native phase boundary. Re-review precedence, write-only/ephemeral secrets\nand scope before regeneration; this text does not certify safe bootstrap runs.",
      sha256:
        "e786ad8faafdf15955a05a37f61c2090c22606b545491d3ccf84b66958db94e8",
    },
    {
      id: "devops-git",
      file: "devops-git.md",
      version: 1,
      checkedOn: "2026-10-10",
      qualification: "local-draft-not-reviewed-release",
      groups: ["platform"],
      mandatory: false,
      inputs: ["devops"],
      dependencies: ["management-state"],
      sources: [
        {
          path: "src/variables.tf",
          sha256:
            "534690b7f98b7ed6af03292dbefc180f05d0ecd6048997b93084f678589681d3",
        },
        {
          path: "src/modules/devops/variables.tf",
          sha256:
            "a756d1b711c4608e1c5905cfe5cbec4595fc1f9d729f22561232c6387d0a8fc8",
        },
        {
          path: "src/main.tf",
          sha256:
            "300c357f9f3eb5e296f77f5a5ebfb1556e8e3f886c0cecfd335810bcddb4d951",
        },
        {
          path: "src/providers.tf",
          sha256:
            "14edbcc911095468aaa5ee05448246bfce68952f0ddb03c8084c07f38b6ab6d0",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/assistant/editor.ts",
          sha256:
            "5076218b416332f23aee032d0c302d444cef7e07012547e4060b232ea2a92672",
        },
      ],
      externalSources: [],
      scenarios: ["A08", "A24"],
      fieldPaths: [
        "devops",
        "devops.allowed_network_ranges",
        "devops.allowed_network_ranges[*]",
        "devops.git_flavor",
      ],
      source:
        "landing-zone-configurator/docs/assistant-knowledge/devops-git.md",
      text: "# DevOps Git Service\n\n## Purpose\n\nExplicit managed Git, separate from GitHub login, forks and Configurator CI.\n\n## Accelerator Contract\n\ndevops=null skips the module. The root derives project, ownership and naming,\npassing git_flavor and allowed_network_ranges. git_flavor defaults to null,\nNOT git-10/git-100: null creates no Git instance. An ACL-only object does not\nenable Git. Root wiring, not child-module parameters alone, defines support.\nReal sizes and regional availability require authorized catalogues.\n\n## Dependencies\n\nManagement/governance, identity foundations, provider rights and deliberate ACLs.\nA repository fork proves neither provisioned Git nor service-account rights.\n\n## Dialogue\n\nClarify Git need, capacity, operator and access networks. The allow-all ACL\ndefault is NOT public-access consent. There is no enabled native flavor default:\nif Git is wanted without a chosen/verified flavor, explain null and ask instead\nof inventing git-10. Explicit user flavor choices are reviewable, not availability\nproof. Do not infer runners, integrations, migrations or secrets.\n\n## Examples\n\ndevops=null opts out. A chosen git_flavor plus deliberate allowed_network_ranges\ncan propose Git. git-10 illustrates syntax, not entitlement or capacity.\n\n## Limits\n\nTyped native Editor proposals change only the local draft on acceptance.\nACLs do not qualify backup/restore, migration, SSO or CI execution. No arbitrary\nGit appliances, availability, prices or performance promises.\n\n## Credentials\n\nProvisioning and Git-user access are separate. No PATs, private SSH keys, Git\npasswords or CI secrets in chat; no hidden Configurator profile-ID dependency.\n\n## Sources\n\nRoot calls, DevOps variables and provider configuration in the manifest.\nRefresh engine/source bindings after review; live product facts stay separate.",
      sha256:
        "272e93daa20f89e78ea5596daeae15a782626e036a7c5c2224468dac5e591666",
    },
    {
      id: "platform-kubernetes",
      file: "platform-kubernetes.md",
      version: 1,
      checkedOn: "2026-10-10",
      qualification: "local-draft-not-reviewed-release",
      groups: ["platform"],
      mandatory: false,
      inputs: [
        "platform_kubernetes",
        "platform_kubernetes_kube_config_override",
      ],
      dependencies: ["stackit-network-components", "observability"],
      sources: [
        {
          path: "src/variables.tf",
          sha256:
            "534690b7f98b7ed6af03292dbefc180f05d0ecd6048997b93084f678589681d3",
        },
        {
          path: "src/modules/platform-kubernetes/variables.tf",
          sha256:
            "e28b32bc80ca8c3e6a74c12b93318912e30af17f2c7b7bc2d8b37361cf7514e7",
        },
        {
          path: "src/modules/debug-bastion/variables.tf",
          sha256:
            "cb77efd8dd32be6978247893189bdb9ccab0266ebedd0c9905c9ca84160502c2",
        },
        {
          path: "src/main.tf",
          sha256:
            "300c357f9f3eb5e296f77f5a5ebfb1556e8e3f886c0cecfd335810bcddb4d951",
        },
        {
          path: "src/providers.tf",
          sha256:
            "14edbcc911095468aaa5ee05448246bfce68952f0ddb03c8084c07f38b6ab6d0",
        },
        {
          path: "landing-zone-configurator/app/packages/domain/src/common-validation.ts",
          sha256:
            "fa801f254244eaf9124d7d406aeac95321f55b8d3c1750e9738a37f2d2d8291c",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/assistant/editor.ts",
          sha256:
            "5076218b416332f23aee032d0c302d444cef7e07012547e4060b232ea2a92672",
        },
      ],
      externalSources: [],
      scenarios: ["A05", "A09", "A15", "A16", "A24"],
      fieldPaths: [
        "platform_kubernetes",
        "platform_kubernetes[*]",
        "platform_kubernetes[*].cluster",
        "platform_kubernetes[*].cluster.kubernetes_version_min",
        "platform_kubernetes[*].cluster.maintenance",
        "platform_kubernetes[*].cluster.maintenance.enable_kubernetes_version_updates",
        "platform_kubernetes[*].cluster.maintenance.enable_machine_image_version_updates",
        "platform_kubernetes[*].cluster.maintenance.end",
        "platform_kubernetes[*].cluster.maintenance.start",
        "platform_kubernetes[*].cluster.name",
        "platform_kubernetes[*].cluster.node_pools",
        "platform_kubernetes[*].cluster.node_pools[*]",
        "platform_kubernetes[*].cluster.node_pools[*].allow_system_components",
        "platform_kubernetes[*].cluster.node_pools[*].availability_zones",
        "platform_kubernetes[*].cluster.node_pools[*].availability_zones[*]",
        "platform_kubernetes[*].cluster.node_pools[*].labels",
        "platform_kubernetes[*].cluster.node_pools[*].labels[*]",
        "platform_kubernetes[*].cluster.node_pools[*].machine_type",
        "platform_kubernetes[*].cluster.node_pools[*].maximum",
        "platform_kubernetes[*].cluster.node_pools[*].minimum",
        "platform_kubernetes[*].cluster.node_pools[*].name",
        "platform_kubernetes[*].cluster.node_pools[*].os_name",
        "platform_kubernetes[*].cluster.node_pools[*].volume_size",
        "platform_kubernetes[*].cluster.node_pools[*].volume_type",
        "platform_kubernetes[*].debug_bastion",
        "platform_kubernetes[*].debug_bastion.assign_public_ip",
        "platform_kubernetes[*].debug_bastion.availability_zone",
        "platform_kubernetes[*].debug_bastion.boot_volume_size",
        "platform_kubernetes[*].debug_bastion.enabled",
        "platform_kubernetes[*].debug_bastion.image_id",
        "platform_kubernetes[*].debug_bastion.install_kubectl",
        "platform_kubernetes[*].debug_bastion.machine_type",
        "platform_kubernetes[*].debug_bastion.name",
        "platform_kubernetes[*].debug_bastion.ssh_allowed_cidrs",
        "platform_kubernetes[*].debug_bastion.ssh_allowed_cidrs[*]",
        "platform_kubernetes[*].debug_bastion.ssh_public_key",
        "platform_kubernetes[*].debug_bastion.ssh_public_key_path",
        "platform_kubernetes[*].dns",
        "platform_kubernetes[*].dns.create_zones",
        "platform_kubernetes[*].dns.enabled",
        "platform_kubernetes[*].dns.gateway_api",
        "platform_kubernetes[*].dns.zones",
        "platform_kubernetes[*].dns.zones[*]",
        "platform_kubernetes[*].encrypted_volumes",
        "platform_kubernetes[*].encrypted_volumes.enabled",
        "platform_kubernetes[*].encrypted_volumes.kms_key_name",
        "platform_kubernetes[*].encrypted_volumes.kms_key_version",
        "platform_kubernetes[*].encrypted_volumes.kms_keyring_name",
        "platform_kubernetes[*].encrypted_volumes.storage_class_name",
        "platform_kubernetes[*].network",
        "platform_kubernetes[*].network.firewall_next_hop_ip",
        "platform_kubernetes[*].network.network_area_key",
        "platform_kubernetes[*].network.sna_enabled",
        "platform_kubernetes[*].network.sna_network_area_id",
        "platform_kubernetes[*].network.sna_network_prefix_length",
        "platform_kubernetes[*].observability",
        "platform_kubernetes[*].observability.acl",
        "platform_kubernetes[*].observability.acl[*]",
        "platform_kubernetes[*].observability.enabled",
        "platform_kubernetes[*].observability.name",
        "platform_kubernetes[*].observability.plan_name",
        "platform_kubernetes[*].region",
        "platform_kubernetes[*].role_assignments",
        "platform_kubernetes[*].role_assignments[*]",
        "platform_kubernetes[*].role_assignments[*].role",
        "platform_kubernetes[*].role_assignments[*].subject",
      ],
      source:
        "landing-zone-configurator/docs/assistant-knowledge/platform-kubernetes.md",
      text: '# Platform Kubernetes, KMS and Bastion\n\n## Purpose\n\nConfigure shared STACKIT Kubernetes with deliberate networking and node pools.\nDNS, monitoring, encrypted storage and debug access are separate choices, not\nimplicit parts of an SNA request.\n\n## Accelerator Contract\n\nplatform_kubernetes is a keyed map. Each entry has region and cluster with\nname, kubernetes_version_min, node_pools and maintenance. Pools define name,\nmachine_type, minimum/maximum, availability_zones and optional system-component,\nvolume, OS and label settings. network uses sna_enabled, network_area_key,\nsna_network_area_id, firewall_next_hop_ip and sna_network_prefix_length; root\nresolves native area keys or an explicitly bound external area for eu01/eu02.\ndns, observability, encrypted_volumes, debug_bastion and role_assignments are\nseparate options. KMS-backed storage classes do not encrypt every volume.\nDebug bastion is a separate VM/SSH feature. Protected\nplatform_kubernetes_kube_config_override is not public chat configuration.\n\n## Dependencies\n\nSNA/region for corporate mode, governance/platform ownership and credential\nfoundations. DNS and observability are independent nested options. KMS needs\nrights and compatible storage; namespaces consume the supported cluster/provider\npath. Public mode is not private reachability by assumption.\n\n## Dialogue\n\nAsk about scale, connectivity, system/workload pools, availability, maintenance,\nencryption and operational access.\nUse live versions/machines/zones/volumes, not static default SKUs. Never create\na bastion, expose SSH to all networks or enable demos merely to "test SNA".\n\n## Examples\n\nSynthetic opt-out: platform_kubernetes = {}. Enabled clusters need confirmed\ncluster/pool settings; a /24 or key default guarantees neither free addresses,\nworkload capacity, quotas nor namespace isolation.\n\n## Limits\n\nThe Editor supports reviewed public cluster/KMS/bastion drafts, not credentials\nor deployment. Validate region, prefixes, pool minimum/maximum, system pools\nand area references. Defaults may contain regional zones. Connectivity, provider\naccess, KMS and node health need separate execution qualification.\n\n## Credentials\n\nProvider/KMS rights, Kubernetes access and bastion SSH need distinct secure\nbindings. Never request kubeconfig, private SSH keys or KMS secrets; external\noverrides must match the native contract.\n\n## Sources\n\nRoot calls, cluster/bastion variables, providers and validation define this\nscope. Review DNS, region, provider and encryption changes before generation.\nMarkdown does not certify private-cluster execution.',
      sha256:
        "90669bb4c25a91714c74caca6b015e69810d878d55f040d266e09a5b4582e3f4",
    },
    {
      id: "project-templates",
      file: "project-templates.md",
      version: 8,
      checkedOn: "2026-11-06",
      qualification: "local-draft-not-reviewed-release",
      groups: ["projects"],
      mandatory: false,
      inputs: ["landing_zones"],
      dependencies: [
        "governance-folders",
        "stackit-network-components",
        "observability",
      ],
      sources: [
        {
          path: "src/variables.tf",
          sha256:
            "534690b7f98b7ed6af03292dbefc180f05d0ecd6048997b93084f678589681d3",
        },
        {
          path: "src/modules/landing-zone/variables.tf",
          sha256:
            "b42f23055c9b2cf2878bf4c38a44dc8aa1a4a36ba8af32ccbb6a3a4574d00b8f",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/assistant/application-permission-dialogue.ts",
          sha256:
            "2d5a0057c1b0b34e4a0112c8e2f6f64305a6a67112fcbe51cf4bd5875ebef42f",
        },
        {
          path: "landing-zone-configurator/app/packages/domain/src/project-templates.ts",
          sha256:
            "dd7e1abfb945376e37f54e5126d110a28a2673fe9f4a5e6bb202dfd116560ff4",
        },
        {
          path: "landing-zone-configurator/app/packages/domain/src/common-validation.ts",
          sha256:
            "fa801f254244eaf9124d7d406aeac95321f55b8d3c1750e9738a37f2d2d8291c",
        },
        {
          path: "src/modules/landing-zone/3-network.tf",
          sha256:
            "0f37a5a088f8555a2c3019d63c2a1b4087aab032bd2fb455d391726deb953471",
        },
        {
          path: "landing-zone-configurator/app/packages/domain/src/application-plan.ts",
          sha256:
            "fdfa84c952c89939554b6699fb516c8a22b3e82c38c7d561254d18266b93ea0f",
        },
        {
          path: "landing-zone-configurator/app/packages/domain/src/application-access.ts",
          sha256:
            "855c2c9f1957e7ba2bdeb7bddde845d3f1286704a2103ebfb0d74988c9adf038",
        },
        {
          path: "landing-zone-configurator/app/packages/domain/src/application-workload-permissions.ts",
          sha256:
            "a1d91532c36805a1ea1688424875b4ae1874de30d3a7f9d852569ab64afe2bc3",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/assistant/application-access.ts",
          sha256:
            "d7e549fa4ce8012e0fe0c93e03d71d9598dd32e51afe031073a4d0d2bc2664bc",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/assistant/platform-owner-context.ts",
          sha256:
            "b808bce714cb43fde3cec90c4b1e8c5ee502485fe2c1ae66c5f5fc474a25e727",
        },
        {
          path: "landing-zone-configurator/app/packages/domain/src/project-permissions.generated.ts",
          sha256:
            "becce60ebe4f33a0343f39ba0826dc570daaeee171976b3e05fe02f52a4e6991",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/assistant/editor.ts",
          sha256:
            "5076218b416332f23aee032d0c302d444cef7e07012547e4060b232ea2a92672",
        },
      ],
      externalSources: [
        "https://github.com/stackitcloud/terraform-provider-stackit/blob/v0.114.0/stackit/internal/services/iaas/network/resource.go",
        "https://docs.stackit.cloud/platform/access-and-identity/roles-permissions/roles-permissions/",
        "https://docs.stackit.cloud/platform/access-and-identity/roles-permissions/custom-roles/",
        "https://docs.stackit.cloud/platform/access-and-identity/service-accounts/",
      ],
      scenarios: ["A04", "A10", "A14", "A22", "A23", "A24"],
      fieldPaths: [
        "landing_zones",
        "landing_zones[*]",
        "landing_zones[*].automation_role",
        "landing_zones[*].corporate",
        "landing_zones[*].custom_roles",
        "landing_zones[*].custom_roles[*]",
        "landing_zones[*].custom_roles[*].description",
        "landing_zones[*].custom_roles[*].name",
        "landing_zones[*].custom_roles[*].permissions",
        "landing_zones[*].custom_roles[*].permissions[*]",
        "landing_zones[*].env",
        "landing_zones[*].network_area_key",
        "landing_zones[*].network_enabled",
        "landing_zones[*].network_prefix_length",
        "landing_zones[*].observability",
        "landing_zones[*].observability.acl",
        "landing_zones[*].observability.acl[*]",
        "landing_zones[*].observability.enabled",
        "landing_zones[*].observability.name",
        "landing_zones[*].observability.plan_name",
        "landing_zones[*].owner_email",
        "landing_zones[*].project_code",
        "landing_zones[*].project_name",
        "landing_zones[*].region",
        "landing_zones[*].role_assignments",
        "landing_zones[*].role_assignments[*]",
        "landing_zones[*].role_assignments[*].role",
        "landing_zones[*].role_assignments[*].subject",
        "landing_zones[*].secretsmanager_enabled",
      ],
      source:
        "landing-zone-configurator/docs/assistant-knowledge/project-templates.md",
      text: '# Landing-Zone Projects and Application Templates\n\n## Purpose\n\nTemplates/IAM.\n\n## Accelerator Contract\n\nlanding_zones:corporate/region/area,project_code/env/owner_email,network/roles/services.\nPublic:corporate=false; drafts:projectTemplates/policies.\nAutomatic=null:Corporate resolves regional SNA default_prefix_length before Plan; numeric to Provider0.114; preserve DNS.\nProvider0.114: null prefix+DNS(even []) invalid; native resolves, overrides win; Public provider sizing.\n\n## Dependencies\n\nVerified identity/governance; regional SNA; separate credentials. Public!=Corporate; namespaces:Platform K8s.\n\n## Dialogue\n\nNew:name/kind/region/settings; reuse keys.\nCentral=Corporate; Internet-only=Public; local network=true. Preserve settings. "100 projects"=capacity!=examples/quota; reserve Platform space.\n/26:network_prefix_length=26; Automatic=null, never mandatory /24 or disabled DNS.\nNew:granular; Owner optional.\nIDP!=Configurator roles!=project IAM.\nImmutable accessProfile!=order input: schemaVersion=1,mode=granular;\ninitialOwnerEmail=user/SA!=requester; permissions/automationPermissions=official IDs. Default191=184+7 keys; automation184.\nVM-only narrower +keys. Keys: iam.service-account.{get,list},\niam.service-account-key.{create,delete,edit,get,list}. Keys use ALL SA rights, also elsewhere; privileged Platform SAs outside. No SA create/delete/role/member admin.\nADD keys=seven, requester default; preserve owner/SKE/automation.\nDefaults: server-backup/server-update/run-command (schedules/restore/OS updates/commands), IaaS backups/snapshots writes. Install agent separately; old profiles unchanged; new version+upgrade.\nAll project rights incl.IAM selectable.\nADD SKE=catalogue ske union (both unless specified). Preserve rights. Public+Corporate=both; clarify duplicates.\nSKE IAM!=K8s RBAC; no default IAM role/member admin.\nOwner={schemaVersion:1,mode:owner}: all project rights for both, incl.IAM/project; no immutable audit/routing claim.\nAtomic; no legacy roles.\nPublic+Corporate: ONE common missing owner; preserve explicit owners.\n"Platform service account"=prepared config/org email; ambiguity asks.\nWorkload+services recommended. Legacy: confirm removed roles/context/native Owner defaults.\nPublication needs owner; additive grants; nothing saved/executed.\n\n## Examples\n\n/28:Automatic+DNS.\n\n## Limits\n\nVersion/State bound; review migrations; never delete State. Match region/area/DNS. Empty roles/ACLs!=security; live acceptance.\n\n## Credentials\n\nSeparate grants; no secrets/profile IDs.\n\n## Sources\n\nIaC.\n',
      sha256:
        "61ba07a49d65dd834fe06833ad9446e395303b3421a61f6e0fae5c726ce41782",
    },
    {
      id: "sandbox-projects",
      file: "sandbox-projects.md",
      version: 1,
      checkedOn: "2026-10-10",
      qualification: "local-draft-not-reviewed-release",
      groups: ["projects"],
      mandatory: false,
      inputs: ["sandboxes"],
      dependencies: ["governance-folders"],
      sources: [
        {
          path: "src/variables.tf",
          sha256:
            "534690b7f98b7ed6af03292dbefc180f05d0ecd6048997b93084f678589681d3",
        },
        {
          path: "src/modules/sandboxes/variables.tf",
          sha256:
            "62e3b42155ee5357e87acaebea2ae08702f1faa4804dbce6d3700b1ed8915cf3",
        },
        {
          path: "src/main.tf",
          sha256:
            "300c357f9f3eb5e296f77f5a5ebfb1556e8e3f886c0cecfd335810bcddb4d951",
        },
        {
          path: "landing-zone-configurator/app/packages/domain/src/common-document.ts",
          sha256:
            "64e00aa276f0186b9d4fa70ae88ec13703766a317f1317cbfd6bab790673cb40",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/assistant/editor.ts",
          sha256:
            "5076218b416332f23aee032d0c302d444cef7e07012547e4060b232ea2a92672",
        },
      ],
      externalSources: [],
      scenarios: ["A11", "A14", "A23"],
      fieldPaths: [
        "sandboxes",
        "sandboxes[*]",
        "sandboxes[*].owner_emails",
        "sandboxes[*].owner_emails[*]",
        "sandboxes[*].project_name",
        "sandboxes[*].project_owner_email",
      ],
      source:
        "landing-zone-configurator/docs/assistant-knowledge/sandbox-projects.md",
      text: "# Sandbox Projects\n\n## Purpose\n\nCreate explicitly requested experimental projects with clear ownership under\nthe sandbox hierarchy, without pretending they are corporate spokes or clusters.\n\n## Accelerator Contract\n\nNative sandboxes is a list of project_name, project_owner_email and optional\nowner_emails. The root creates the sandbox module only for a nonempty list and\nuses governance's sandbox folder and a derived naming prefix. Sandbox creation\ndoes not enable the landing-zone project's network/DNS/Secrets Manager options.\nThe common document maintains stable sandbox identities during editing/import.\n\n## Dependencies\n\nGovernance/identity foundations and provider authorization. An optional external\napplication workflow is separate from this native list; a knowledge dependency\nis not a request to create an SNA or firewall for sandbox entries.\n\n## Dialogue\n\nAsk who owns each sandbox, purpose and required isolation. Treat lifecycle,\nbudget controls and expiry as separate explicit requirements, not features\nautomatically implemented by a sandbox label. Do not invent 100 sandboxes from\nan organization's eventual project-count estimate.\n\n## Examples\n\nSynthetic opt-out: sandboxes = []. A new sandbox needs confirmed project_name\nand project_owner_email; optional additional owners require explicit choice.\nThis list fragment is not permission to remove existing deployed projects.\n\n## Limits\n\nNative Editor proposals support reviewed sandbox configuration; platform\ntemplates are not deployed instances. No automatic expiry,\ncost cap, corporate routing or application publication is promised by this\nnative module. Deleting configuration entries needs a separate reviewed plan\nand authorization; it is not conversational cleanup.\n\n## Credentials\n\nProvider/Resource Manager permissions stay external; owner email is not a\ncredential or a grant receipt. Never request passwords, role secrets or tokens.\n\n## Sources\n\nRoot sandbox wiring, module variables and common document identities are\nmanifest authorities. Re-review list/identity/native export changes before\nregeneration; provider quota and lifecycle behavior need separate qualification.",
      sha256:
        "afa529e5c7874f74c1eaf12a643294b738831041e3a3a1509f534030460a054f",
    },
    {
      id: "namespace-services",
      file: "namespace-services.md",
      version: 1,
      checkedOn: "2026-10-10",
      qualification: "local-draft-not-reviewed-release",
      groups: ["projects"],
      mandatory: false,
      inputs: ["landing_zone_namespace_services"],
      dependencies: ["platform-kubernetes", "project-templates"],
      sources: [
        {
          path: "src/variables.tf",
          sha256:
            "534690b7f98b7ed6af03292dbefc180f05d0ecd6048997b93084f678589681d3",
        },
        {
          path: "src/_landing-zone-kubernetes.tf",
          sha256:
            "879bf26da73251894bf66dff63591248335fd104769b9e4c7cdfb3943577bee0",
        },
        {
          path: "src/modules/namespace-service-demo/variables.tf",
          sha256:
            "d8ae0192fcb0e10064a564d3e68d7aa61a960274777cc97894987c76d5316e30",
        },
        {
          path: "src/providers.tf",
          sha256:
            "14edbcc911095468aaa5ee05448246bfce68952f0ddb03c8084c07f38b6ab6d0",
        },
        {
          path: "landing-zone-configurator/app/packages/domain/src/common-validation.ts",
          sha256:
            "fa801f254244eaf9124d7d406aeac95321f55b8d3c1750e9738a37f2d2d8291c",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/assistant/editor.ts",
          sha256:
            "5076218b416332f23aee032d0c302d444cef7e07012547e4060b232ea2a92672",
        },
      ],
      externalSources: [],
      scenarios: ["A12", "A14", "A16", "A23", "A24"],
      fieldPaths: [
        "landing_zone_namespace_services",
        "landing_zone_namespace_services[*]",
        "landing_zone_namespace_services[*].annotations",
        "landing_zone_namespace_services[*].annotations[*]",
        "landing_zone_namespace_services[*].demo_enabled",
        "landing_zone_namespace_services[*].demo_metrics_ingestion",
        "landing_zone_namespace_services[*].demo_metrics_ingestion.enabled",
        "landing_zone_namespace_services[*].demo_metrics_ingestion.metrics_path",
        "landing_zone_namespace_services[*].demo_metrics_ingestion.scheme",
        "landing_zone_namespace_services[*].demo_metrics_ingestion.scrape_interval",
        "landing_zone_namespace_services[*].demo_metrics_ingestion.scrape_timeout",
        "landing_zone_namespace_services[*].demo_metrics_ingestion.target_urls",
        "landing_zone_namespace_services[*].demo_metrics_ingestion.target_urls[*]",
        "landing_zone_namespace_services[*].dns_subdomain",
        "landing_zone_namespace_services[*].kubernetes_access",
        "landing_zone_namespace_services[*].kubernetes_access.enabled",
        "landing_zone_namespace_services[*].kubernetes_access.service_account_name",
        "landing_zone_namespace_services[*].labels",
        "landing_zone_namespace_services[*].labels[*]",
        "landing_zone_namespace_services[*].namespace",
        "landing_zone_namespace_services[*].sample_load",
        "landing_zone_namespace_services[*].sample_load.enabled",
        "landing_zone_namespace_services[*].sample_load.image",
        "landing_zone_namespace_services[*].secrets_enforcement",
        "landing_zone_namespace_services[*].secrets_enforcement.allow_opaque_secret_types",
        "landing_zone_namespace_services[*].secrets_enforcement.allow_opaque_secret_types[*]",
        "landing_zone_namespace_services[*].secrets_enforcement.break_glass",
        "landing_zone_namespace_services[*].secrets_enforcement.break_glass.enabled",
        "landing_zone_namespace_services[*].secrets_enforcement.break_glass.principals",
        "landing_zone_namespace_services[*].secrets_enforcement.break_glass.principals[*]",
        "landing_zone_namespace_services[*].secrets_enforcement.break_glass.ttl_hours",
        "landing_zone_namespace_services[*].secrets_enforcement.enabled",
        "landing_zone_namespace_services[*].secrets_enforcement.mode",
        "landing_zone_namespace_services[*].secretsmanager",
      ],
      source:
        "landing-zone-configurator/docs/assistant-knowledge/namespace-services.md",
      text: "# Kubernetes Namespace Services and Secret Enforcement\n\n## Purpose\n\nProvide supported per-landing-zone namespace slices, scoped Kubernetes access,\noptional Secrets Manager integration and explicitly chosen policy/demo services.\n\n## Accelerator Contract\n\nNative landing_zone_namespace_services is keyed by existing landing-zone keys.\nFields cover namespace/dns_subdomain, kubernetes_access, secretsmanager,\nsecrets_enforcement (mode and break_glass), labels/annotations, sample_load,\ndemo_enabled and demo_metrics_ingestion. Root derives names and references and\ncreates supported Kubernetes/Helm objects. Kyverno policy modes and exemptions\nfollow actual source behavior, not invented universal isolation guarantees.\nCurrent namespace root code references single-region platform/project module\npaths; do not infer multi-region namespace parity from regional SKE support.\n\n## Dependencies\n\nSupported platform Kubernetes/provider access and existing project templates.\nDNS/gateway, Secrets Manager, observability and demos have distinct prerequisites.\nA Kubernetes namespace is not a separate cloud project, VM network or firewall.\n\n## Dialogue\n\nAsk about namespace tenancy, service-account access, external secret flow,\naudit versus enforcement needs and narrowly scoped break-glass operations.\nDo not turn on sample workloads, public demo routes, ingestion or monitoring\njust to demonstrate a production feature. Confirm labels/policies separately.\n\n## Examples\n\nSynthetic opt-out: landing_zone_namespace_services = {}. An enabled entry must\nreference a real landing-zone key. Explicit demo/sample_load opt-in remains\nseparate from namespace and service-account requirements.\n\n## Limits\n\nNative Editor proposals support reviewed public namespace settings, not\nkubeconfig values or secret material. Acceptance is a local draft change.\nPolicy audit is not enforcement; supported strict/other modes must be checked\nagainst their actual match/exemption rules. Break-glass TTL settings are not\nproof of operational revocation. Kubernetes/Helm reachability, RBAC, secret flow\nand demo behavior need separate integration and runtime tests.\n\n## Credentials\n\nKubernetes provider access and secret-service bindings remain externally\nsupplyable and protected. Never expose kubeconfigs, service-account tokens,\nsecret values or dashboard passwords to the model or example fragments.\n\n## Sources\n\nNamespace root code, demo variables, providers and shared reference validation\nare manifest sources. Re-review policy modes, provider selection and regional\nconstraints before generation; demos do not qualify production tenant isolation.",
      sha256:
        "3173eafda0a2a51ec369c61e4e57e2a12ddc4c00551e88dbcc99fccfb39113c0",
    },
    {
      id: "configuration-lifecycle",
      file: "configuration-lifecycle.md",
      version: 13,
      checkedOn: "2026-11-09",
      qualification: "local-draft-not-reviewed-release",
      groups: [],
      mandatory: true,
      inputs: [],
      dependencies: ["credential-foundations"],
      sources: [
        {
          path: "landing-zone-configurator/app/apps/api/src/assistant/knowledge.ts",
          sha256:
            "141ed56d92cc70924b965def21ea9f7863a4b33e4058bab238abb01b746622ab",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/assistant/service.ts",
          sha256:
            "08d92c79105d2fd65e8e33863b6a8e310db37771ecb4f012a079b185ae069390",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/assistant/dialogue.ts",
          sha256:
            "b0458a83022eaa535d687c705519b313bcdeede0b3869c6f88ab43ec1d697268",
        },
        {
          path: "landing-zone-configurator/app/packages/contracts/src/assistant.ts",
          sha256:
            "809c06ba3525286e5810b84e4287c418accec1df1a91192e7fc5bf23ffed2839",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/assistant/model-serving.ts",
          sha256:
            "7cb7830953c356f9c6ec7341ed4e6e03e2134449d3d178147d0936e23d66a89e",
        },
        {
          path: "landing-zone-configurator/docs/application-execution-lifecycle.md",
          sha256:
            "8553cfe5dfff01ebb2e4434dfa8bddd0b2a8aa922ac20ec11b267a9fd663d65b",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/applications/execution-lifecycle.ts",
          sha256:
            "a6defed96d8d56262d3591c9f8288107195596295f8291ba680e5737e77ad94c",
        },
        {
          path: "landing-zone-configurator/docs/application-upgrades.md",
          sha256:
            "84500d34d9c29514d0b6aebe57de02ba32cd5cc6394e4d04a8e924c8d9a97ddb",
        },
        {
          path: "landing-zone-configurator/app/packages/domain/src/application-upgrades.ts",
          sha256:
            "6353cf78042c048cffc5b0b5cb0c1197336bdf5e25c2e0856ce2fac3426116ee",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/applications/upgrades.ts",
          sha256:
            "11fbb0271a164ffc0dc8626f21b909f5e59dc4f42041b35b074fffa6f5b72877",
        },
        {
          path: "landing-zone-configurator/app/packages/contracts/src/application-upgrades.ts",
          sha256:
            "50c9f8568bbd1657ca03c860f08b0488eb03d7cb5d542de968491aee0cb9b4bb",
        },
        {
          path: "landing-zone-configurator/app/apps/api/db/093_platform_destructive_impact_review.sql",
          sha256:
            "64bc29316d0e28c021ad412ce1ef48cd771a6b9774b549482275f5a5dbdcb53b",
        },
        {
          path: "landing-zone-configurator/app/apps/api/src/assistant/editor.ts",
          sha256:
            "5076218b416332f23aee032d0c302d444cef7e07012547e4060b232ea2a92672",
        },
      ],
      externalSources: [],
      scenarios: [
        "A15",
        "A16",
        "A17",
        "A18",
        "A19",
        "A20",
        "A21",
        "A22",
        "A23",
        "A24",
      ],
      fieldPaths: [],
      source:
        "landing-zone-configurator/docs/assistant-knowledge/configuration-lifecycle.md",
      text: '# Configuration, Conversation and Execution Lifecycle\n\n## Purpose\n\nAuth; acceptance ≠ execution.\n\n## Accelerator Contract\n\nNative tfvars; defaults/catalogues enable nothing. Patches: company\nname/code/region, existing folders, native SNA. Naming consent is NAMES ONLY;\npreserve keys/metadata, never IDs/region/access/owners/roles. Save/publish/order/Plan/Apply/Destroy/Recovery separate. Apply=foundations+enabled inputs.\nPinned IaC/lock/tools+patched Worker.\n\nOrigin=template Git; desired=Accelerator, not draft; lastApplied=successful\nApply source, NOT State/Recovery.\nSource upgrade preserves order/project/State/backend/policy; then fresh\nPlan review (changes/replacements/deletions), explicit separate Apply approval.\nFailure keeps desired but MAY CHANGE State/resources; never promise no loss,\nunchanged failed State or reorder. Recovery=interrupted snapshot/source;\nPlan=actual State, not lastApplied. Withdrawn sources/unresolved Recovery block\nupgrades. Operator: reviewed recovery package; no bypass/fake hashes/arbitrary Git.\n\nTemplate: Platform Owner publishes same-family forward path. Keep order/project/\nState/backend/answers; ask new required answers. Confirm desired snapshot; fresh\nPlan/separate Apply. Block disallowed infrastructure/service/account/credential\nremoval/replacement and unknown evidence; no checkbox override. Exact Plan may\npermit project custom-role/role-assignment removal/replacement as sensitive IAM.\nSensitive IAM/keys/network/services/availability follow PATH, not NEW-ORDER policy.\nSelf-service: Application Owner reviews fresh Plan, confirms Apply; NO extra\nPlatform Owner approval. Default separate approval binds Plan/artifact/candidate,\neven ordinary changes. Policy edit appends immutable publication; old targets/Plans\nretain policy. Reselect latest path+fresh Plan; no retroactive unlock.\nShared firewall/routes affect ALL Applications, no private old copy. Platform\nOwner decides known complete shared deletes/replacements from Plan changes,\ncounts, data-loss warning and affected Applications. Explicit impact ack\nbinds Plan/artifact/State/dependencies; separate normal/destructive Apply approval.\nBlock unknown/incomplete evidence, active execution/Recovery, changed State.\nAudit Logs→Observability: same review. Fresh Plan; never relabel old Plans.\nPublish actual successful contract path; requester adopts; same template allowed.\nOrg/placement/SNA/backend migration separate. Chat cannot Git/publish/order/upgrade/unlock/execute or expose raw State/Plan.\n\n## Dependencies\n\nReady ≠ executed.\n\n## Dialogue\n\nReuse history/requirements/follow-ups; topic switches win.\nState assumptions; later enables nothing. Split business/operator choices;\nOne missing firewall question. Options ≠ consent. multiple=true: compatible answers,\nfree text. Revalidate subsets; save only whole-proposal acceptance. New configs inherit server revision-bound context; no retrofit. Groups/parameters constrain versions.\n\n## Examples\n\n"SNA first, firewall later": SNA only; disclose inherited firewall. No selective Apply; tfvars need external credentials/backend.\n\n## Limits\n\nRecheck auth/base/candidate on acceptance/inference/reauth.\nChats expire three calendar months from\nCREATION; activity/deletion/late inference never extend expiry or restore derived\ncontext. Refresh knowledge; keep drafts on errors. 5 sessions=load target, not quota.\n\n## Credentials\n\nSession ≠ rights; no tokens/keys/raw errors/protected model data.\n\n## Sources\n\nManifest.\n',
      sha256:
        "70a353e3705603d273d782bffd59d75bf26a78d2674aa2f9b6cafc11834a37e9",
    },
  ],
} as const;
