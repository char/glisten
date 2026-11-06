vim9script
# A Vim9 function
def Format(name: string): string
  var lines = [
    #\ A continuation comment
    'hello',
    name,
  ]
  var text = lines[0]
    .. ', '
    .. lines[1]
  var kind = len(name) > 1
    ? 'long'
    : 'short'
  if len(text) > 1
    return text # a trailing comment
  else
    return 'empty'
  endif
enddef

var count = 1'000 + 0x10 + 0b10 + 0o7
const Name = Format('world')
echo Name
setlocal path=one\ two # option comment
legacy let g:old = "legacy value" " legacy comment
var newer = "vim9 value" # vim9 comment
var result =<< eval END # interpolated header
  Result: {Format('world')} and {{literal}}
END
