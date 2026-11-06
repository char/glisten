unit Control;
interface

procedure Run; cdecl;

implementation
(*$IFDEF DEBUG*)
procedure Run;
var I: Integer;
begin
  for I := 3 downto 1 do
    try
      if I mod 2 = 0 then
        WriteLn('even')
      else
        WriteLn('odd');
    except
      on E: Exception do raise;
    end;
end;
(*$ENDIF*)
initialization
  Run;
finalization
  { Closing } Writeln('done');
end.
