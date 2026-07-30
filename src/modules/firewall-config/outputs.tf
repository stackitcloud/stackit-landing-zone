locals {
  # OPNsense evaluates floating rules first (priority group 200000), then interface group
  # rules (300000), then single interface rules (400000), and within a group by ascending
  # sequence. Encoding group and sequence into one sortable string reproduces that order,
  # so the key is what decides which rule a packet hits first.
  rule_evaluation_order = [
    for sort_key in sort([
      for k, r in var.rules : format(
        "%d|%06d|%s",
        length(r.interfaces) == 0 ? 2 : (length(r.interfaces) > 1 ? 3 : 4),
        r.sequence,
        k
      )
    ]) : split("|", sort_key)[2]
  ]
}

output "category" {
  description = "Name and UUID of the category every object created by this module is tagged with. Filtering on the name in the OPNsense GUI shows exactly what OpenTofu manages and nothing else."
  value = {
    name = opnsense_firewall_category.this.name
    id   = opnsense_firewall_category.this.id
  }
}

output "managed_objects" {
  description = "Names of the objects this module holds on the appliance, by kind. Read from the resources rather than the inputs, so it reflects what was actually pushed."
  value = {
    aliases       = sort(keys(opnsense_firewall_alias.this))
    routes        = sort(keys(opnsense_route.this))
    rules         = sort(keys(opnsense_firewall_filter.this))
    outbound_nat  = sort(keys(opnsense_firewall_nat.this))
    port_forwards = sort(keys(opnsense_firewall_nat_port_forward.this))
  }
}

output "rule_evaluation_order" {
  description = "Filter rules in the order the appliance evaluates them. Every rule defaults to quick, so the first match decides and this is the list to read when a rule does not behave as expected. Derived from the inputs, so it is reviewable in a plan before anything is pushed."
  value = [
    for k in local.rule_evaluation_order : {
      rule      = k
      scope     = length(var.rules[k].interfaces) == 0 ? "floating" : join(",", var.rules[k].interfaces)
      sequence  = var.rules[k].sequence
      enabled   = var.rules[k].enabled
      action    = var.rules[k].action
      protocol  = var.rules[k].protocol
      source    = var.rules[k].source_net
      target    = var.rules[k].destination_net
      dest_port = var.rules[k].destination_port != null ? var.rules[k].destination_port : "any"
    }
  ]
}
