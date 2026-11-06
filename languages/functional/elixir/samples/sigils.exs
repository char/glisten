name = "Ada"
regex = ~r/^hello\s+#{name}$/iu
nested = ~s(one (two\) #{String.upcase(name)})
words = ~w[red green blue]a
literal = ~S"#{name} \\n"
raw_quote = ~S"a\"b"
date = ~D[2024-06-30]
custom = ~RAW9[#{not_interpolated}]abc2
time = ~T[12:34:56]
slash = ~s/hello #{name}/
pipe = ~s|hello #{name}|
double = ~s"hello #{name}"
single = ~s'hello #{name}'
brace = ~s{hello {world\} #{name}}
angle = ~s<hello <world\> #{name}>
long = ~s"""
  Hello #{name}
  """
raw_long = ~S'''
  #{not_interpolated}
  '''
