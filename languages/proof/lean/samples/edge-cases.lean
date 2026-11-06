import Lean

example : True ∧ True := by
  constructor
  · exact (by trivial)
  · have h : True := by
      trivial
    exact h

example : True ∧ True := by
  constructor
  case left =>
    trivial
  next =>
    trivial

example : True ∧ True := by constructor <;> trivial
example : True ∧ True := by constructor; trivial; trivial
example : True := (by trivial)
example : True ∧ True := ⟨by trivial, by trivial⟩
example : True := by (trivial)
example : ∃ x y : Nat, x = y := by
  exists 0, 0
  rfl

example : True ∧ True := by
  constructor
  . trivial
  . trivial

-- The name in an argument is not itself a tactic invocation.
example (simp : True) : True := by
  exact simp
