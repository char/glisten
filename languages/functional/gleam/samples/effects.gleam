import gleam/option.{type Option, unwrap}
import gleam/result

pub fn value_or_zero(value: Option(Int)) -> Int {
  unwrap(value, 0)
}

@external(erlang, "erlang", "monotonic_time")
pub fn clock() -> Int

@deprecated("Use clock instead")
pub fn old_clock() -> Int {
  clock()
}

@target(erlang)
pub fn checked(value: Int) -> Result(Int, String) {
  let assert True = value >= 0
  use number <- result.try(Ok(value))
  case number {
    0 -> Error("zero")
    _ -> Ok(number)
  }
}
