{-# LANGUAGE ExplicitForAll, TypeApplications, PatternSynonyms, RecursiveDo #-}
module Syntax where

pattern Empty = []
class Render a where
  render :: forall b. a -> b -> String

example :: (Ord a) => a -> [a] -> Bool
example x xs = if x `elem` xs then True else False
apply = fmap @Maybe (+ 1)
compose = (.)
section = (1 +)
choose x = case x of
  Just value -> let y = value in y
  Nothing -> 0
main = mdo
  value <- pure 1
  pure value
