locals {
  greeting = "Hello ${upper(var.name)}! $${literal} %%{literal}"
  text = <<-EOT
    %{~ if length(var.values) > 0 ~}
    Name: ${var.name}
    %{ else }
    disabled
    %{ endif }
    %{ for key, value in var.values }
    ${key}=${value}
    %{ endfor }
    EOT
  raw = <<END
backslash is literal: \n
ENDsuffix is not a terminator
$${not_an_interpolation}
END
  nested = <<OUTER
${join("", [<<INNER
inner ${var.name}
INNER
])}
OUTER
  after = "ok"
}
