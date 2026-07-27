##########################
## CATEGORY AND ALIASES ##
##########################

resource "opnsense_firewall_category" "this" {
  name = var.category_name
}

resource "opnsense_firewall_alias" "this" {
  for_each = var.aliases

  name        = each.key
  type        = each.value.type
  enabled     = each.value.enabled
  description = each.value.description != null ? each.value.description : each.key
  content     = each.value.content
  stats       = each.value.stats
  categories  = [opnsense_firewall_category.this.id]

  # Only read for urltable aliases, where OPNsense requires it. null keeps the provider default.
  update_freq = each.value.update_freq
}
