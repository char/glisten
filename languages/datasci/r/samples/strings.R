plain <- "escaped \n and \u{263A} and \"quotes\""
single <- 'backslash \\ and \x41'
a <- r"(literal \n and )-\" is not a close)"
b <- R"---[embedded ]--\" and (quotes) ]---"
c <- r'--{literal }-\' and \\ text}--'
d <- r"(| not a delimiter inside parentheses)"
e <- R"--|pipe |-- not yet \" then |--"
message(a, b, c, d, e)
