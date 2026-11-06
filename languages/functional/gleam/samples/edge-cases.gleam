//// Lexer boundaries, not a complete application.

/// Escapes, bit arrays, float operators, spreads, and discards.
pub fn edges(_unused: Int) {
  let hex = 0xFF_A0
  let octal = 0o77
  let binary = 0b1010_0001
  let decimal = 1.25e-3 +. 2.0 *. 3.0
  let _within_range = decimal <=. 2.0
  let bits = <<hex:size(8)-unit(1), binary:8>>
  let text = "quote: \" slash: \\ snowman: \u{2603} newline: \n"
  let list = [octal, ..[binary]]
  // This is not a string: " or a comment opener.
  case list {
    [first, ..rest] if first <= 10 -> #(text <> "!", bits, rest)
    _ -> panic as "no values"
  }
}
