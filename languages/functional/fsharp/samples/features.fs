module Features

[<Measure>] type m
[<Measure>] type s
let speed (distance: float<m>) (duration: float<s>) : float<m/s> = distance / duration

type Box<'a>(value: 'a) =
    member _.Value = value
    member _.Map(f: 'a -> 'b) = Box(f value)

let inline zero< ^T when ^T : (static member Zero : ^T)> =
    ((^T) : (static member Zero : ^T) ())

let workflow input = async {
    let! value = input
    do! Async.Sleep 1
    return! async { return value + 1 }
}
let values = seq { yield! [1; 2]; yield 3 }
let transform = List.map ((+) 1) >> List.rev
let result = [1; 2] |> transform
