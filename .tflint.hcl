plugin "terraform" {
  enabled = true
  preset  = "recommended"
}

config {
  call_module_type = "all"
}

rule "terraform_required_providers" {
  enabled = true
}

rule "terraform_required_version" {
  enabled = true
}

rule "terraform_unused_declarations" {
  enabled = true
}