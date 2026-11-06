module Records

%default total

record Point where
  constructor MkPoint
  x : Int
  y : Int

interface Describe a where
  describe : a -> String

Describe Point where
  describe p = "point (\{show p.x}, \{show p.y})"

shift : Point -> Point
shift p = { x $= (+ 1), y $= (+ 1) } p

namespace Shapes
  origin : Point
  origin = MkPoint 0 0

choose : Bool -> Int
choose b = if b then 1 else 0
