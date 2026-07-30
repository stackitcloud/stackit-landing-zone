#########
## VPN ##
#########

resource "stackit_vpn_gateway" "this" {
  count = var.vpn != null ? 1 : 0

  project_id   = stackit_resourcemanager_project.this.project_id
  display_name = var.vpn.display_name != null ? var.vpn.display_name : "${var.naming_pattern}-vpn"
  plan_id      = var.vpn.plan_id
  routing_type = var.vpn.routing_type
  labels       = length(var.labels) > 0 ? var.labels : null # provider bug: empty map becomes null after apply

  availability_zones = {
    tunnel1 = var.vpn.availability_zones.tunnel1
    tunnel2 = var.vpn.availability_zones.tunnel2
  }
}

# The gateway public IPs are only exposed through the status endpoint, not on the gateway
# resource itself. They are required to configure the remote peer, so surface them as outputs.
data "stackit_vpn_gateway_status" "this" {
  count = var.vpn != null ? 1 : 0

  project_id = stackit_resourcemanager_project.this.project_id
  gateway_id = stackit_vpn_gateway.this[0].gateway_id
}

#################
## CONNECTIONS ##
#################

resource "stackit_vpn_connection" "this" {
  for_each = var.vpn != null ? var.vpn.connections : {}

  project_id   = stackit_resourcemanager_project.this.project_id
  gateway_id   = stackit_vpn_gateway.this[0].gateway_id
  display_name = each.value.display_name != null ? each.value.display_name : each.key
  enabled      = each.value.enabled
  labels       = length(var.labels) > 0 ? var.labels : null # provider bug: empty map becomes null after apply

  local_subnets  = each.value.local_subnets
  remote_subnets = each.value.remote_subnets
  static_routes  = each.value.static_routes

  tunnel1 = {
    remote_address = each.value.tunnel1.remote_address
    pre_shared_key = var.vpn_pre_shared_keys[each.key].tunnel1
    peering        = each.value.tunnel1.peering

    phase1 = {
      encryption_algorithms = each.value.tunnel1.phase1.encryption_algorithms
      integrity_algorithms  = each.value.tunnel1.phase1.integrity_algorithms
      dh_groups             = each.value.tunnel1.phase1.dh_groups
      rekey_time            = each.value.tunnel1.phase1.rekey_time
    }

    phase2 = {
      encryption_algorithms = each.value.tunnel1.phase2.encryption_algorithms
      integrity_algorithms  = each.value.tunnel1.phase2.integrity_algorithms
      dh_groups             = each.value.tunnel1.phase2.dh_groups
      rekey_time            = each.value.tunnel1.phase2.rekey_time
      dpd_action            = each.value.tunnel1.phase2.dpd_action
      start_action          = each.value.tunnel1.phase2.start_action
    }
  }

  tunnel2 = {
    remote_address = each.value.tunnel2.remote_address
    pre_shared_key = var.vpn_pre_shared_keys[each.key].tunnel2
    peering        = each.value.tunnel2.peering

    phase1 = {
      encryption_algorithms = each.value.tunnel2.phase1.encryption_algorithms
      integrity_algorithms  = each.value.tunnel2.phase1.integrity_algorithms
      dh_groups             = each.value.tunnel2.phase1.dh_groups
      rekey_time            = each.value.tunnel2.phase1.rekey_time
    }

    phase2 = {
      encryption_algorithms = each.value.tunnel2.phase2.encryption_algorithms
      integrity_algorithms  = each.value.tunnel2.phase2.integrity_algorithms
      dh_groups             = each.value.tunnel2.phase2.dh_groups
      rekey_time            = each.value.tunnel2.phase2.rekey_time
      dpd_action            = each.value.tunnel2.phase2.dpd_action
      start_action          = each.value.tunnel2.phase2.start_action
    }
  }
}
