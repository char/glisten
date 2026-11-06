module Strings

%default total

{- Outer comment with {- nesting -}, a string "-}" and -- a line comment
   then the outer comment closes here. -}

greeting : String -> String
greeting who = "Hello, \{who}!"

rawGreeting : String -> String
rawGreeting who = #"raw \{not interpolated}, hello \#{who}!"#

nested : String -> String
nested who = ##"outer \##{ #"inner \#{who}"# } done"##

multiline : String -> String
multiline who = """
  Welcome, \{who}!
  A second line.
  """

rawMultiline : String -> String
rawMultiline who = #"""
  \{literal braces}; interpolated: \#{who}
  """#

quoted : Char
quoted = '\n'

hexChar : Char
hexChar = '\x41'
