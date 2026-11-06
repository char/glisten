object Strings {
  val plain = "hello\nworld \u263A"
  val triple = """no \n escape
  or $interpolation"""
  val name = "Scala"
  val greeting = s"Hello $name, ${name.toUpperCase}! $$5"
  val formatted = f"${3.14159}%.2f"
  val literal = raw"\n is literal, but $name still interpolates"
  val custom = sql"select * from $table where id = ${id + 1}"
  val multi = s"""before ${Map("key" -> { val n = 1; n + 1 })}
after $$"""
  val chars = List('x', '\n', '\u263A')
  val symbol = 'legacySymbol
  val numbers = List(0xffL, 0b1010, 1_000, 3.25e-2f, 42d)
}
