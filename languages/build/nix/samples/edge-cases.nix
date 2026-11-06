# Near keywords and ambiguous punctuation.
let
  iffy = trueValue;
  thenable = falsehood;
  elsewhere = nullable;
  inheritFrom = 1;
  inkwell = 2;
  recursor = 3;
  ordinary = 4;
  true-key = false;
  number = [ 0 12 1.5 .5 1e3 1.0e-2 ];
  operators = a // b ++ c == d != e && f || !g;
  division = a / b;
  path = a/b;
  dynamic = ./dir/${name}/file;
  key.${name}."quoted part" = 1;
  inherit (source) alpha beta;
  uri = https://example.test/a?x=1;
  notUri = https:;
  search = <nixpkgs>;
  comparison = a < b && b > c;
  # Nested braces in interpolation.
  text = "${ { x = "nested"; }.x }";
  shell = ''
    echo "''${HOME}"
    echo ${name}
  '';
  /* A closed block comment. */
  invalid = "unterminated string
  fake = true;
  } # still string at EOF
