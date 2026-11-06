## Procedures, pragmas, operators and style-insensitive names.
import std/strutils

type
  Widget* = object
    count*: int

pr_oc add_value*(x, y: int): int {.inline, raises: [].} =
  x + y

func twice*(x: int): int = x * 2
proc `plus`*(x, y: int): int = x + y

when defined(debug):
  let PrOc = "first letter differs"
  echo PrOc
else:
  discard

let item = Widget(count: 3)
let resultValue = addValue(item.count, 2).twice()
let `strange-name` = resultValue
let values = @[1, 2, 3]
for value in values:
  if value notin [0, 1]:
    echo value
