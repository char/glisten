(** Public interface. *)
type 'a tree = Leaf | Node of 'a * 'a tree list
val map : f:('a -> 'b) -> 'a tree -> 'b tree
module Make : functor (M : sig type t val compare : t -> t -> int end) -> sig
  val compare_tree : M.t -> M.t -> int
end
val example : int option
