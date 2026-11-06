/* outer /* nested */ still outer */
opaque type UserId = Long
object UserId:
  def apply(value: Long): UserId = value
  extension (id: UserId) def value: Long = id
end UserId

open class Box[A <: Product : Ordering](val value: A):
  infix def ++(other: Box[A]): Box[A] = this
  inline def `given`(x: A): A = x
  def contexts(using ordering: Ordering[A]): A = value

transparent inline def identity[A](a: A): A = a
export UserId.apply
val extract = (x: Int) => x + 1
val program: Context ?=> String = summon[Context].toString
val existing = Map("a" -> 1).get("a")
// Scala 2 XML literals are intentionally not parsed as XML:
val xml = <entry id="x">hello</entry>
