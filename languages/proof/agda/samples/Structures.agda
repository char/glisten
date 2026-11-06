module Structures where

open import Agda.Builtin.Nat using (Nat; zero; suc)

data Bool : Set where
  false true : Bool

record Pair (A B : Set) : Set where
  constructor _,_
  field
    first : A
    second : B

open Pair public

not : Bool → Bool
not false = true
not true = false

example : Pair Nat Bool
example = suc zero , not false
