variable "enabled" {
  type        = bool
  description = "Whether debug bastion resources should be created."
}

variable "sna_enabled" {
  type        = bool
  description = "Whether SNA networking is enabled for the cluster."
}

variable "project_id" {
  type        = string
  description = "STACKIT project ID where bastion resources are created."
}

variable "network_id" {
  type        = string
  description = "SNA network ID for the bastion network interface."
}

variable "name" {
  type        = string
  description = "Bastion server name."
}

variable "short_prefix" {
  type        = string
  description = "Short naming prefix for key/security-group resources."
}

variable "availability_zone" {
  type        = string
  description = "Availability zone for the bastion server."
  default     = null
}

variable "machine_type" {
  type        = string
  description = "Machine type for the bastion server."
}

variable "image_id" {
  type        = string
  description = "Image ID for the bastion boot volume."
}

variable "boot_volume_size" {
  type        = number
  description = "Boot volume size in GB."
}

variable "ssh_public_key" {
  type        = string
  description = "Optional inline SSH public key."
  default     = null
}

variable "ssh_public_key_path" {
  type        = string
  description = "Path to SSH public key file when inline key is not provided."
}

variable "ssh_allowed_cidrs" {
  type        = list(string)
  description = "CIDRs allowed for SSH ingress."
}

variable "assign_public_ip" {
  type        = bool
  description = "Whether to assign a public IP to bastion network interface."
}

variable "install_kubectl" {
  type        = bool
  description = "Whether to install kubectl via cloud-init."
}
