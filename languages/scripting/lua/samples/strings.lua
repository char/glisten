--[==[
Long comment with ]=] and ]] inside; only the matching closer ends it.
]==]
local plain = [[first line
second line]]
local nested = [==[one ]=] two ]] three ]==]
local text = "tab\t hex\x41 decimal\065 unicode\u{1F642}"
local continued = 'skip\z   
  this whitespace and \
continue'
local doubled = 1 .. 2
print(text, nested, 0xff, 0x.8p-1, .25e+2)
