/-! Documentation with a nested block.
  /- inner -/ outer
-/

def «a name with spaces» : String := "hello\nworld"
def message (x : Nat) : String := s!"value = {Nat.succ x}"
def answer : Nat := 0x2A + 0b10
#eval message answer
#check Nat.succ
-- Quoted names are identifiers, and string braces can contain expressions.
