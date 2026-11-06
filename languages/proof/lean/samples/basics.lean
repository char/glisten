import Lean

namespace Demo

/-- An identity function on any type. -/
def identity (α : Type) (x : α) : α := x

@[simp] theorem identity_eq (α : Type) (x : α) : identity α x = x := by
  rfl

def swap (α β : Type) (p : α × β) : β × α :=
  ⟨p.2, p.1⟩

inductive Tree (α : Type) where
  | leaf : α → Tree α
  | node : Tree α → Tree α → Tree α
  deriving Repr

end Demo
