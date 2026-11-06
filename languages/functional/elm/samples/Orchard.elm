module Orchard exposing (Fruit, count, example)

import List exposing (map)
import String as Text


{-| A simple record with named fields.
-}
type alias Fruit =
    { name : String
    , quantity : Int
    }


type Status
    = Ready
    | Empty


count : List Fruit -> Int
count fruits =
    fruits
        |> List.map .quantity
        |> List.sum


example : Fruit -> Fruit
example fruit =
    { fruit | name = Text.toUpper fruit.name, quantity = fruit.quantity + 1 }
