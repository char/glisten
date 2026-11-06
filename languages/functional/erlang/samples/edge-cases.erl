-module(edge_cases).
-export([values/0]).

values() ->
    Base = 16#FF_A0 + 2#1010,
    Char = {$a, $\n, $\x{1F600}},
    Bytes = <<Base:16/integer, 3:8>>,
    Map0 = #{alpha => "escaped \"quote\" and \n", 'quoted atom' => Char},
    Map = Map0#{'quoted atom' := Char},
    Text = """""
      Literal \\n and content """ in the middle.
      """"
      """"",
    Raw = ~S|no \\n escapes here|,
    Binary = ~b"line\n",
    Vanilla = ~"quote \" and newline\n",
    Multiline = ~s"""
      escaped \n but "" inside
      """,
    {Base, Bytes, Map, Text, Raw, Binary, Vanilla, Multiline, ?MODULE, ?LINE}.
