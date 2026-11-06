module Basics where

open import Agda.Builtin.Nat using (Nat; zero; suc)

id : {A : Set} → A → A
id x = x

infixl 6 _⊕_
_⊕_ : Nat → Nat → Nat
zero  ⊕ y = y
suc x ⊕ y = suc (x ⊕ y)

x+y : Nat
x+y = 7

ℕ→ℕ : Set
ℕ→ℕ = Nat → Nat

identity : ℕ→ℕ
identity = λ x → x
