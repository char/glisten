package demo

import scala.annotation.tailrec

/** A small Scala 3 service. */
trait Show[A]:
  def show(value: A): String

given intShow: Show[Int] with
  def show(value: Int): String = s"number: $value"

extension (value: Int)
  def twice: Int = value * 2

enum Result[+A] derives CanEqual:
  case Ok(value: A)
  case Failed(message: String)

object Main:
  @tailrec
  def sum(n: Int, acc: Int = 0): Int =
    if n <= 0 then acc else sum(n - 1, acc + n)
  def render[A](value: A)(using show: Show[A]): String =
    show.show(value)
end Main
