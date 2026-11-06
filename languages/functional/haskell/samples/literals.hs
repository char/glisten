{-# LANGUAGE QuasiQuotes, DataKinds, TemplateHaskell, NumericUnderscores #-}
-- | Comment and operator distinctions
{-| Outer Haddock {- nested -} remains comment. -}
x --> y = x
x --- comment
x' = 'a'
newline = '\n'
escaped = '\x41'
promoted = 'Constructor
quoted = ''Type
text = "Hello\nworld\&! and \
       \a string gap"
number = 0xff_ff + 0o77 + 0b1010 + 1_000 + 12.5e-2
markup = [html|<div>raw [content] -- not a comment</div>|]
