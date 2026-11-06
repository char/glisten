module EdgeCases exposing (..)

{-| Nested comments: {- inner {- deepest -} inner -} outer.
Operators inside comments: |> -- """ and [glsl|.
-}


text : String
text =
    """
A quoted "word", a backslash: \\ and snowman: ☃
"""


unicode : String
unicode =
    "\u{1F600}"


character : Char
character =
    '\n'


numbers : List Float
numbers =
    [ 1.25e-3, 2.0, 3.5 ]


pipeline : Int -> Int
pipeline =
    \value -> (value + 0xFF) // 2


add =
    (+)


shader =
    [glsl|
        // Content is intentionally plain, not Elm.
        void main() { gl_Position = vec4(0.0); }
    |]


compare a b =
    if a /= b then
        a :: [ b ]

    else
        []
