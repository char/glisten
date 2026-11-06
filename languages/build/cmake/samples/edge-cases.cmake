#[==[ Comment with ]=] and ${no_expansion}.
]==]
set(raw [=[Literal ]] and ]==] ${not_expanded}
]=])
set(empty [[raw # text]]) # trailing comment
set(boundaries prefix[=[not-a-bracket-argument]=] ${name}[=[still-unquoted]=] escaped\ space[=[also-unquoted]=] [=[bracket argument]=])
SeT(escaped "quote: \" newline: \n" unquoted\ argument)
IF((DEFINED name) OR name MATCHES "a(b|c)")
  message("${outer_${inner}} $<IF:$<BOOL:${flag}>,yes,no>")
ENDIF()
