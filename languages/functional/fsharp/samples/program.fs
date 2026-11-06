namespace Example
open System

/// Classifies a number and prints a description.
[<RequireQualifiedAccess>]
module Numbers =
    let (|Even|Odd|) value =
        if value % 2 = 0 then Even else Odd

    let rec describe value =
        match value with
        | Even -> $"{value} is even"
        | Odd when value > 1 -> $"{value} is odd"
        | _ -> "small"

    let report values =
        values |> List.map describe |> String.concat ", "
