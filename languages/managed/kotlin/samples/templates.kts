#!/usr/bin/env kotlin
val who = "world"
val message = "Hello, $who: ${if (who.isNotEmpty()) "yes" else "no"}!"
val raw = """
    raw \n, ${listOf(1, 2).joinToString { n -> "[$n]" }}
    literal ${'$'}HOME
""".trimIndent()
val chars = listOf('\n', '\u03bb', '\'')
val values = listOf(0xFFu, 0b1010_0011UL, 1_000L, 2.5e-3f)
val answer = values.firstOrNull()?.toString() ?: "none"
println(answer!!)
