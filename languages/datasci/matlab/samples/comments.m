% A line comment
%{
Outer block comment
  %{
  Inner block comment
  %}
Still in the outer block
%}
hex = 0x1F; exponent = 1e3;
result = sin(pi / 4) ... this is a continuation comment
    + 2;
%{ not a block delimiter because of this text
active = true;
