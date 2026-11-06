----------------------------- MODULE Counter -----------------------------
EXTENDS Naturals, FiniteSets
CONSTANT Limit
VARIABLE count

Init == count = 0
Next == /\ count < Limit
        /\ count' = count + 1
Spec == Init /\ [][Next]_count

TypeOK == count \in 0..Limit
THEOREM Safety == Spec => []TypeOK
PROOF
  OBVIOUS
=============================================================================
