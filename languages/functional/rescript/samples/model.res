/* Colors /* including nested comments */ for the view. */
type color =
  | Red
  | Rgb(int, int, int)

type person = {name: string, favorite: color, mood: [#happy | #calm]}

module Labels = {
  let describe = (person: person) =>
    switch person.favorite {
    | Red => "red"
    | Rgb(r, g, b) => `rgb(${Int.toString(r)}, ${Int.toString(g)}, ${Int.toString(b)})`
    }
}

let show = (~name, ~mood=?) => (name, mood)
