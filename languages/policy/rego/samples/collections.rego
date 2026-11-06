package example.inventory

import rego.v1
import future.keywords.in

names := {user.name | some user in input.users}
by_id := {user.id: user.name | some user in input.users}
qualified(x) := y if {
    y := startswith(x, "team-")
}
response := http.send({"method": "get", "url": input.url})
timestamp := time.now_ns()
