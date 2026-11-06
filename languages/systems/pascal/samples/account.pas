unit Account;

interface

uses System.SysUtils, System.Generics.Collections;

type
  TAccount = class
  private
    FBalance: Double;
  public
    constructor Create(Initial: Double);
    procedure Deposit(Amount: Double); virtual;
    property Balance: Double read FBalance;
  end;

implementation

constructor TAccount.Create(Initial: Double);
begin
  inherited Create;
  FBalance := Initial;
end;

procedure TAccount.Deposit(Amount: Double);
begin
  if Amount > 0 then
    FBalance := FBalance + Amount;
end;

end.
