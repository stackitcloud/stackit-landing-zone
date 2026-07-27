#########
## NAT ##
#########

resource "opnsense_firewall_nat" "this" {
  for_each = var.outbound_nat

  enabled     = each.value.enabled
  sequence    = each.value.sequence
  interface   = each.value.interface
  protocol    = each.value.protocol
  ip_protocol = each.value.ip_protocol
  disable_nat = each.value.disable_nat
  log         = each.value.log
  # OPNsense only accepts alphanumerics, spaces and dots in a NAT description, while
  # the map keys are kebab-case, so fall back to a sanitised form of the key.
  description = each.value.description != null ? each.value.description : replace(each.key, "/[^a-zA-Z0-9. ]/", " ")

  source = {
    net = each.value.source_net
  }

  destination = {
    net = each.value.destination_net
  }

  target = {
    ip = each.value.target_ip
  }

  depends_on = [opnsense_firewall_alias.this]
}

###################
## PORT FORWARDS ##
###################

resource "opnsense_firewall_nat_port_forward" "this" {
  for_each = var.port_forwards

  enabled        = each.value.enabled
  sequence       = each.value.sequence
  interface      = toset(each.value.interfaces)
  protocol       = each.value.protocol
  ip_protocol    = each.value.ip_protocol
  log            = each.value.log
  nat_reflection = each.value.nat_reflection
  description    = each.value.description != null ? each.value.description : each.key

  source = {
    net = each.value.source_net
  }

  destination = {
    net  = each.value.destination_net
    port = each.value.destination_port
  }

  target = {
    ip   = each.value.target_ip
    port = each.value.target_port != null ? each.value.target_port : each.value.destination_port
  }

  depends_on = [opnsense_firewall_alias.this]
}
