{-# LANGUAGE GADTs, TypeFamilies, DerivingVia #-}
-- | A small module.
module Example (Tree(..), size) where
import qualified Data.Map as M hiding (map)

data Tree a = Leaf a | Branch (Tree a) (Tree a)
  deriving stock (Eq, Show)

type family Element a
size :: Tree a -> Int
size (Leaf _) = 1
size (Branch left right) = size left + size right

lookup' key = M.lookup key M.empty

#if defined(DEBUG)
traceTree = id
#endif
