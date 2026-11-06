program Strings;
{$APPTYPE CONSOLE}
{$R *.res}

const
  Greeting = 'It''s Pascal' + #13#10 + 'Hello';
  Mask = $FF;
  Bits = %1010;
  Octal = &17;
  MessageText = '''
    This is a Delphi 12
    multiline string.
    ''';

begin
  (* A parenthesized comment with {braces} inside. *)
  // &begin is an escaped identifier, not a keyword.
  WriteLn(Greeting, 1.5e3, Mask, Bits, Octal);
end.
