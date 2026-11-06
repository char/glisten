module Vectors

import Data.Vect

%default total

||| Append two vectors, preserving their lengths in the result type.
public export
appendV : Vect n a -> Vect m a -> Vect (n + m) a
appendV [] ys = ys
appendV (x :: xs) ys = x :: appendV xs ys

mapV : (a -> b) -> Vect n a -> Vect n b
mapV f [] = []
mapV f (x :: xs) = f x :: mapV f xs

identity : (0 a : Type) -> a -> a
identity _ = \x => x
