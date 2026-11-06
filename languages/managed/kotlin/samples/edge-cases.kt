/* Outer /* nested */ still a comment */
fun <reified T : Any> List<T>.findValue(predicate: (T) -> Boolean): T? =
    firstOrNull { item -> predicate(item) }

class Example {
    var score: Int = 0
        get() = field
        set(value) { field = value }
    val lazyValue by lazy { 42 }
}

fun labels() {
    val data = "keyword as identifier"
    loop@ for (item in listOf("雪")) {
        if (item == data) break@loop
        listOf(item).forEach { return@forEach }
    }
    val `when` = "escaped identifier"
    val broken = "unfinished
    println("recovered")
}
