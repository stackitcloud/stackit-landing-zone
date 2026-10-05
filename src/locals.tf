locals {
  resource_labels = merge(var.labels, {
    landing_zone_accelerator = "true"
  })
}