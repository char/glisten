# Infrastructure example
terraform {
  required_version = ">= 1.5"
}
variable "environment" { default = "stage" }
resource "example_server" "web" {
  name    = "web-${var.environment}"
  enabled = true
  size    = 2.5e2
  tags = {
    env   = var.environment
    owner = upper("team")
  }
  ports = [for p in var.ports : p + 1 if p > 0]
  by_name = {for k, v in var.nodes : k => v.id if v.enabled}
  first = var.nodes[0].id
  ids   = var.nodes[*].id
  old   = var.nodes.*.id
  value = var.enabled ? 1 : null
}
