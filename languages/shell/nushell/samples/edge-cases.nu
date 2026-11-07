# Delimiters, literals and operators
let raw = r##'a '# b'##
let nested = $"value: (($in | str trim))"
let x = [1..10 1..<5 5sec 1day null true false]
let record = {a: 1, 'quoted key': 'literal', "double key": `path name`}
let dates = [2024-01-01 2024-01-01T10:00:00+02:00 1 - 2]
let joined = ('a' | path join 'b' | str replace a b | into string)
def typed [x: int, --flag(-f): string, xs: list<int>] -> list<int> { $xs }
extern "bw login" [email?: string, ...args: list<string>]
where name =~ 'foo' and size not-in [1 2]
print "escaped \"quote\"\n" # trailing comment
