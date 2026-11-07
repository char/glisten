export def --env greet [name: string, --loud(-l): bool] -> string {
  let greeting = $"Hello, ($name)!"
  if $loud { $greeting | str upcase } else { $greeting }
}
@example "Greet someone" { greet Nushell }
@search-terms "hello"
@category "strings"
@deprecated
def example [x: int]: [nothing -> string, list -> list<string>] {
  $x | into string
}
def render []: string -> string { $in }
let items = [[name size]; [one 5kb] [two 1mb]]
for item in $items { print $item.name }
