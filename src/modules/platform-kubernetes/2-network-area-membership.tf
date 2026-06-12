resource "time_sleep" "wait_for_network_area_membership" {
  count = var.network.mode == "sna" ? 1 : 0

  # Allow backend propagation after project label updates before SKE SNA validation.
  create_duration = "30s"

  depends_on = [stackit_resourcemanager_project.this]
}
