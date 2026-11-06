{-# OPTIONS --allow-unsolved-metas #-}
module Holes where

open import Agda.Builtin.Nat using (Nat; zero)
open import Agda.Builtin.String using (String)
open import Agda.Builtin.Char using (Char)

-- A line comment; --not-a-comment below is a single name.
{- Outer comment {- nested -} back to the outer comment. -}
--not-a-comment : Nat
--not-a-comment = 0x1F

message : String
message = "a string with a \"quote\""

letter : Char
letter = 'λ'

later : Nat
later = ?

sketch : Nat
sketch = {! zero !}
