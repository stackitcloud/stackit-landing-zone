###########
## RULES ##
###########

resource "opnsense_firewall_filter" "this" {
  for_each = var.rules

  enabled     = each.value.enabled
  sequence    = each.value.sequence
  description = each.value.description != null ? each.value.description : each.key
  categories  = [opnsense_firewall_category.this.id]

  interface = {
    interface = each.value.interfaces
  }

  filter = {
    action      = each.value.action
    direction   = each.value.direction
    protocol    = each.value.protocol
    ip_protocol = each.value.ip_protocol
    quick       = each.value.quick
    log         = each.value.log

    source = {
      net    = each.value.source_net
      port   = each.value.source_port != null ? each.value.source_port : ""
      invert = each.value.source_invert
    }

    destination = {
      net    = each.value.destination_net
      port   = each.value.destination_port != null ? each.value.destination_port : ""
      invert = each.value.destination_invert
    }
  }

  depends_on = [opnsense_firewall_alias.this]
}
