package example.edges

import rego.v1

selected contains name if { name := input.users[_].name }
message := $"User {input.user.name}: {sprintf("%v", [{"key": [1, 2]}])}"
literal := $"escaped \{brace} and newline \n"
raw := `raw # no comment
"still raw"`
raw_template := $`raw \{brace} {{"key": input.x}}`
decision if {
    every item in input.items {
        item != null
        count(item.tags) >= 1
    }
    some x in {1, 2, 3} & {2, 3}
    x <= 3
} else := false
