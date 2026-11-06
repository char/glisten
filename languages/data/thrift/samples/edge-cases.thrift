// Keywords are case-sensitive and qualified identifiers are single tokens.
namespace java struct.example
struct /* comment */ Record {
  1: optional string text = "quote: \" slash: \\ newline: \n"
  2: binary bytes = '\'single\''
  3: i64 mask = +0xFF
  4: double fraction = .5
  5: double exponent = 2e-3
  6: bool flag = false # trailing comment
  /* block
     comment */
}
senum Choice { "red", "blue" }
