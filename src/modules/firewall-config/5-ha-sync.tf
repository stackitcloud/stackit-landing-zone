#############
## HA SYNC ##
#############

# Replicates this policy to the HA peer after every change. OPNsense's XMLRPC config
# sync only fires on GUI saves; configuration written through the REST API is never
# pushed on its own, so without this step the backup node runs with an empty ruleset
# and black-holes traffic the moment it becomes CARP master (measured 2026-08-02:
# 86 s outage instead of ~1 s). The peer's own CARP VIP is excluded from the sync via
# its nosync flag, set by connectivity/scripts/configure-ha.sh.
resource "terraform_data" "ha_sync" {
  count = var.ha_sync ? 1 : 0

  triggers_replace = [
    var.aliases,
    var.rules,
    var.outbound_nat,
    var.port_forwards,
    var.routes,
  ]

  provisioner "local-exec" {
    command     = "bash '${path.module}/scripts/sync-ha-peer.sh' '${var.endpoint}'"
    interpreter = ["/usr/bin/env", "bash", "-c"]

    environment = {
      OPNSENSE_USERNAME = var.admin_username
      OPNSENSE_PASSWORD = var.admin_password
    }
  }

  depends_on = [
    opnsense_firewall_category.this,
    opnsense_firewall_alias.this,
    opnsense_firewall_filter.this,
    opnsense_firewall_nat.this,
    opnsense_firewall_nat_port_forward.this,
    opnsense_route.this,
  ]
}
