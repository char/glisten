@file:Suppress("unused")
package orchard.model

/** A box with an immutable value. */
@JvmInline
value class ItemId(val raw: ULong)

sealed interface Result<out T> {
    data class Ok<T>(val value: T) : Result<T>
    data class Error(val message: String) : Result<Nothing>
}

class Store(private val name: String) {
    companion object { const val DEFAULT = "main" }
    init { println("created $name") }
    fun String.describe(count: Int = 1): String = "$this: ${uppercase()} ($count)"
    override fun toString(): String = name
}
