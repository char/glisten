(** A small tree with polymorphic values. *)
type 'a tree = Leaf | Node of 'a * 'a tree list

let rec map ~f = function
  | Leaf -> Leaf
  | Node (value, children) ->
      Node (f value, List.map (map ~f) children)

module Make (M : sig type t val compare : t -> t -> int end) = struct
  let compare_tree a b = M.compare a b
end

let ( let* ) value f = Option.bind value f
let example =
  let* x = Some 42 in
  Some (x + 1)
