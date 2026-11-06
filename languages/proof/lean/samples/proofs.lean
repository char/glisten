import Lean

section
variable (α : Type) (x : α)

example : ∀ p q : Prop, p ∧ q → q ∧ p := by
  intro p q h
  exact ⟨h.2, h.1⟩

theorem add_zero_right (n : Nat) : n + 0 = n := by
  simp

example (p : Prop) (h : p) : p := by
  have h₁ : p := h
  exact h₁

end
