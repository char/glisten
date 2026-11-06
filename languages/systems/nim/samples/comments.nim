## Documentation comment.
# Ordinary line comment.

#[ An outer multiline comment.
   #[ A nested comment. ]#
   Back in the outer comment.
]#

##[ Documentation block.
    ##[ Nested documentation. ]##
    Still documentation.
]##

proc safeDivide*(x, y: int): int =
  ## A documentation line inside the procedure.
  try:
    if y == 0:
      raise newException(ValueError, "division by zero")
    result = x div y
  except ValueError:
    result = 0
  finally:
    discard
