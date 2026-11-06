//// A tiny orchard inventory.

import gleam/list
import gleam/string as text

/// A fruit and its quantity.
pub type Fruit {
  Fruit(name: String, count: Int)
}

pub const initial_count = 1

pub fn example() -> Fruit {
  Fruit(name: "Pear", count: initial_count)
}

pub fn total(fruits: List(Fruit)) -> Int {
  fruits
  |> list.fold(0, fn(sum, fruit) { sum + fruit.count })
}

pub fn describe(fruit: Fruit) -> String {
  case fruit {
    Fruit(name:, count:) if count > 0 -> text.uppercase(name)
    _ -> "empty"
  }
}
