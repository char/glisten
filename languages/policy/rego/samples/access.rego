package example.authz

import rego.v1
import data.example.roles as roles

default allow := false

allow if {
    some user in input.users
    user.name == input.subject
    roles[user.role].active
}

deny contains message if {
    not allow
    message := sprintf("access denied: %s", [input.subject])
}
