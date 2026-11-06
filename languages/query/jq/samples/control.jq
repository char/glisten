module {"name": "analytics"};
import "helpers" as h;
include "extras";

def collect(stream):
  reduce stream as {$key, value: $v} ({}; .[$key] += $v);

def running:
  foreach .[] as [$key, $value] ({}; .[$key] = $value; {key: $key, state: .});

label $out | try (
  .. | objects | .payload? // break $out
) catch {error: ., location: $__loc__}
| @base64 "payload=\(.payload | tostring)"
| h::transform
