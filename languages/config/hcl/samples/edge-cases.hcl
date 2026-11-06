// Expressions and escapes
foo-bar = [1, -2.5, 1e-3, 9E+2, true, false, null]
text = "escapes: \n \t \" \\ \u0041 \U0001F600"
values = [for v in var.items : { key = v.id, nested = "${join(",", v.tags)}" } if v.ok]
value = (var.a != 0 && var.b <= 4) ? "yes" : "no" # end
/* multiline
   comment */
word = var.for
exists = provider::local::direxists("path")
block "label" bare {
  path = var.hosts[0].name
}
