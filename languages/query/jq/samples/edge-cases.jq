# Unicode and escaped quotes: 雪 🦀
# This comment continues onto the next line \
still a comment, not a jq filter
# An escaped backslash does not continue: \\
.identity |
{a, b: 1, (.k): $x, $x, "\(if .ok then "yes" else "no" end)": .[0]?}
| "nested: \(map("inner \(.name)")) end"
| ."a-b" ?// .fallback | .items[1:3] |= map(. + 1)
| "unterminated \(try .missing catch {message: "oops"})
