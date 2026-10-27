// Generated from the official STACKIT project permission catalogue; use permissions:generate.
export default {
  checkedAt: "2026-10-27",
  source:
    "https://authorization.api.stackit.cloud/v2/permissions?resourceType=project",
  permissions: [
    {
      name: "airflow.dags-repository.update",
      description: "Can update the DAGs repository configuration for Airflow",
    },
    {
      name: "airflow.identity-provider.update",
      description: "Can update the identity provider configuration for Airflow",
    },
    {
      name: "airflow.instance.create",
      description: "Can create an Airflow instance.",
    },
    {
      name: "airflow.instance.delete",
      description: "Can delete an Airflow instance.",
    },
    {
      name: "airflow.instance.get",
      description: "Can read an Airflow instance information.",
    },
    {
      name: "airflow.instance.list",
      description: "Can list Airflow instances.",
    },
    {
      name: "airflow.instance.update",
      description: "Can update an Airflow instance.",
    },
    {
      name: "alb.certificateservice.certificate.create",
      description:
        "CreateCertificate will store a TLS certificate in a project.",
    },
    {
      name: "alb.certificateservice.certificate.delete",
      description: "DeleteCertificate will delete the stored TLS certificate.",
    },
    {
      name: "alb.certificateservice.certificate.get",
      description:
        "GetCertificate will return the public parts of a stored TLS certificate.",
    },
    {
      name: "alb.certificateservice.certificate.list",
      description:
        "ListCertificates will return the list of TLS certificates in a project.",
    },
    {
      name: "alb.certificateservice.ping",
      description:
        "Ping will echo the project_id from the request into the response.",
    },
    {
      name: "alb.certificateservice.quota.get",
      description:
        "GetQuota gets the configured certificate resource quotas for this project.",
    },
    {
      name: "alb.credentials.create",
      description:
        "Create credentials can be used to store existing credentials, which are valid to be used for Load Balancer Observability.",
    },
    {
      name: "alb.credentials.delete",
      description: "Delete Credentials",
    },
    {
      name: "alb.credentials.get",
      description: "Get Credentials",
    },
    {
      name: "alb.credentials.list",
      description: "List Credentials",
    },
    {
      name: "alb.credentials.update",
      description: "Update Credentials",
    },
    {
      name: "alb.loadbalancer.create",
      description: "Create Load Balancer will create a load balancer.",
    },
    {
      name: "alb.loadbalancer.delete",
      description: "DeleteLoadBalancer will delete a given load balancer.",
    },
    {
      name: "alb.loadbalancer.get",
      description:
        "Get Load Balancer will get a single load balancer of a project.",
    },
    {
      name: "alb.loadbalancer.list",
      description: "ListLoadBalancer will list load balancers of a project.",
    },
    {
      name: "alb.loadbalancer.update",
      description:
        "Update Load Balancer allows the change of listeners and target pools of an existing Load Balancer.",
    },
    {
      name: "alb.ping",
      description:
        "Ping will echo the project_id from the request into the response.",
    },
    {
      name: "alb.quota.get",
      description:
        "GetQuota gets the configured ALB resource quotas for this project.",
    },
    {
      name: "alb.targetpool.replace",
      description:
        "ReplaceTargetPool will replace a specific target pool of a load balancer with new content. Cannot be used to create or rename a target pool.",
    },
    {
      name: "alb.waf.create",
      description: "Create a WAF configuration",
    },
    {
      name: "alb.waf.crg.create",
      description: "Create a CRG configuration",
    },
    {
      name: "alb.waf.crg.delete",
      description: "Delete a CRG configuration",
    },
    {
      name: "alb.waf.crg.get",
      description: "Retrieve a CRG configuration",
    },
    {
      name: "alb.waf.crg.list",
      description: "List of CRG configurations",
    },
    {
      name: "alb.waf.crg.update",
      description: "Update a CRG configuration",
    },
    {
      name: "alb.waf.delete",
      description: "Delete a WAF configuration",
    },
    {
      name: "alb.waf.get",
      description: "Retrieve a WAF configuration",
    },
    {
      name: "alb.waf.list",
      description: "List of WAF configurations",
    },
    {
      name: "alb.waf.mrs.create",
      description: "Create a MRS configuration",
    },
    {
      name: "alb.waf.mrs.delete",
      description: "Delete a MRS configuration",
    },
    {
      name: "alb.waf.mrs.get",
      description: "Retrieve a MRS configuration",
    },
    {
      name: "alb.waf.mrs.list",
      description: "List of MRS configurations",
    },
    {
      name: "alb.waf.mrs.update",
      description: "Update a MRS configuration",
    },
    {
      name: "alb.waf.ping",
      description: "Ping the API with a projectId it will return",
    },
    {
      name: "alb.waf.quota.get",
      description:
        "GetQuota gets the configured WAF resource quotas for this project.",
    },
    {
      name: "alb.waf.update",
      description: "Update a WAF configuration",
    },
    {
      name: "archiving.credential.create",
      description: "Can create archiving credentials.",
    },
    {
      name: "archiving.credential.get",
      description: "Can get archiving credentials.",
    },
    {
      name: "archiving.flavor.list",
      description: "Can list archiving flavors.",
    },
    {
      name: "archiving.instance.create",
      description: "Can create archiving instance(s).",
    },
    {
      name: "archiving.instance.delete",
      description: "Can delete archiving instance.",
    },
    {
      name: "archiving.instance.get",
      description: "Can get archiving instance information.",
    },
    {
      name: "archiving.instance.list",
      description: "Can list archiving instances.",
    },
    {
      name: "archiving.instance.update",
      description: "Can update archiving instance.",
    },
    {
      name: "argus.grafana.administrate",
      description: "Can administrate Grafana.",
    },
    {
      name: "argus.grafana.edit",
      description: "Can edit Grafana.",
    },
    {
      name: "argus.grafana.server-administrate",
      description: "Can fully administrate Grafana.",
    },
    {
      name: "argus.grafana.view",
      description: "Can view Grafana.",
    },
    {
      name: "argus.instance.create",
      description: "Can create an instance.",
    },
    {
      name: "argus.instance.delete",
      description: "Can delete an instance.",
    },
    {
      name: "argus.instance.get",
      description: "Can read an instance.",
    },
    {
      name: "argus.instance.list",
      description: "Can list instances.",
    },
    {
      name: "argus.instance.update",
      description: "Can update an instance.",
    },
    {
      name: "argus.plan.list",
      description: "Can list plans/offerings.",
    },
    {
      name: "audit-log.entry.get",
      description: "Can read audit log of the resource and child resources.",
    },
    {
      name: "automation-volumes.automation.create",
      description: "Can create new STACKIT Automation for the volumes service.",
    },
    {
      name: "automation-volumes.automation.delete",
      description: "Can delete STACKIT Automation for the volumes service.",
    },
    {
      name: "automation-volumes.automation.edit",
      description: "Can edit STACKIT Automations for the volumes service.",
    },
    {
      name: "automation-volumes.automation.get",
      description:
        "Can get STACKIT Automation details for the volumes service.",
    },
    {
      name: "automation-volumes.automation.list",
      description: "Can list STACKIT Automations for the volumes service.",
    },
    {
      name: "automation-volumes.execution.create",
      description: "Can create new volumes STACKIT Automation execution.",
    },
    {
      name: "automation-volumes.execution.get",
      description:
        "Can get details about a volumes STACKIT Automation execution.",
    },
    {
      name: "automation-volumes.execution.list",
      description: "Can list volumes STACKIT Automation executions.",
    },
    {
      name: "automation-volumes.template.get",
      description:
        "Can get details about volumes STACKIT Automation templates.",
    },
    {
      name: "automation-volumes.template.list",
      description: "Can list volumes STACKIT Automation templates.",
    },
    {
      name: "cdn.distribution.create",
      description: "Can create a CDN distribution in a project",
    },
    {
      name: "cdn.distribution.delete",
      description: "Can delete a given CDN distribution in a project",
    },
    {
      name: "cdn.distribution.edit",
      description:
        "DEPRECATED: Can update details on a CDN distribution in a project (deprecated, use cdn.distribution.update instead)",
    },
    {
      name: "cdn.distribution.get",
      description: "Can get details of a CDN distribution in a project",
    },
    {
      name: "cdn.distribution.list",
      description: "Can list CDN distributions in a project",
    },
    {
      name: "cdn.distribution.update",
      description: "Can update details on a CDN distribution in a project",
    },
    {
      name: "container-registry.project.config.editor",
      description:
        "Have admin access to project configurations inside a Container Registry project.",
    },
    {
      name: "container-registry.project.create",
      description: "Can create an project.",
    },
    {
      name: "container-registry.project.delete",
      description: "Can delete an project.",
    },
    {
      name: "container-registry.project.get",
      description: "Can read an project.",
    },
    {
      name: "container-registry.project.list",
      description: "Can list projects.",
    },
    {
      name: "container-registry.project.manage",
      description: "He can perform management tasks within a project.",
    },
    {
      name: "container-registry.project.permission.access",
      description:
        "Will be assigned to the limited guest role inside Container Registry project",
    },
    {
      name: "container-registry.project.permission.administer",
      description:
        "Will be assigned to the admin role inside Container Registry project",
    },
    {
      name: "container-registry.project.permission.develop",
      description:
        "Will be assigned to the developer role inside Container Registry project",
    },
    {
      name: "container-registry.project.permission.maintain",
      description:
        "Will be assigned to the maintainer role inside Container Registry project",
    },
    {
      name: "container-registry.project.permission.view",
      description:
        "Will be assigned to the guest role inside Container Registry project",
    },
    {
      name: "container-registry.project.restore",
      description: "Can restore a deleted project.",
    },
    {
      name: "container-registry.project.update",
      description: "Can update an project.",
    },
    {
      name: "cost-management.billing.get",
      description: "Can read billing information.",
    },
    {
      name: "cspm.alert.get",
      description: "get a specific alert and its details",
    },
    {
      name: "cspm.alert.list",
      description: "List all alerts coming from the CSPM",
    },
    {
      name: "cspm.override.create",
      description: "Create an override to a rule",
    },
    {
      name: "cspm.override.get",
      description: "Get one specific override",
    },
    {
      name: "cspm.override.list",
      description: "List all currently enabled overrides",
    },
    {
      name: "cspm.override.update",
      description: "Update an override to a rule",
    },
    {
      name: "cspm.policies.list",
      description: "List all available policies",
    },
    {
      name: "cspm.policies.write",
      description: "Create, update or delete a policy",
    },
    {
      name: "cspm.standard.get",
      description: "Get one specific standard from the CSPM",
    },
    {
      name: "cspm.standard.list",
      description: "List all standards the CSPM currently has",
    },
    {
      name: "customer.project.billing-account-link.edit",
      description:
        "Can edit a billing account link of the project - can link a different billing account or sub billing account",
    },
    {
      name: "customer.project.billing-account.get",
      description: "Can get the linked billing account of a project",
    },
    {
      name: "dashboards.grafana.administrate",
      description: "Can administrate Grafana.",
    },
    {
      name: "dashboards.grafana.edit",
      description: "Can edit Grafana.",
    },
    {
      name: "dashboards.grafana.view",
      description: "Can view Grafana.",
    },
    {
      name: "dashboards.instance.create",
      description: "Can create a dashboards instance.",
    },
    {
      name: "dashboards.instance.delete",
      description: "Can delete a dashboards instance.",
    },
    {
      name: "dashboards.instance.get",
      description: "Can read a dashboards instance.",
    },
    {
      name: "dashboards.instance.list",
      description: "Can list dashboards instances.",
    },
    {
      name: "dashboards.instance.update",
      description: "Can update a dashboards instance.",
    },
    {
      name: "data-catalog.instance.create",
      description: "Can create a data catalog instance.",
    },
    {
      name: "data-catalog.instance.delete",
      description: "Can delete a data catalog instance.",
    },
    {
      name: "data-catalog.instance.get",
      description: "Can read a data catalog instance.",
    },
    {
      name: "data-catalog.instance.list",
      description: "Can list data catalog instances.",
    },
    {
      name: "data-catalog.instance.policy.administer",
      description:
        "Can administer the access policies of a data catalog instance.",
    },
    {
      name: "data-catalog.instance.update",
      description: "Can update a data catalog instance.",
    },
    {
      name: "data-catalog.instance.use",
      description: "Can log in to and use a data catalog instance.",
    },
    {
      name: "dns.zone.clone",
      description: "Can clone dns zone(s).",
    },
    {
      name: "dns.zone.create",
      description: "Can create dns zone(s).",
    },
    {
      name: "dns.zone.delete",
      description: "Can delete dns zone.",
    },
    {
      name: "dns.zone.get",
      description: "Can get dns zone information.",
    },
    {
      name: "dns.zone.list",
      description: "Can list dns zones.",
    },
    {
      name: "dns.zone.move",
      description: "Can move dns zone.",
    },
    {
      name: "dns.zone.restore",
      description: "Can restore dns zone.",
    },
    {
      name: "dns.zone.rrset.create",
      description: "Can create dns zone rrset.",
    },
    {
      name: "dns.zone.rrset.delete",
      description: "Can delete dns zone rrset.",
    },
    {
      name: "dns.zone.rrset.get",
      description: "Can get dns zone rrset.",
    },
    {
      name: "dns.zone.rrset.list",
      description: "Can list dns zone rrset.",
    },
    {
      name: "dns.zone.rrset.restore",
      description: "Can restore dns zone rrset.",
    },
    {
      name: "dns.zone.rrset.update",
      description: "Can update dns zone rrset.",
    },
    {
      name: "dns.zone.update",
      description: "Can update dns zone.",
    },
    {
      name: "dremio.instance.create",
      description: "Can create a Dremio instance.",
    },
    {
      name: "dremio.instance.delete",
      description: "Can delete a Dremio instance.",
    },
    {
      name: "dremio.instance.get",
      description: "Can read a Dremio instance.",
    },
    {
      name: "dremio.instance.list",
      description: "Can list Dremio instances.",
    },
    {
      name: "dremio.instance.update",
      description: "Can update a Dremio instance.",
    },
    {
      name: "dremio.user.create",
      description: "Can create a Dremio user.",
    },
    {
      name: "dremio.user.delete",
      description: "Can delete a Dremio user.",
    },
    {
      name: "dremio.user.get",
      description: "Can read a Dremio user.",
    },
    {
      name: "dremio.user.list",
      description: "Can list Dremio users.",
    },
    {
      name: "edge.instances.acl.update",
      description: "Can update the acl of an instance.",
    },
    {
      name: "edge.instances.create",
      description: "Can create an instance.",
    },
    {
      name: "edge.instances.delete",
      description: "Can delete an instance.",
    },
    {
      name: "edge.instances.get",
      description: "Can read an instance.",
    },
    {
      name: "edge.instances.list",
      description: "Can list instances.",
    },
    {
      name: "edge.instances.update",
      description: "Can update an instance.",
    },
    {
      name: "edge.plans.list",
      description: "Can list plans.",
    },
    {
      name: "file-storage.resource-pool.create",
      description: "Can create a resource-pool.",
    },
    {
      name: "file-storage.resource-pool.delete",
      description: "Can delete a resource-pool.",
    },
    {
      name: "file-storage.resource-pool.list",
      description: "Can list all resource-pools.",
    },
    {
      name: "file-storage.resource-pool.snapshot.create",
      description: "Can create a snapshot of an resource-pool.",
    },
    {
      name: "file-storage.resource-pool.snapshot.delete",
      description: "Can delete a snapshot of an resource-pool.",
    },
    {
      name: "file-storage.resource-pool.snapshot.list",
      description: "Can list all snapshots of a resource-pool.",
    },
    {
      name: "file-storage.resource-pool.snapshot.update",
      description: "Can edit a snapshot of a resource-pool.",
    },
    {
      name: "file-storage.resource-pool.update",
      description: "Can update a resource-pool.",
    },
    {
      name: "file-storage.share-export-policy.create",
      description: "Can create a share export policy.",
    },
    {
      name: "file-storage.share-export-policy.delete",
      description: "Can delete a share export policy.",
    },
    {
      name: "file-storage.share-export-policy.list",
      description: "Can list all share export policies.",
    },
    {
      name: "file-storage.share-export-policy.update",
      description: "Can update a share export policy.",
    },
    {
      name: "file-storage.share.create",
      description: "Can create a share.",
    },
    {
      name: "file-storage.share.delete",
      description: "Can delete a share.",
    },
    {
      name: "file-storage.share.list",
      description: "Can list all shares.",
    },
    {
      name: "file-storage.share.update",
      description: "Can update a share.",
    },
    {
      name: "functions.function.create",
      description: "Can create a Function",
    },
    {
      name: "functions.function.delete",
      description: "Can delete a Function",
    },
    {
      name: "functions.function.get",
      description: "Can read a single Function",
    },
    {
      name: "functions.function.list",
      description: "Can list Functions",
    },
    {
      name: "functions.function.logs",
      description: "Can list the logs for a particular function revision",
    },
    {
      name: "functions.function.metrics",
      description: "Can read the metrics of a function",
    },
    {
      name: "functions.function.update",
      description: "Can update a Function",
    },
    {
      name: "functions.registry.create",
      description: "Can create a functions Registry",
    },
    {
      name: "functions.registry.delete",
      description: "Can delete a functions Registry",
    },
    {
      name: "functions.registry.get",
      description: "Can read a single functions Registry",
    },
    {
      name: "functions.registry.list",
      description: "Can list functions Registries",
    },
    {
      name: "functions.registry.update",
      description: "Can update a functions Registry",
    },
    {
      name: "functions.revision.create",
      description: "Can deploy a function Revision",
    },
    {
      name: "functions.revision.delete",
      description: "Can remove a function Revision",
    },
    {
      name: "functions.revision.get",
      description: "Can read a single function Revision",
    },
    {
      name: "functions.revision.list",
      description: "Can list function Revisions",
    },
    {
      name: "functions.revision.update",
      description: "Can update a function revision",
    },
    {
      name: "git.flavor.list",
      description: "Can list flavors.",
    },
    {
      name: "git.instance.authentication-source.create",
      description: "Can create an Authentication Source.",
    },
    {
      name: "git.instance.authentication-source.delete",
      description: "Can delete an Authentication Source.",
    },
    {
      name: "git.instance.authentication-source.get",
      description: "Can read an Authentication Source.",
    },
    {
      name: "git.instance.authentication-source.list",
      description: "Can list Authentications Sources.",
    },
    {
      name: "git.instance.authentication-source.update",
      description: "Can update an Authentication Source.",
    },
    {
      name: "git.instance.create",
      description: "Can create an instance.",
    },
    {
      name: "git.instance.delete",
      description: "Can delete an instance.",
    },
    {
      name: "git.instance.get",
      description: "Can read an instance.",
    },
    {
      name: "git.instance.list",
      description: "Can list instances.",
    },
    {
      name: "git.instance.manage",
      description: "He can perform management tasks within a project.",
    },
    {
      name: "git.instance.update",
      description: "Can update an instance.",
    },
    {
      name: "git.instance.users.create",
      description: "Can create an Instance User.",
    },
    {
      name: "git.instance.users.delete",
      description: "Can delete an Instance User.",
    },
    {
      name: "git.instance.users.get",
      description: "Can read an Instance User.",
    },
    {
      name: "git.instance.users.update",
      description: "Can update an Instance User.",
    },
    {
      name: "git.runner.create",
      description: "Can create a runner associated with an instance.",
    },
    {
      name: "git.runner.delete",
      description: "Can delete a runner associated with an instance.",
    },
    {
      name: "git.runner.get",
      description:
        "Can get the information from a runner associated with an instance.",
    },
    {
      name: "iaas.affinity-group.create",
      description: "Can create an affinity group.",
    },
    {
      name: "iaas.affinity-group.delete",
      description: "Can delete an affinity group.",
    },
    {
      name: "iaas.affinity-group.get",
      description: "Can get affinity group details.",
    },
    {
      name: "iaas.affinity-group.list",
      description: "Can list affinity groups.",
    },
    {
      name: "iaas.backup.create",
      description: "Can create a backup.",
    },
    {
      name: "iaas.backup.delete",
      description: "Can delete a backup.",
    },
    {
      name: "iaas.backup.get",
      description: "Can get backup details.",
    },
    {
      name: "iaas.backup.list",
      description: "Can list backups.",
    },
    {
      name: "iaas.backup.restore",
      description: "Can restore a backup.",
    },
    {
      name: "iaas.backup.update",
      description: "Can update a backup.",
    },
    {
      name: "iaas.image.create",
      description: "Can create an image.",
    },
    {
      name: "iaas.image.delete",
      description: "Can delete images.",
    },
    {
      name: "iaas.image.get",
      description: "Can get image details.",
    },
    {
      name: "iaas.image.list",
      description: "Can list images.",
    },
    {
      name: "iaas.image.share.delete",
      description: "Can delete image shares.",
    },
    {
      name: "iaas.image.share.get",
      description: "Can get image share details.",
    },
    {
      name: "iaas.image.share.update",
      description: "Can update image share parameters.",
    },
    {
      name: "iaas.image.update",
      description: "Can update image parameters.",
    },
    {
      name: "iaas.isolated-network.create",
      description: "Can create a isolated network",
    },
    {
      name: "iaas.keypair.create",
      description: "Can create a compute key-pair.",
    },
    {
      name: "iaas.keypair.delete",
      description: "Can delete a compute key-pair.",
    },
    {
      name: "iaas.keypair.get",
      description: "Can get compute key-pair details.",
    },
    {
      name: "iaas.keypair.list",
      description: "Can list compute key-pairs.",
    },
    {
      name: "iaas.machine-type.get",
      description: "Can get machine type details.",
    },
    {
      name: "iaas.machine-type.list",
      description: "Can list machine types.",
    },
    {
      name: "iaas.network.create",
      description: "Can create a network.",
    },
    {
      name: "iaas.network.delete",
      description: "Can delete a network.",
    },
    {
      name: "iaas.network.get",
      description: "Can get network details.",
    },
    {
      name: "iaas.network.list",
      description: "Can list networks.",
    },
    {
      name: "iaas.network.update",
      description: "Can update a network.",
    },
    {
      name: "iaas.nic.create",
      description: "Can create a NIC.",
    },
    {
      name: "iaas.nic.delete",
      description: "Can delete a NIC.",
    },
    {
      name: "iaas.nic.get",
      description: "Can get NIC details.",
    },
    {
      name: "iaas.nic.list",
      description: "Can list NICs.",
    },
    {
      name: "iaas.nic.update",
      description: "Can update a NIC.",
    },
    {
      name: "iaas.openstack-network.get",
      description: "Can get openstack network details.",
    },
    {
      name: "iaas.prefix-list.create",
      description: "Can create prefix-list.",
    },
    {
      name: "iaas.prefix-list.delete",
      description: "Can delete prefix-list.",
    },
    {
      name: "iaas.prefix-list.entry.list",
      description: "Can list prefix-list entries.",
    },
    {
      name: "iaas.prefix-list.entry.update",
      description: "Can update prefix-list entries.",
    },
    {
      name: "iaas.prefix-list.get",
      description: "Can get prefix-list.",
    },
    {
      name: "iaas.prefix-list.list",
      description: "Can list prefix-list.",
    },
    {
      name: "iaas.prefix-list.update",
      description: "Can update prefix-list.",
    },
    {
      name: "iaas.project.get",
      description: "Can get iaas project details.",
    },
    {
      name: "iaas.project.update",
      description: "Can update an iaas project.",
    },
    {
      name: "iaas.public-ip.create",
      description: "Can create a public ip.",
    },
    {
      name: "iaas.public-ip.delete",
      description: "Can delete a public ip.",
    },
    {
      name: "iaas.public-ip.get",
      description: "Can get public ip details.",
    },
    {
      name: "iaas.public-ip.list",
      description: "Can list public ips.",
    },
    {
      name: "iaas.public-ip.update",
      description: "Can update a public ip.",
    },
    {
      name: "iaas.quota.get",
      description: "Can get quotas.",
    },
    {
      name: "iaas.request.get",
      description: "Can get IaaS request details.",
    },
    {
      name: "iaas.security-group.create",
      description: "Can create a security-group.",
    },
    {
      name: "iaas.security-group.delete",
      description: "Can delete a security-group.",
    },
    {
      name: "iaas.security-group.get",
      description: "Can get security-groups.",
    },
    {
      name: "iaas.security-group.list",
      description: "Can list security-groups.",
    },
    {
      name: "iaas.security-group.rule.create",
      description: "Can create a security-group rule.",
    },
    {
      name: "iaas.security-group.rule.delete",
      description: "Can delete a security-group rule.",
    },
    {
      name: "iaas.security-group.rule.get",
      description: "Can get security-group rules.",
    },
    {
      name: "iaas.security-group.rule.list",
      description: "Can list security-group rules.",
    },
    {
      name: "iaas.security-group.rule.update",
      description: "Can update a security-group rule.",
    },
    {
      name: "iaas.security-group.update",
      description: "Can update a security-group.",
    },
    {
      name: "iaas.server.console-log.get",
      description: "Can get a server console log.",
    },
    {
      name: "iaas.server.console-url.get",
      description: "Can get a server console url.",
    },
    {
      name: "iaas.server.create",
      description: "Can create a server.",
    },
    {
      name: "iaas.server.deallocate",
      description: "Can deallocate a server.",
    },
    {
      name: "iaas.server.delete",
      description: "Can delete a server.",
    },
    {
      name: "iaas.server.get",
      description: "Can get server details.",
    },
    {
      name: "iaas.server.list",
      description: "Can list servers.",
    },
    {
      name: "iaas.server.metadata.get",
      description: "Can get metadata of a server.",
    },
    {
      name: "iaas.server.metadata.update",
      description: "Can update metadata of a server.",
    },
    {
      name: "iaas.server.network.add",
      description: "Can add a network to a server.",
    },
    {
      name: "iaas.server.network.remove",
      description: "Can remove a network from a server.",
    },
    {
      name: "iaas.server.nic.add",
      description: "Can add a NIC to a server.",
    },
    {
      name: "iaas.server.nic.list",
      description: "Can list NICs attached to a server.",
    },
    {
      name: "iaas.server.nic.remove",
      description: "Can remove a NIC from a server.",
    },
    {
      name: "iaas.server.public-ip.add",
      description: "Can add a public-ip to a server.",
    },
    {
      name: "iaas.server.public-ip.remove",
      description: "Can remove a public-ip from a server.",
    },
    {
      name: "iaas.server.reboot",
      description: "Can reboot a server.",
    },
    {
      name: "iaas.server.rescue",
      description: "Can rescue a server.",
    },
    {
      name: "iaas.server.resize",
      description: "Can resize a server.",
    },
    {
      name: "iaas.server.security-group.add",
      description: "Can add a security-group to a server.",
    },
    {
      name: "iaas.server.security-group.remove",
      description: "Can remove a security-group from a server.",
    },
    {
      name: "iaas.server.service-account.add",
      description: "Can add a service-account to a server.",
    },
    {
      name: "iaas.server.service-account.list",
      description: "Can list service-accounts associated to a server.",
    },
    {
      name: "iaas.server.service-account.remove",
      description: "Can remove a service-account from a server.",
    },
    {
      name: "iaas.server.start",
      description: "Can start a server.",
    },
    {
      name: "iaas.server.stop",
      description: "Can stop a server.",
    },
    {
      name: "iaas.server.unrescue",
      description: "Can unrescue a server.",
    },
    {
      name: "iaas.server.update",
      description: "Can update a server.",
    },
    {
      name: "iaas.server.volume.add",
      description: "Can attach a volume to a server.",
    },
    {
      name: "iaas.server.volume.get",
      description: "Can get volume-attachment to a server.",
    },
    {
      name: "iaas.server.volume.list",
      description: "Can list all volume-attachments of a server.",
    },
    {
      name: "iaas.server.volume.remove",
      description: "Can detach a volume to a server.",
    },
    {
      name: "iaas.server.volume.update",
      description: "Can update a volume-attachment of a server.",
    },
    {
      name: "iaas.snapshot.create",
      description: "Can create a snapshot.",
    },
    {
      name: "iaas.snapshot.delete",
      description: "Can delete a snapshot.",
    },
    {
      name: "iaas.snapshot.get",
      description: "Can get snapshot details.",
    },
    {
      name: "iaas.snapshot.list",
      description: "Can list snapshots.",
    },
    {
      name: "iaas.snapshot.update",
      description: "Can update details of a snapshot.",
    },
    {
      name: "iaas.virtual-ip.create",
      description: "Can create a virtual ip.",
    },
    {
      name: "iaas.virtual-ip.delete",
      description: "Can delete a virtual ip.",
    },
    {
      name: "iaas.virtual-ip.get",
      description: "Can get virtual ip details.",
    },
    {
      name: "iaas.virtual-ip.list",
      description: "Can list virtual ips.",
    },
    {
      name: "iaas.virtual-ip.member.add",
      description: "Can add a member to a virtual ip.",
    },
    {
      name: "iaas.virtual-ip.member.remove",
      description: "Can remove a member from a virtual ip.",
    },
    {
      name: "iaas.virtual-ip.update",
      description: "Can update a virtual ip.",
    },
    {
      name: "iaas.volume-performance-class.get",
      description: "Can get volume performance class details.",
    },
    {
      name: "iaas.volume-performance-class.list",
      description: "Can list volume performance classes.",
    },
    {
      name: "iaas.volume.create",
      description: "Can create a new volume.",
    },
    {
      name: "iaas.volume.delete",
      description: "Can delete a volume.",
    },
    {
      name: "iaas.volume.get",
      description: "Can get volume details.",
    },
    {
      name: "iaas.volume.list",
      description: "Can list volumes.",
    },
    {
      name: "iaas.volume.resize",
      description: "Can change the size of an existing volume.",
    },
    {
      name: "iaas.volume.retype",
      description: "Can change the type of an existing volume.",
    },
    {
      name: "iaas.volume.update",
      description: "Can update a new volume.",
    },
    {
      name: "iaas.volume.upload",
      description: "Can upload a volume to create a new image.",
    },
    {
      name: "iam.member.add",
      description: "Can add members for the resource and child resources.",
    },
    {
      name: "iam.member.get",
      description: "Can read members of the resource and child resources.",
    },
    {
      name: "iam.member.remove",
      description: "Can remove members of the resource and child resources.",
    },
    {
      name: "iam.role.add",
      description: "Can add roles for the resource and child resources.",
    },
    {
      name: "iam.role.edit",
      description: "Can edit roles for the resource and child resources.",
    },
    {
      name: "iam.role.get",
      description: "Can read roles of the resource and child resources.",
    },
    {
      name: "iam.role.list",
      description: "Can list roles of the resource and child resources.",
    },
    {
      name: "iam.role.remove",
      description: "Can remove roles of the resource and child resources.",
    },
    {
      name: "iam.service-account-federation.create",
      description: "Can create service account federated identity providers.",
    },
    {
      name: "iam.service-account-federation.delete",
      description: "Can delete service account federated identity providers.",
    },
    {
      name: "iam.service-account-federation.edit",
      description: "Can edit service account federated identity providers.",
    },
    {
      name: "iam.service-account-federation.get",
      description: "Can get service account federated identity providers.",
    },
    {
      name: "iam.service-account-federation.list",
      description: "Can list service account federated identity providers.",
    },
    {
      name: "iam.service-account-key.create",
      description: "Can create service account keys.",
    },
    {
      name: "iam.service-account-key.delete",
      description: "Can delete service account keys.",
    },
    {
      name: "iam.service-account-key.edit",
      description: "Can edit service account keys.",
    },
    {
      name: "iam.service-account-key.get",
      description: "Can get service account keys.",
    },
    {
      name: "iam.service-account-key.list",
      description: "Can list service account keys.",
    },
    {
      name: "iam.service-account-token.create",
      description:
        "Can create service account tokens (Service Account Access Token feature will be deprecated effective December 17, 2025).",
    },
    {
      name: "iam.service-account-token.delete",
      description:
        "Can delete service account tokens (Service Account Access Token feature will be deprecated effective December 17, 2025).",
    },
    {
      name: "iam.service-account-token.list",
      description:
        "Can list service account tokens (Service Account Access Token feature will be deprecated effective December 17, 2025).",
    },
    {
      name: "iam.service-account.act-as",
      description: "Can attach service accounts to VMs.",
    },
    {
      name: "iam.service-account.create",
      description: "Can create service accounts.",
    },
    {
      name: "iam.service-account.delete",
      description: "Can delete service accounts.",
    },
    {
      name: "iam.service-account.get",
      description: "Can get service accounts.",
    },
    {
      name: "iam.service-account.impersonate",
      description: "Can impersonate service accounts.",
    },
    {
      name: "iam.service-account.list",
      description: "Can list service accounts.",
    },
    {
      name: "intake.intake.create",
      description: "Can create a intake",
    },
    {
      name: "intake.intake.delete",
      description: "Can delete a intake",
    },
    {
      name: "intake.intake.get",
      description: "Can read a intake",
    },
    {
      name: "intake.intake.list",
      description: "Can list intake.",
    },
    {
      name: "intake.intake.update",
      description: "Can update a intake",
    },
    {
      name: "key-value-store.credential.create",
      description: "Can create a key value store credential.",
    },
    {
      name: "key-value-store.credential.delete",
      description: "Can delete a key value store credential.",
    },
    {
      name: "key-value-store.credential.get",
      description: "Can read a key value store credential.",
    },
    {
      name: "key-value-store.credential.list",
      description: "Can list key value store credentials.",
    },
    {
      name: "key-value-store.instance.create",
      description: "Can create a key value store instance.",
    },
    {
      name: "key-value-store.instance.delete",
      description: "Can delete a key value store instance.",
    },
    {
      name: "key-value-store.instance.get",
      description: "Can read a key value store instance.",
    },
    {
      name: "key-value-store.instance.list",
      description: "Can list key value store instances.",
    },
    {
      name: "key-value-store.instance.update",
      description: "Can update a key value store instance.",
    },
    {
      name: "key-value-store.offerings.list",
      description: "Can list key value store offerings.",
    },
    {
      name: "key-value-store.proxy.read",
      description: "Can perform a9s proxy api read requests.",
    },
    {
      name: "key-value-store.proxy.write",
      description: "Can perform a9s proxy api write requests.",
    },
    {
      name: "kms.key.get",
      description: "Can read a kms key.",
    },
    {
      name: "kms.key.list",
      description: "Can list kms keys.",
    },
    {
      name: "kms.key.version.decrypt",
      description: "Can decrypt a kms key version.",
    },
    {
      name: "kms.key.version.encrypt",
      description: "Can encrypt a kms key version.",
    },
    {
      name: "kms.key.version.sign",
      description: "Can sign a kms key version.",
    },
    {
      name: "kms.key.version.verify",
      description: "Can verify a kms key version.",
    },
    {
      name: "kms.keyring.create",
      description: "Can create a kms key ring.",
    },
    {
      name: "kms.keyring.delete",
      description: "Can delete a kms key ring.",
    },
    {
      name: "kms.keyring.get",
      description: "Can read a kms key ring.",
    },
    {
      name: "kms.keyring.list",
      description: "Can list kms key rings.",
    },
    {
      name: "kms.keyring.update",
      description: "Can update a kms key ring.",
    },
    {
      name: "lb-ip-lists.loadbalancer.delete",
      description: "Deletes a given IP list.",
    },
    {
      name: "lb-ip-lists.loadbalancer.get",
      description: "Retrieves a single IP list of a project.",
    },
    {
      name: "lb-ip-lists.loadbalancer.list",
      description: "Retrieves all IP lists associated with a project.",
    },
    {
      name: "lb-ip-lists.loadbalancer.upload",
      description: "Creates or replaces an IP list of a project.",
    },
    {
      name: "lb-ip-lists.ping",
      description: "Echoes the project_id to verify API connectivity.",
    },
    {
      name: "lb-ip-lists.quota.get",
      description:
        "GetQuota gets the configured Load Balancer IP Lists API resource quotas for the project.",
    },
    {
      name: "lds.authentication.auth",
      description: "Can authenticate towards workspace",
    },
    {
      name: "lds.customer.delete",
      description:
        "removes relation between stackit project and google customer ID.",
    },
    {
      name: "lds.customer.get",
      description: "Can get google Customer ID.",
    },
    {
      name: "lds.customer.update",
      description:
        "Can update the associated google customer id related to this STACKIT project.",
    },
    {
      name: "lds.enablement.delete",
      description: "Can remove current service enablement.",
    },
    {
      name: "lds.enablement.get",
      description: "Can get current service enablement status.",
    },
    {
      name: "lds.enablement.update",
      description: "Can update current service enablement.",
    },
    {
      name: "lds.failover.check-enabled",
      description: "Has rights to get enablement.",
    },
    {
      name: "lds.failover.enable",
      description: "Can enable failover for project.",
    },
    {
      name: "lds.failover.get",
      description: "Can get failover data.",
    },
    {
      name: "lds.failover.start",
      description: "Can start a failover.",
    },
    {
      name: "lds.takeout.get",
      description: "Can get specific takeout details.",
    },
    {
      name: "lds.takeout.list",
      description: "Can list takeouts.",
    },
    {
      name: "logme.credential.create",
      description: "Can create a logme credential.",
    },
    {
      name: "logme.credential.delete",
      description: "Can delete a logme credential.",
    },
    {
      name: "logme.credential.get",
      description: "Can read a logme credential.",
    },
    {
      name: "logme.credential.list",
      description: "Can list logme credentials.",
    },
    {
      name: "logme.instance.create",
      description: "Can create a logme instance.",
    },
    {
      name: "logme.instance.delete",
      description: "Can delete a logme instance.",
    },
    {
      name: "logme.instance.get",
      description: "Can read a logme instance.",
    },
    {
      name: "logme.instance.list",
      description: "Can list logme instances.",
    },
    {
      name: "logme.instance.update",
      description: "Can update a logme instance.",
    },
    {
      name: "logme.offerings.list",
      description: "Can list logme offerings.",
    },
    {
      name: "logme.proxy.read",
      description: "Can perform a9s proxy api read requests.",
    },
    {
      name: "logme.proxy.write",
      description: "Can perform a9s proxy api write requests.",
    },
    {
      name: "logs.instance.access-policies.create",
      description: "Can create logs access policies.",
    },
    {
      name: "logs.instance.access-policies.delete",
      description: "Can delete logs access policies.",
    },
    {
      name: "logs.instance.access-policies.get",
      description: "Can read logs access policies.",
    },
    {
      name: "logs.instance.access-policies.list",
      description: "Can list logs access policies.",
    },
    {
      name: "logs.instance.access-policies.update",
      description: "Can update logs access policies.",
    },
    {
      name: "logs.instance.create",
      description: "Can create a logs instance.",
    },
    {
      name: "logs.instance.credentials.create",
      description: "Can create logs credentials.",
    },
    {
      name: "logs.instance.credentials.delete",
      description: "Can delete logs credentials.",
    },
    {
      name: "logs.instance.credentials.get",
      description: "Can read logs credentials.",
    },
    {
      name: "logs.instance.credentials.list",
      description: "Can list logs credentials.",
    },
    {
      name: "logs.instance.credentials.update",
      description: "Can update logs credentials.",
    },
    {
      name: "logs.instance.delete",
      description: "Can delete a logs instance.",
    },
    {
      name: "logs.instance.get",
      description: "Can read a logs instance.",
    },
    {
      name: "logs.instance.list",
      description: "Can list logs instances.",
    },
    {
      name: "logs.instance.update",
      description: "Can update a logs instance.",
    },
    {
      name: "mailout.authorized-sender.create",
      description: "Can create mailout authorized senders.",
    },
    {
      name: "mailout.authorized-sender.delete",
      description: "Can delete mailout authorized senders.",
    },
    {
      name: "mailout.authorized-sender.get",
      description: "Can get mailout authorized sender information.",
    },
    {
      name: "mailout.authorized-sender.list",
      description: "Can list mailout authorized senders.",
    },
    {
      name: "mailout.authorized-sender.update",
      description: "Can update mailout authorized sender information.",
    },
    {
      name: "mailout.sending-domain.create",
      description: "Can create mailout sending domains.",
    },
    {
      name: "mailout.sending-domain.delete",
      description: "Can delete mailout sending domains.",
    },
    {
      name: "mailout.sending-domain.get",
      description: "Can get mailout sending domain information.",
    },
    {
      name: "mailout.sending-domain.list",
      description: "Can list mailout sending domains.",
    },
    {
      name: "mailout.sending-domain.message.get",
      description:
        "Can get details of mailout email message for sending domains",
    },
    {
      name: "mailout.sending-domain.message.list",
      description: "Can list mailout email messages for sending domains",
    },
    {
      name: "mailout.sending-domain.suppression.create",
      description:
        "Can add new email address to mailout suppressed email recipients for sending domains",
    },
    {
      name: "mailout.sending-domain.suppression.delete",
      description:
        "Can delete an email address from mailout suppressed email recipients for sending domains",
    },
    {
      name: "mailout.sending-domain.suppression.list",
      description:
        "Can list mailout suppressed email recipients for sending domains",
    },
    {
      name: "mailout.sending-domain.update",
      description: "Can update mailout sending domain information.",
    },
    {
      name: "mailout.sending-domain.validate",
      description: "Can validate mailout sending domains.",
    },
    {
      name: "mariadb.credential.create",
      description: "Can create a mariadb credential.",
    },
    {
      name: "mariadb.credential.delete",
      description: "Can delete a mariadb credential.",
    },
    {
      name: "mariadb.credential.get",
      description: "Can read a mariadb credential.",
    },
    {
      name: "mariadb.credential.list",
      description: "Can list mariadb credentials.",
    },
    {
      name: "mariadb.instance.create",
      description: "Can create a mariadb instance.",
    },
    {
      name: "mariadb.instance.delete",
      description: "Can delete a mariadb instance.",
    },
    {
      name: "mariadb.instance.get",
      description: "Can read a mariadb instance.",
    },
    {
      name: "mariadb.instance.list",
      description: "Can list mariadb instances.",
    },
    {
      name: "mariadb.instance.update",
      description: "Can update a mariadb instance.",
    },
    {
      name: "mariadb.offerings.list",
      description: "Can list mariadb offerings.",
    },
    {
      name: "mariadb.proxy.read",
      description: "Can perform a9s proxy api read requests.",
    },
    {
      name: "mariadb.proxy.write",
      description: "Can perform a9s proxy api write requests.",
    },
    {
      name: "marketplace.asset.create",
      description: "Can create STACKIT Marketplace product assets",
    },
    {
      name: "marketplace.asset.delete",
      description: "Can delete STACKIT Marketplace product assets",
    },
    {
      name: "marketplace.asset.get",
      description: "Can get STACKIT Marketplace product assets",
    },
    {
      name: "marketplace.asset.list",
      description: "Can list STACKIT Marketplace product assets",
    },
    {
      name: "marketplace.asset.update",
      description: "Can update STACKIT Marketplace product assets",
    },
    {
      name: "marketplace.catalog.get",
      description: "Can get STACKIT Marketplace catalog products",
    },
    {
      name: "marketplace.catalog.list",
      description: "Can list STACKIT Marketplace catalog products",
    },
    {
      name: "marketplace.inquiry.create",
      description: "Can create STACKIT Marketplace inquiries",
    },
    {
      name: "marketplace.subscription.approve",
      description: "Can approve pending STACKIT Marketplace subscriptions",
    },
    {
      name: "marketplace.subscription.create",
      description: "Can create STACKIT Marketplace subscriptions",
    },
    {
      name: "marketplace.subscription.delete",
      description: "Can delete/cancel STACKIT Marketplace subscriptions",
    },
    {
      name: "marketplace.subscription.get",
      description: "Can get STACKIT Marketplace subscriptions",
    },
    {
      name: "marketplace.subscription.list",
      description: "Can list STACKIT Marketplace subscriptions",
    },
    {
      name: "marketplace.subscription.reject",
      description:
        "Can reject STACKIT Marketplace subscriptions to preview products",
    },
    {
      name: "marketplace.subscription.update",
      description: "Can update STACKIT Marketplace subscriptions",
    },
    {
      name: "model-experiments.instance.create",
      description: "Can create model-experiments instances.",
    },
    {
      name: "model-experiments.instance.delete",
      description: "Can delete model-experiments instances.",
    },
    {
      name: "model-experiments.instance.get",
      description: "Can get model-experiments instance information.",
    },
    {
      name: "model-experiments.instance.list",
      description: "Can list model-experiments instances.",
    },
    {
      name: "model-experiments.instance.login",
      description: "Can login to model-experiments instance.",
    },
    {
      name: "model-experiments.instance.update",
      description: "Can update model-experiments instance information.",
    },
    {
      name: "model-experiments.token.create",
      description: "Can create model-experiments tokens.",
    },
    {
      name: "model-experiments.token.delete",
      description: "Can delete model-experiments tokens.",
    },
    {
      name: "model-experiments.token.get",
      description: "Can get model-experiments token information.",
    },
    {
      name: "model-experiments.token.list",
      description: "Can list model-experiments tokens.",
    },
    {
      name: "model-experiments.token.update",
      description: "Can update model-experiments token information.",
    },
    {
      name: "model-serving.instance.create",
      description: "Can create model-serving instances.",
    },
    {
      name: "model-serving.instance.delete",
      description: "Can delete model-serving instances.",
    },
    {
      name: "model-serving.instance.get",
      description: "Can get model-serving instance information.",
    },
    {
      name: "model-serving.instance.list",
      description: "Can list model-serving instances.",
    },
    {
      name: "model-serving.instance.update",
      description: "Can update model-serving instance information.",
    },
    {
      name: "model-serving.token.create",
      description: "Can create model-serving tokens.",
    },
    {
      name: "model-serving.token.delete",
      description: "Can delete model-serving tokens.",
    },
    {
      name: "model-serving.token.get",
      description: "Can get model-serving token information.",
    },
    {
      name: "model-serving.token.list",
      description: "Can list model-serving tokens.",
    },
    {
      name: "model-serving.token.update",
      description: "Can update model-serving token information.",
    },
    {
      name: "mongodb-flex.advisor.list",
      description: "Can list performance advisor information.",
    },
    {
      name: "mongodb-flex.backup.clone",
      description: "Can clone mongodb-flex backup(s).",
    },
    {
      name: "mongodb-flex.backup.get",
      description: "Can get information about backup(s).",
    },
    {
      name: "mongodb-flex.backup.list",
      description: "Can list backups of instance(s).",
    },
    {
      name: "mongodb-flex.backup.restore-list",
      description: "Can list backup restore of instance(s).",
    },
    {
      name: "mongodb-flex.backup.restore-snapshot",
      description: "Can start mongodb-flex restore of backup(s).",
    },
    {
      name: "mongodb-flex.backup.update",
      description: "Can update mongodb-flex backup(s).",
    },
    {
      name: "mongodb-flex.flavor.list",
      description: "Can list MongoDB-Flex flavors.",
    },
    {
      name: "mongodb-flex.instance.create",
      description: "Can create mongodb-flex instance(s).",
    },
    {
      name: "mongodb-flex.instance.delete",
      description: "Can delete mongodb-flex instance(s).",
    },
    {
      name: "mongodb-flex.instance.get",
      description: "Can get mongodb-flex instance(s).",
    },
    {
      name: "mongodb-flex.instance.list",
      description: "Can list mongodb-flex instance(s).",
    },
    {
      name: "mongodb-flex.instance.update",
      description: "Can update mongodb-flex instance(s).",
    },
    {
      name: "mongodb-flex.metric.get",
      description: "Can get metrics of instance(s).",
    },
    {
      name: "mongodb-flex.project.delete",
      description: "Delete all mongodb-flex instances in this project.",
    },
    {
      name: "mongodb-flex.storage.list",
      description: "Can list Storage Classes.",
    },
    {
      name: "mongodb-flex.user.create",
      description: "Can create mongodb-flex user(s).",
    },
    {
      name: "mongodb-flex.user.delete",
      description: "Can delete sqlserver user(s).",
    },
    {
      name: "mongodb-flex.user.get",
      description: "Can get mongodb-flex user(s).",
    },
    {
      name: "mongodb-flex.user.list",
      description: "Can list mongodb-flex user(s).",
    },
    {
      name: "mongodb-flex.user.reset",
      description: "Can reset mongodb-flex instance users.",
    },
    {
      name: "mongodb-flex.user.update",
      description: "Can update mongodb-flex user(s).",
    },
    {
      name: "mongodb-flex.version.get",
      description: "Can list MongoDB-Flex versions.",
    },
    {
      name: "nlb.credentials.create",
      description:
        "Create credentials can be used to store existing credentials, which are valid to be used for Load Balancer Observability.",
    },
    {
      name: "nlb.credentials.delete",
      description: "Delete Credential",
    },
    {
      name: "nlb.credentials.get",
      description: "Get Credentials",
    },
    {
      name: "nlb.credentials.list",
      description: "List Credentials",
    },
    {
      name: "nlb.credentials.update",
      description: "Update Credentials",
    },
    {
      name: "nlb.loadbalancer.create",
      description: "Create Load Balancer will create a load balancer.",
    },
    {
      name: "nlb.loadbalancer.delete",
      description: "DeleteLoadBalancer will delete a given load balancer.",
    },
    {
      name: "nlb.loadbalancer.get",
      description:
        "Get Load Balancer will get a single load balancer of a project.",
    },
    {
      name: "nlb.loadbalancer.list",
      description: "ListLoadBalancer will list load balancers of a project.",
    },
    {
      name: "nlb.loadbalancer.update",
      description:
        "Update Load Balancer allows the change of listeners and target pools of an existing Load Balancer.",
    },
    {
      name: "nlb.migration.create",
      description:
        "***SPEC_IGNORE Hidden endpoint to create a load balancer for migration SPEC_IGNORE***",
    },
    {
      name: "nlb.migration.get",
      description:
        "***SPEC_IGNORE Hidden endpoint to get a load balancer for migration SPEC_IGNORE***",
    },
    {
      name: "nlb.migration.update",
      description:
        "***SPEC_IGNORE Hidden endpoint to update the state of a load balancer migration SPEC_IGNORE***",
    },
    {
      name: "nlb.ping",
      description:
        "Ping will echo the project_id from the request into the response.",
    },
    {
      name: "nlb.quota.get",
      description:
        "GetQuota gets the configured NLB resource quotas for the project.",
    },
    {
      name: "nlb.targetpool.replace",
      description:
        "ReplaceTargetPool will replace a specific target pool of a load balancer with new content. Cannot be used to create or rename a target pool.",
    },
    {
      name: "notebooks.identity-provider.update",
      description:
        "Can update the identity provider configuration for STACKIT Notebooks",
    },
    {
      name: "notebooks.instance.create",
      description: "Can create an STACKIT Notebooks instance.",
    },
    {
      name: "notebooks.instance.delete",
      description: "Can delete an STACKIT Notebooks instance.",
    },
    {
      name: "notebooks.instance.get",
      description: "Can read an STACKIT Notebooks instance information.",
    },
    {
      name: "notebooks.instance.list",
      description: "Can list STACKIT Notebooks instances.",
    },
    {
      name: "notebooks.instance.update",
      description: "Can update an STACKIT Notebooks instance.",
    },
    {
      name: "notebooks.observability.update",
      description:
        "Can update the Observability configuration for STACKIT Notebooks",
    },
    {
      name: "object-storage.access-key.create",
      description: "Can create an access key.",
    },
    {
      name: "object-storage.access-key.delete",
      description: "Can delete an access key.",
    },
    {
      name: "object-storage.access-key.list",
      description: "Can list access keys.",
    },
    {
      name: "object-storage.bucket.create",
      description: "Can create a bucket.",
    },
    {
      name: "object-storage.bucket.delete",
      description: "Can delete a bucket.",
    },
    {
      name: "object-storage.bucket.list",
      description: "Can list all buckets.",
    },
    {
      name: "object-storage.bucket.update",
      description: "Can update a bucket.",
    },
    {
      name: "object-storage.compliance-lock.create",
      description: "Can activate compliance lock on a bucket.",
    },
    {
      name: "object-storage.compliance-lock.delete",
      description: "Can deactivate compliance lock on a bucket.",
    },
    {
      name: "object-storage.compliance-lock.list",
      description: "Can list compliance lock status of a bucket",
    },
    {
      name: "object-storage.credentials-group.create",
      description: "Can create a credentials group.",
    },
    {
      name: "object-storage.credentials-group.delete",
      description: "Can delete a credentials group.",
    },
    {
      name: "object-storage.credentials-group.list",
      description: "Can list all credentials groups.",
    },
    {
      name: "object-storage.service-account.create",
      description: "Can create a object-storage service account.",
    },
    {
      name: "object-storage.service-account.delete",
      description: "Can delete a object-storage service account.",
    },
    {
      name: "object-storage.service-account.list",
      description: "Can list object-storage service accounts.",
    },
    {
      name: "object-storage.service.create",
      description: "Can create the object storage service in projects.",
    },
    {
      name: "object-storage.service.delete",
      description: "Can delete the object storage service in projects.",
    },
    {
      name: "object-storage.service.list",
      description:
        "Can list the status of the object storage service in projects.",
    },
    {
      name: "object-storage.service.update",
      description: "Can update the object storage service in projects.",
    },
    {
      name: "opensearch.credential.create",
      description: "Can create a opensearch credential.",
    },
    {
      name: "opensearch.credential.delete",
      description: "Can delete a opensearch credential.",
    },
    {
      name: "opensearch.credential.get",
      description: "Can read a opensearch credential.",
    },
    {
      name: "opensearch.credential.list",
      description: "Can list opensearch credentials.",
    },
    {
      name: "opensearch.instance.create",
      description: "Can create a opensearch instance.",
    },
    {
      name: "opensearch.instance.delete",
      description: "Can delete a opensearch instance.",
    },
    {
      name: "opensearch.instance.get",
      description: "Can read a opensearch instance.",
    },
    {
      name: "opensearch.instance.list",
      description: "Can list opensearch instances.",
    },
    {
      name: "opensearch.instance.update",
      description: "Can update a opensearch instance.",
    },
    {
      name: "opensearch.offerings.list",
      description: "Can list opensearch offerings.",
    },
    {
      name: "opensearch.proxy.read",
      description: "Can perform a9s proxy api read requests.",
    },
    {
      name: "opensearch.proxy.write",
      description: "Can perform a9s proxy api write requests.",
    },
    {
      name: "postgres-flex.backup.get",
      description: "Can get postgres-flex backups.",
    },
    {
      name: "postgres-flex.backup.list",
      description: "Can list postgres-flex backups.",
    },
    {
      name: "postgres-flex.backup.restore",
      description: "Can restore a postgres-flex from a backup.",
    },
    {
      name: "postgres-flex.backup.update",
      description: "Can update postgres-flex backups.",
    },
    {
      name: "postgres-flex.collation.list",
      description: "Can list postgres-flex collations.",
    },
    {
      name: "postgres-flex.database.create",
      description: "Can create postgres-flex databases.",
    },
    {
      name: "postgres-flex.database.delete",
      description: "Can delete postgres-flex databases.",
    },
    {
      name: "postgres-flex.database.get",
      description: "Can get postgres-flex databases.",
    },
    {
      name: "postgres-flex.database.list",
      description: "Can list postgres-flex databases.",
    },
    {
      name: "postgres-flex.database.update",
      description: "Can update postgres-flex databases.",
    },
    {
      name: "postgres-flex.flavor.list",
      description: "Can list postgres-flex flavors.",
    },
    {
      name: "postgres-flex.instance.clone",
      description: "Can clone postgres-flex instance.",
    },
    {
      name: "postgres-flex.instance.create",
      description: "Can create postgres-flex instance(s).",
    },
    {
      name: "postgres-flex.instance.delete",
      description: "Can delete postgres-flex instance.",
    },
    {
      name: "postgres-flex.instance.force-delete",
      description: "Can force-delete postgres-flex instance.",
    },
    {
      name: "postgres-flex.instance.get",
      description: "Can get postgres-flex instance information.",
    },
    {
      name: "postgres-flex.instance.list",
      description: "Can list postgres-flex instances.",
    },
    {
      name: "postgres-flex.instance.protect",
      description: "Can protect postgres-flex instance.",
    },
    {
      name: "postgres-flex.instance.update",
      description: "Can update postgres-flex instance.",
    },
    {
      name: "postgres-flex.metric.list",
      description: "Can list postgres-flex metrics.",
    },
    {
      name: "postgres-flex.metrics-advanced.get",
      description: "get all metrics in the postgres flex metrics api",
    },
    {
      name: "postgres-flex.metrics-basic.get",
      description: "get basic metrics in the postgres flex metrics api",
    },
    {
      name: "postgres-flex.parameter.list",
      description: "Can list postgres-flex parameter.",
    },
    {
      name: "postgres-flex.role.list",
      description: "Can list postgres-flex Roles.",
    },
    {
      name: "postgres-flex.storage.list",
      description: "Can list postgres-flex storages.",
    },
    {
      name: "postgres-flex.user.create",
      description: "Can create postgres-flex instance users.",
    },
    {
      name: "postgres-flex.user.delete",
      description: "Can delete postgres-flex instance users.",
    },
    {
      name: "postgres-flex.user.get",
      description: "Can get postgres-flex instance users.",
    },
    {
      name: "postgres-flex.user.list",
      description: "Can list postgres-flex instance users.",
    },
    {
      name: "postgres-flex.user.reset",
      description: "Can reset postgres-flex instance users.",
    },
    {
      name: "postgres-flex.user.update",
      description: "Can update postgres-flex instance users.",
    },
    {
      name: "postgres-flex.version.list",
      description: "Can list postgres-flex versions.",
    },
    {
      name: "prometheus-proxy.mongodb.metric.get",
      description: "get all metrics with the prometheus proxy api for mongodb",
    },
    {
      name: "prometheus-proxy.postgres.metric.get",
      description: "get all metrics with the prometheus proxy api for postgres",
    },
    {
      name: "prometheus-proxy.sqlserver.metric.get",
      description:
        "get all metrics with the prometheus proxy api for sqlserver",
    },
    {
      name: "pubsub.subscription.create",
      description: "Can create a subscription.",
    },
    {
      name: "pubsub.subscription.delete",
      description: "Can delete a subscription.",
    },
    {
      name: "pubsub.subscription.get",
      description: "Can get a subscription.",
    },
    {
      name: "pubsub.subscription.list",
      description: "Can list subscriptions.",
    },
    {
      name: "pubsub.subscription.subscriber.add",
      description: "Can grant access to subscribe to a subscription.",
    },
    {
      name: "pubsub.subscription.subscriber.list",
      description: "Can list subscription subscribers.",
    },
    {
      name: "pubsub.subscription.subscriber.remove",
      description: "Can revoke access to subscribe to a subscription.",
    },
    {
      name: "pubsub.subscription.subscriber.update",
      description: "Can update access to subscribe to a subscription.",
    },
    {
      name: "pubsub.subscription.update",
      description: "Can update a subscription.",
    },
    {
      name: "pubsub.topic.create",
      description: "Can create a topic.",
    },
    {
      name: "pubsub.topic.delete",
      description: "Can delete a topic.",
    },
    {
      name: "pubsub.topic.get",
      description: "Can get a topic.",
    },
    {
      name: "pubsub.topic.list",
      description: "Can list topics.",
    },
    {
      name: "pubsub.topic.publisher.add",
      description: "Can grant access to publish to a topic.",
    },
    {
      name: "pubsub.topic.publisher.list",
      description: "Can list topic publishers.",
    },
    {
      name: "pubsub.topic.publisher.remove",
      description: "Can revoke access to publish to a topic.",
    },
    {
      name: "pubsub.topic.publisher.update",
      description: "Can update access to publish to a topic.",
    },
    {
      name: "pubsub.topic.update",
      description: "Can update a topic.",
    },
    {
      name: "rabbitmq.credential.create",
      description: "Can create a rabbitmq credential.",
    },
    {
      name: "rabbitmq.credential.delete",
      description: "Can delete a rabbitmq credential.",
    },
    {
      name: "rabbitmq.credential.get",
      description: "Can read a rabbitmq credential.",
    },
    {
      name: "rabbitmq.credential.list",
      description: "Can list rabbitmq credentials.",
    },
    {
      name: "rabbitmq.instance.create",
      description: "Can create a rabbitmq instance.",
    },
    {
      name: "rabbitmq.instance.delete",
      description: "Can delete a rabbitmq instance.",
    },
    {
      name: "rabbitmq.instance.get",
      description: "Can read a rabbitmq instance.",
    },
    {
      name: "rabbitmq.instance.list",
      description: "Can list rabbitmq instances.",
    },
    {
      name: "rabbitmq.instance.update",
      description: "Can update a rabbitmq instance.",
    },
    {
      name: "rabbitmq.offerings.list",
      description: "Can list rabbitmq offerings.",
    },
    {
      name: "rabbitmq.proxy.read",
      description: "Can perform a9s proxy api read requests.",
    },
    {
      name: "rabbitmq.proxy.write",
      description: "Can perform a9s proxy api write requests.",
    },
    {
      name: "redis.credential.create",
      description: "Can create a redis credential.",
    },
    {
      name: "redis.credential.delete",
      description: "Can delete a redis credential.",
    },
    {
      name: "redis.credential.get",
      description: "Can read a redis credential.",
    },
    {
      name: "redis.credential.list",
      description: "Can list redis credentials.",
    },
    {
      name: "redis.instance.create",
      description: "Can create a redis instance.",
    },
    {
      name: "redis.instance.delete",
      description: "Can delete a redis instance.",
    },
    {
      name: "redis.instance.get",
      description: "Can read a redis instance.",
    },
    {
      name: "redis.instance.list",
      description: "Can list redis instances.",
    },
    {
      name: "redis.instance.update",
      description: "Can update a redis instance.",
    },
    {
      name: "redis.offerings.list",
      description: "Can list redis offerings.",
    },
    {
      name: "redis.proxy.read",
      description: "Can perform a9s proxy api read requests.",
    },
    {
      name: "redis.proxy.write",
      description: "Can perform a9s proxy api write requests.",
    },
    {
      name: "resource-manager.iam-policy.get",
      description: "Can get IAM policies via resource manager.",
    },
    {
      name: "resource-manager.iam-policy.update",
      description: "Can update IAM policies via resource manager.",
    },
    {
      name: "resource-manager.lock.create",
      description: "Can lock container.",
    },
    {
      name: "resource-manager.lock.delete",
      description: "Can unlock container.",
    },
    {
      name: "resource-manager.lock.get",
      description: "Can read locks of container.",
    },
    {
      name: "resource-manager.lock.list",
      description: "Can read locks of container and nested containers.",
    },
    {
      name: "resource-manager.project.delete",
      description: "Can delete project(s).",
    },
    {
      name: "resource-manager.project.direct.get",
      description: "Can get project metadata. Not inherited.",
    },
    {
      name: "resource-manager.project.edit",
      description: "Can edit project(s).",
    },
    {
      name: "resource-manager.project.get",
      description: "Can get project metadata.",
    },
    {
      name: "resource-manager.resource.project.edit",
      description: "Can edit resources in the project.",
    },
    {
      name: "resource-manager.resource.project.get",
      description: "Can read resources in the project.",
    },
    {
      name: "run-command.agent.get",
      description: "Can get STACKIT Server Agent info.",
    },
    {
      name: "run-command.command-template.get",
      description: "Can get command template.",
    },
    {
      name: "run-command.command.create",
      description: "Can run a new command.",
    },
    {
      name: "run-command.command.get",
      description: "Can get command result.",
    },
    {
      name: "run-command.command.list",
      description: "Can list commands results.",
    },
    {
      name: "sca.application.create",
      description: "Can create an application.",
    },
    {
      name: "sca.application.delete",
      description: "Can delete an application.",
    },
    {
      name: "sca.application.get",
      description: "Can get an application.",
    },
    {
      name: "sca.application.list",
      description: "Can list applications.",
    },
    {
      name: "sca.application.update",
      description: "Can update an application.",
    },
    {
      name: "sca.environment.create",
      description: "Can create an environment.",
    },
    {
      name: "sca.environment.delete",
      description: "Can delete an environment.",
    },
    {
      name: "sca.environment.get",
      description: "Can get an environments.",
    },
    {
      name: "sca.environment.list",
      description: "Can list environments.",
    },
    {
      name: "sca.environment.registry.list",
      description: "Can list environment registries.",
    },
    {
      name: "sca.environment.registry.update",
      description: "Can update an environment registry.",
    },
    {
      name: "sca.environment.secret.list",
      description: "Can list environment secrets.",
    },
    {
      name: "sca.environment.secret.update",
      description: "Can update an environment secret.",
    },
    {
      name: "sca.environment.update",
      description: "Can update an environment.",
    },
    {
      name: "sca.project.overview",
      description: "Can get the overview of a project.",
    },
    {
      name: "scf.org.create",
      description:
        "Permission to call the STACKIT Cloud Foundry API to create a Cloud Foundry Organization.",
    },
    {
      name: "scf.org.delete",
      description:
        "Permission to call the STACKIT Cloud Foundry API to delete a Cloud Foundry Organization.",
    },
    {
      name: "scf.org.get",
      description:
        "Permission to call the STACKIT Cloud Foundry API to get a Cloud Foundry Organization.",
    },
    {
      name: "scf.org.list",
      description:
        "Permission to call the STACKIT Cloud Foundry API to list Cloud Foundry Organizations.",
    },
    {
      name: "scf.org.manager.create",
      description:
        "Permission to call the STACKIT Cloud Foundry API to create a Cloud Foundry Organization Manager.",
    },
    {
      name: "scf.org.manager.delete",
      description:
        "Permission to call the STACKIT Cloud Foundry API to delete a Cloud Foundry Organization Manager.",
    },
    {
      name: "scf.org.manager.get",
      description:
        "Permission to call the STACKIT Cloud Foundry API to get a Cloud Foundry Organization Manager.",
    },
    {
      name: "scf.org.quota.get",
      description:
        "Permission to call the STACKIT Cloud Foundry API to fetch the quota of a Cloud Foundry Organization.",
    },
    {
      name: "scf.org.quota.list",
      description:
        "Permission to call the STACKIT Cloud Foundry API to list all available quotas of a Cloud Foundry Organization.",
    },
    {
      name: "scf.org.quota.update",
      description:
        "Permission to call the STACKIT Cloud Foundry API to update the quota of a Cloud Foundry Organization.",
    },
    {
      name: "scf.org.roles.create",
      description:
        "Permission to call the STACKIT Cloud Foundry API to create a Cloud Foundry Organization Role.",
    },
    {
      name: "scf.org.update",
      description:
        "Permission to call the STACKIT Cloud Foundry API to update a Cloud Foundry Organization.",
    },
    {
      name: "scf.org.usage.get",
      description:
        "Permission to call the STACKIT Cloud Foundry API to get a Cloud Foundry Organization Usage Summary.",
    },
    {
      name: "scf.platform.get",
      description:
        "Permission to call the STACKIT Cloud Foundry API to get a Cloud Foundry Platform.",
    },
    {
      name: "scf.platform.list",
      description:
        "Permission to call the STACKIT Cloud Foundry API to list Cloud Foundry Platforms.",
    },
    {
      name: "scf.platform.quota.get",
      description:
        "Permission to call the STACKIT Cloud Foundry API to fetch the quota of a Cloud Foundry Platform.",
    },
    {
      name: "scf.platform.quota.list",
      description:
        "Permission to call the STACKIT Cloud Foundry API to list all available quotas of a Cloud Foundry Platform.",
    },
    {
      name: "scf.space.create",
      description:
        "Permission to call the STACKIT Cloud Foundry API to create a Cloud Foundry Space.",
    },
    {
      name: "scf.space.delete",
      description:
        "Permission to call the STACKIT Cloud Foundry API to delete a Cloud Foundry Space.",
    },
    {
      name: "scf.space.get",
      description:
        "Permission to call the STACKIT Cloud Foundry API to get a Cloud Foundry Space.",
    },
    {
      name: "scf.space.list",
      description:
        "Permission to call the STACKIT Cloud Foundry API to list Cloud Foundry Spaces.",
    },
    {
      name: "scf.space.roles.create",
      description:
        "Permission to call the STACKIT Cloud Foundry API to create a Cloud Foundry Space Role.",
    },
    {
      name: "scf.space.update",
      description:
        "Permission to call the STACKIT Cloud Foundry API to update a Cloud Foundry Space.",
    },
    {
      name: "secrets-manager.instance.config.get",
      description: "Can read a secrets manager instance config.",
    },
    {
      name: "secrets-manager.instance.config.update",
      description: "Can update a secrets manager instance config.",
    },
    {
      name: "secrets-manager.instance.create",
      description: "Can create a secrets manager instance.",
    },
    {
      name: "secrets-manager.instance.delete",
      description: "Can delete a secrets manager instance.",
    },
    {
      name: "secrets-manager.instance.get",
      description: "Can read a secrets manager instance.",
    },
    {
      name: "secrets-manager.instance.list",
      description: "Can list secrets manager instances.",
    },
    {
      name: "secrets-manager.instance.role-binding.add",
      description: "Can add new role bindings for instances.",
    },
    {
      name: "secrets-manager.instance.role-binding.edit",
      description: "Can edit role bindings of instances.",
    },
    {
      name: "secrets-manager.instance.role-binding.get",
      description: "Can get role bindings of instances.",
    },
    {
      name: "secrets-manager.instance.role-binding.remove",
      description: "Can remove role bindings from instances.",
    },
    {
      name: "secrets-manager.instance.update",
      description: "Can update a secrets manager instance.",
    },
    {
      name: "secrets-manager.secret-group.create",
      description: "Can create a secrets manager secret group.",
    },
    {
      name: "secrets-manager.secret-group.delete",
      description: "Can delete a secrets manager secret group.",
    },
    {
      name: "secrets-manager.secret-group.get",
      description: "Can read a secrets manager secret group.",
    },
    {
      name: "secrets-manager.secret-group.list",
      description: "Can list secrets manager secret groups.",
    },
    {
      name: "secrets-manager.secret-group.role-binding.add",
      description: "Can add new role bindings for secret groups.",
    },
    {
      name: "secrets-manager.secret-group.role-binding.edit",
      description: "Can edit role bindings of secret groups.",
    },
    {
      name: "secrets-manager.secret-group.role-binding.get",
      description: "Can get role bindings of secret groups.",
    },
    {
      name: "secrets-manager.secret-group.role-binding.remove",
      description: "Can remove role bindings from secret groups.",
    },
    {
      name: "secrets-manager.secret-group.update",
      description: "Can update a secrets manager secret group.",
    },
    {
      name: "secrets-manager.secret.create",
      description: "Can create a secrets manager secret.",
    },
    {
      name: "secrets-manager.secret.delete",
      description: "Can delete a secrets manager secret.",
    },
    {
      name: "secrets-manager.secret.get",
      description: "Can read a secrets manager secret.",
    },
    {
      name: "secrets-manager.secret.list",
      description: "Can list secrets manager secrets.",
    },
    {
      name: "secrets-manager.secret.update",
      description: "Can update a secrets manager secret.",
    },
    {
      name: "secrets-manager.secret.version.create",
      description: "Can create a secrets manager secret version.",
    },
    {
      name: "secrets-manager.secret.version.destroy",
      description: "Can destroy a secrets manager secret version.",
    },
    {
      name: "secrets-manager.secret.version.disable",
      description: "Can disable a secrets manager secret version.",
    },
    {
      name: "secrets-manager.secret.version.enable",
      description: "Can enable a secrets manager secret version.",
    },
    {
      name: "secrets-manager.secret.version.get",
      description: "Can read a secrets manager secret version.",
    },
    {
      name: "secrets-manager.secret.version.list",
      description: "Can list secrets manager secret versions.",
    },
    {
      name: "server-backup.backup-schedule.create",
      description: "Can create backup schedule.",
    },
    {
      name: "server-backup.backup-schedule.delete",
      description: "Can delete backup schedule.",
    },
    {
      name: "server-backup.backup-schedule.get",
      description: "Can get backup schedule.",
    },
    {
      name: "server-backup.backup-schedule.list",
      description: "Can list backup schedules.",
    },
    {
      name: "server-backup.backup-schedule.update",
      description: "Can update backup schedule.",
    },
    {
      name: "server-backup.backup.create",
      description: "Can create server backup.",
    },
    {
      name: "server-backup.backup.delete",
      description: "Can delete server backup.",
    },
    {
      name: "server-backup.backup.get",
      description: "Can get server backup.",
    },
    {
      name: "server-backup.backup.list",
      description: "Can list server backups.",
    },
    {
      name: "server-backup.backup.restore",
      description: "Can restore server backup.",
    },
    {
      name: "server-backup.backup.volume-backup.delete",
      description: "Can delete volume backup.",
    },
    {
      name: "server-backup.backup.volume-backup.restore",
      description: "Can restore volume backup.",
    },
    {
      name: "server-backup.policy.list",
      description: "Can list backup policies.",
    },
    {
      name: "server-backup.service.disable",
      description: "Can disable Server Backup Management service.",
    },
    {
      name: "server-backup.service.enable",
      description: "Can enable Server Backup Management service.",
    },
    {
      name: "server-backup.service.get",
      description: "Can get Server Backup Management service details.",
    },
    {
      name: "server-update.policy.list",
      description: "Can list update policies.",
    },
    {
      name: "server-update.service.disable",
      description: "Can disable Server Update Management service.",
    },
    {
      name: "server-update.service.enable",
      description: "Can enable Server Update Management service.",
    },
    {
      name: "server-update.service.get",
      description: "Can get Server Update Management service details.",
    },
    {
      name: "server-update.update-schedule.create",
      description: "Can create server OS update schedule.",
    },
    {
      name: "server-update.update-schedule.delete",
      description: "Can delete server OS update schedule.",
    },
    {
      name: "server-update.update-schedule.get",
      description: "Can get server OS update schedule.",
    },
    {
      name: "server-update.update-schedule.list",
      description: "Can list server OS update schedules.",
    },
    {
      name: "server-update.update-schedule.update",
      description: "Can update server OS update schedule.",
    },
    {
      name: "server-update.update.create",
      description: "Can trigger server OS update.",
    },
    {
      name: "server-update.update.get",
      description: "Can get server OS update results.",
    },
    {
      name: "server-update.update.list",
      description: "Can list server OS updates.",
    },
    {
      name: "service-enablement.service-state.edit",
      description: "Can enable and disable services.",
    },
    {
      name: "service-enablement.service-state.get",
      description: "Can read service state.",
    },
    {
      name: "ske.cluster.create",
      description: "Can create/update SKE clusters",
    },
    {
      name: "ske.cluster.credential.rotate",
      description: "Can rotate SKE cluster credentials",
    },
    {
      name: "ske.cluster.delete",
      description: "Can delete SKE clusters",
    },
    {
      name: "ske.cluster.get",
      description: "Can get SKE clusters",
    },
    {
      name: "ske.cluster.hibernate",
      description: "Can hibernate SKE clusters",
    },
    {
      name: "ske.cluster.kubeconfig.create",
      description: "Can create admin kubeconfigs for SKE clusters",
    },
    {
      name: "ske.cluster.kubeconfig.idp.create",
      description: "Can create IDP-based kubeconfigs for SKE clusters",
    },
    {
      name: "ske.cluster.list",
      description: "Can list SKE clusters",
    },
    {
      name: "ske.cluster.maintain",
      description: "Can maintain SKE clusters",
    },
    {
      name: "ske.cluster.reconcile",
      description: "Can reconcile SKE clusters",
    },
    {
      name: "ske.cluster.wakeup",
      description: "Can wake up SKE clusters",
    },
    {
      name: "sqlserver-flex.backup.get",
      description: "Can get information about backup(s).",
    },
    {
      name: "sqlserver-flex.backup.list",
      description: "Can list backups of instance(s).",
    },
    {
      name: "sqlserver-flex.backup.trigger",
      description: "Can trigger sqlserver-flex database(s).",
    },
    {
      name: "sqlserver-flex.collation.list",
      description: "Can list sqlserver-flex collations.",
    },
    {
      name: "sqlserver-flex.compatlevel.list",
      description:
        "Returns a list of compatibility levels for creating a new database.",
    },
    {
      name: "sqlserver-flex.database.create",
      description: "Can create database(s) on sqlserver-flex instance.",
    },
    {
      name: "sqlserver-flex.database.delete",
      description: "Can delete database(s) on sqlserver-flex instance.",
    },
    {
      name: "sqlserver-flex.database.get",
      description: "Can get database(s) on sqlserver-flex instance.",
    },
    {
      name: "sqlserver-flex.database.list",
      description: "Can list database(s) on sqlserver-flex instance.",
    },
    {
      name: "sqlserver-flex.database.update",
      description: "Can update database(s) on sqlserver-flex instance.",
    },
    {
      name: "sqlserver-flex.flavor.list",
      description: "Can list sqlserver-flex flavors.",
    },
    {
      name: "sqlserver-flex.instance.create",
      description: "Can create sqlserver-flex instance(s).",
    },
    {
      name: "sqlserver-flex.instance.delete",
      description: "Can delete sqlserver-flex instance(s).",
    },
    {
      name: "sqlserver-flex.instance.get",
      description: "Can get sqlserver-flex instance(s).",
    },
    {
      name: "sqlserver-flex.instance.list",
      description: "Can list sqlserver-flex instance(s).",
    },
    {
      name: "sqlserver-flex.instance.protect",
      description: "Can protect sqlserver-flex instance.",
    },
    {
      name: "sqlserver-flex.instance.update",
      description: "Can update sqlserver-flex instance(s).",
    },
    {
      name: "sqlserver-flex.metric.list",
      description: "Can list sqlserver-flex metric(s).",
    },
    {
      name: "sqlserver-flex.restore.list",
      description: "Can list restore jobs.",
    },
    {
      name: "sqlserver-flex.restore.trigger",
      description: "Can trigger restore of database(s).",
    },
    {
      name: "sqlserver-flex.role.list",
      description: "Can list sqlserver-flex Roles.",
    },
    {
      name: "sqlserver-flex.storage.list",
      description: "Can list sqlserver-flex storage classes.",
    },
    {
      name: "sqlserver-flex.user.create",
      description: "Can create sqlserver-flex user(s).",
    },
    {
      name: "sqlserver-flex.user.delete",
      description: "Can delete sqlserver-flex user(s).",
    },
    {
      name: "sqlserver-flex.user.get",
      description: "Can get sqlserver-flex user(s).",
    },
    {
      name: "sqlserver-flex.user.list",
      description: "Can list sqlserver-flex user(s).",
    },
    {
      name: "sqlserver-flex.user.reset",
      description: "Can reset sqlserver-flex users.",
    },
    {
      name: "sqlserver-flex.version.list",
      description: "Can list sqlserver-flex versions.",
    },
    {
      name: "support.assume-role.read",
      description: "Can read assume role requests.",
    },
    {
      name: "support.assume-role.request",
      description: "Can create assume role requests.",
    },
    {
      name: "support.assume-role.respond",
      description: "Can approve or decline assume role requests.",
    },
    {
      name: "support.help-center.ticket.attachment.create",
      description: "Can create attachments for a Support Ticket.",
    },
    {
      name: "support.help-center.ticket.attachment.get",
      description: "Can download attachments from a Support Ticket.",
    },
    {
      name: "support.help-center.ticket.attachment.list",
      description: "Can list attachments on a Support Ticket.",
    },
    {
      name: "support.help-center.ticket.comment.create",
      description: "Can create comments for a Support Ticket.",
    },
    {
      name: "support.help-center.ticket.create",
      description: "Can create support tickets for a project.",
    },
    {
      name: "support.help-center.ticket.get",
      description: "Can read Support Ticket details.",
    },
    {
      name: "support.help-center.ticket.list",
      description: "Can list Support Tickets.",
    },
    {
      name: "support.help-center.ticket.participant.add",
      description: "Can add participants to a Support Ticket.",
    },
    {
      name: "support.help-center.ticket.participant.remove",
      description:
        "Can revoke access for request participants from a Support Ticket.",
    },
    {
      name: "support.help-center.ticket.validate",
      description: "Can accept or decline a resolved Support Ticket.",
    },
    {
      name: "support.offering.list",
      description:
        "Can get a list of all offered support plans (Essential, Advanced, Ultimate)",
    },
    {
      name: "support.plan.edit",
      description: "Can book or cancel the Advanced Support Plan for a project",
    },
    {
      name: "support.plan.get",
      description:
        "Can view details about a booked support plan (Essential, Advanced, Ultimate)",
    },
    {
      name: "support.plan.list",
      description: "Can list all current plans for a project",
    },
    {
      name: "support.report.get",
      description: "Can read SLA and ticket KPI reports",
    },
    {
      name: "support.ticket-attachment.create",
      description: "Deprecated: Can create attachments for a Support Ticket.",
    },
    {
      name: "support.ticket-attachment.get",
      description:
        "Deprecated: Can download attachments from a Support Ticket.",
    },
    {
      name: "support.ticket-attachment.list",
      description: "Deprecated: Can list attachments on a Support Ticket.",
    },
    {
      name: "support.ticket-comment.create",
      description: "Deprecated: Can create comments for a Support Ticket.",
    },
    {
      name: "support.ticket-participant.add",
      description: "Deprecated: Can add participants to a Support Ticket.",
    },
    {
      name: "support.ticket-participant.remove",
      description:
        "Deprecated: Can revoke access for request participants from a Support Ticket.",
    },
    {
      name: "support.ticket.create",
      description: "Deprecated: Can create support tickets for a project.",
    },
    {
      name: "support.ticket.get",
      description: "Deprecated: Can read Support Ticket details.",
    },
    {
      name: "support.ticket.list",
      description: "Deprecated: Can list Support Tickets.",
    },
    {
      name: "support.ticket.validate",
      description:
        "Deprecated: Can accept or decline a resolved Support Ticket.",
    },
    {
      name: "support.ultimate-booking.edit",
      description: "Can book or cancel the Ultimate Support Plan for a project",
    },
    {
      name: "support.ultimate-booking.request",
      description:
        "Can request the Ultimate Support Plan for an organization and its projects",
    },
    {
      name: "telemetry-link.instance.delete",
      description: "Can delete a telemetry-link.",
    },
    {
      name: "telemetry-link.instance.get",
      description: "Can read a telemetry-link.",
    },
    {
      name: "telemetry-link.instance.update",
      description: "Can create and update a telemetry-link.",
    },
    {
      name: "telemetry-router.access-token.create",
      description: "Can create a telemetry-router access-token.",
    },
    {
      name: "telemetry-router.access-token.delete",
      description: "Can delete a telemetry-router access-token.",
    },
    {
      name: "telemetry-router.access-token.get",
      description: "Can read a telemetry-router access-token.",
    },
    {
      name: "telemetry-router.access-token.list",
      description: "Can list telemetry-router access-token.",
    },
    {
      name: "telemetry-router.access-token.update",
      description: "Can update a telemetry-router access-token.",
    },
    {
      name: "telemetry-router.destination.create",
      description: "Can create a telemetry-router destination.",
    },
    {
      name: "telemetry-router.destination.delete",
      description: "Can delete a telemetry-router destination.",
    },
    {
      name: "telemetry-router.destination.get",
      description: "Can read a telemetry-router destination.",
    },
    {
      name: "telemetry-router.destination.list",
      description: "Can list telemetry-router destination.",
    },
    {
      name: "telemetry-router.destination.update",
      description: "Can update a telemetry-router destination.",
    },
    {
      name: "telemetry-router.instance.create",
      description: "Can create a telemetry-router.",
    },
    {
      name: "telemetry-router.instance.delete",
      description: "Can delete a telemetry-router.",
    },
    {
      name: "telemetry-router.instance.get",
      description: "Can read a telemetry-router.",
    },
    {
      name: "telemetry-router.instance.list",
      description: "Can list telemetry-router.",
    },
    {
      name: "telemetry-router.instance.update",
      description: "Can update a telemetry-router.",
    },
    {
      name: "ufw.configuration.delete",
      description: "Delete a configuration.",
    },
    {
      name: "ufw.configuration.update",
      description: "Update a configuration.",
    },
    {
      name: "ufw.instance.create",
      description: "Create a new security rule.",
    },
    {
      name: "ufw.instance.delete",
      description: "Delete a security rule.",
    },
    {
      name: "ufw.instance.get",
      description: "Get a specific security rule of Unified Firewall.",
    },
    {
      name: "ufw.instance.list",
      description: "List all security rules of Unified Firewall.",
    },
    {
      name: "ufw.instance.update",
      description: "Update a security rule.",
    },
    {
      name: "ufw.provider-options.list",
      description: "List all provider options of Unified Firewall.",
    },
    {
      name: "ufw.services.list",
      description: "List all services of Unified Firewall.",
    },
    {
      name: "vpc.create",
      description: "Can create a VPC.",
    },
    {
      name: "vpc.delete",
      description: "Can delete a VPC.",
    },
    {
      name: "vpc.get",
      description: "Can read a VPC.",
    },
    {
      name: "vpc.list",
      description: "Can list VPCs.",
    },
    {
      name: "vpc.network-range.create",
      description: "Can create a VPC network range.",
    },
    {
      name: "vpc.network-range.delete",
      description: "Can delete a VPC network range.",
    },
    {
      name: "vpc.network-range.get",
      description: "Can read a VPC network range.",
    },
    {
      name: "vpc.network-range.list",
      description: "Can list VPC network ranges.",
    },
    {
      name: "vpc.network-range.role-binding.add",
      description: "Can add role bindings on a VPC network range.",
    },
    {
      name: "vpc.network-range.role-binding.get",
      description: "Can get role bindings of a VPC network range.",
    },
    {
      name: "vpc.network-range.role-binding.remove",
      description: "Can remove role bindings from a VPC network range.",
    },
    {
      name: "vpc.network-range.update",
      description: "Can update a VPC network range.",
    },
    {
      name: "vpc.region.create",
      description: "Can create a VPC Region.",
    },
    {
      name: "vpc.region.delete",
      description: "Can delete a VPC Region.",
    },
    {
      name: "vpc.region.get",
      description: "Can read a VPC Region.",
    },
    {
      name: "vpc.region.list",
      description: "Can list VPC Regions.",
    },
    {
      name: "vpc.region.update",
      description: "Can update a VPC Region.",
    },
    {
      name: "vpc.role-binding.add",
      description: "Can add role bindings on a VPC.",
    },
    {
      name: "vpc.role-binding.get",
      description: "Can get role bindings of a VPC.",
    },
    {
      name: "vpc.role-binding.remove",
      description: "Can remove role bindings from a VPC.",
    },
    {
      name: "vpc.routing-table.create",
      description: "Can create a VPC routing table.",
    },
    {
      name: "vpc.routing-table.delete",
      description: "Can delete a VPC routing table.",
    },
    {
      name: "vpc.routing-table.get",
      description: "Can read a VPC routing table.",
    },
    {
      name: "vpc.routing-table.list",
      description: "Can list VPC routing tables.",
    },
    {
      name: "vpc.routing-table.role-binding.add",
      description: "Can add role bindings on a VPC routing table.",
    },
    {
      name: "vpc.routing-table.role-binding.get",
      description: "Can get role bindings of a VPC routing table.",
    },
    {
      name: "vpc.routing-table.role-binding.remove",
      description: "Can remove role bindings from a VPC routing table.",
    },
    {
      name: "vpc.routing-table.route.list",
      description: "Can list all routes in a VPC routing table.",
    },
    {
      name: "vpc.routing-table.static-route.create",
      description: "Can create a static route in a VPC routing table.",
    },
    {
      name: "vpc.routing-table.static-route.delete",
      description: "Can delete a static route in a VPC routing table.",
    },
    {
      name: "vpc.routing-table.static-route.get",
      description: "Can read a static route in a VPC routing table.",
    },
    {
      name: "vpc.routing-table.static-route.list",
      description: "Can list static routes in a VPC routing table.",
    },
    {
      name: "vpc.routing-table.static-route.update",
      description: "Can update a static route in a VPC routing table.",
    },
    {
      name: "vpc.routing-table.update",
      description: "Can update a VPC routing table.",
    },
    {
      name: "vpc.update",
      description: "Can update a VPC.",
    },
    {
      name: "vpn.bgpfilter.add",
      description: "Can create a bgpfilter for a VPN gateway in a project.",
    },
    {
      name: "vpn.bgpfilter.get",
      description: "Can retrieve a bgpfilter from a VPN gateway in a project.",
    },
    {
      name: "vpn.bgpfilter.list",
      description: "Can list bgpfilters of a VPN gateway in a project.",
    },
    {
      name: "vpn.bgpfilter.remove",
      description: "Can delete a bgpfilter from a VPN gateway in a project.",
    },
    {
      name: "vpn.bgpfilter.update",
      description: "Can update a bgpfilter in a VPN gateway in a project.",
    },
    {
      name: "vpn.connection.add",
      description: "Can create a connection for a VPN gateway in a project.",
    },
    {
      name: "vpn.connection.get",
      description: "Can retrieve a connection from a VPN gateway in a project.",
    },
    {
      name: "vpn.connection.list",
      description: "Can list connections of a VPN gateway in a project.",
    },
    {
      name: "vpn.connection.remove",
      description: "Can delete a connection from a VPN gateway in a project.",
    },
    {
      name: "vpn.connection.status.get",
      description:
        "Can retrieve the status of a VPN gateway connection in a project.",
    },
    {
      name: "vpn.connection.update",
      description: "Can update a connection in a VPN gateway in a project.",
    },
    {
      name: "vpn.gateway.create",
      description: "Can create a VPN gateway in a project.",
    },
    {
      name: "vpn.gateway.delete",
      description: "Can delete a given VPN gateway in a project.",
    },
    {
      name: "vpn.gateway.get",
      description: "Can get details of a VPN gateway in a project.",
    },
    {
      name: "vpn.gateway.list",
      description: "Can list VPN gateway in a project.",
    },
    {
      name: "vpn.gateway.status.get",
      description: "Can get status of VPN gateways in a project.",
    },
    {
      name: "vpn.gateway.update",
      description: "Can update details on a VPN gateway in a project.",
    },
    {
      name: "vpn.quota.get",
      description: "Can list project quotas.",
    },
    {
      name: "workflows.dag-bundles.create",
      description: "Can create a DAG bundle for a STACKIT Workflows instance.",
    },
    {
      name: "workflows.dag-bundles.delete",
      description: "Can delete a DAG bundle of a STACKIT Workflows instance.",
    },
    {
      name: "workflows.dag-bundles.get",
      description: "Can read a DAG bundle of a STACKIT Workflows instance.",
    },
    {
      name: "workflows.dag-bundles.list",
      description: "Can list the DAG bundles of a STACKIT Workflows instance.",
    },
    {
      name: "workflows.dag-bundles.update",
      description: "Can update a DAG bundle of a STACKIT Workflows instance.",
    },
    {
      name: "workflows.dags-repository.update",
      description:
        "Can update the DAGs repository configuration for STACKIT Workflows",
    },
    {
      name: "workflows.identity-provider.update",
      description:
        "Can update the identity provider configuration for STACKIT Workflows",
    },
    {
      name: "workflows.instance.create",
      description: "Can create an STACKIT Workflows instance.",
    },
    {
      name: "workflows.instance.delete",
      description: "Can delete an STACKIT Workflows instance.",
    },
    {
      name: "workflows.instance.get",
      description: "Can read an STACKIT Workflows instance information.",
    },
    {
      name: "workflows.instance.list",
      description: "Can list STACKIT Workflows instances.",
    },
    {
      name: "workflows.instance.update",
      description: "Can update an STACKIT Workflows instance.",
    },
    {
      name: "workflows.observability.update",
      description:
        "Can update the Observability configuration for STACKIT Workflows",
    },
  ],
};
