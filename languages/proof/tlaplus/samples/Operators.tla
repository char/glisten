---------------------------- MODULE Operators ----------------------------
EXTENDS Naturals, Sequences, TLC
CONSTANTS S, F
VARIABLE x

Choose(s) == CHOOSE y \in s: y > 0
Pair(a, b) == <<a, b>>
Apply(op(_), value) == op(value)
Transform(s) == LET f(z) == z + 1 IN { Apply(LAMBDA t: f(t), y) : y \in s }
Test == IF x \in S THEN TRUE ELSE FALSE
Cases == CASE x = 0 -> "zero" [] OTHER -> "nonzero\nvalue"
Update == [F EXCEPT ![x] = @ + 1]
Functions == (1 :> "one") @@ (2 :> "two")
Bases == <<\b101, \o17, \h1F, 42, 3.14>>
Unicode == ∀ y ∈ S : (y ∈ S ∧ y ⊆ S) ⇒ (y ∈ S ∨ y ∉ S)
Temporal == □(ENABLED Test) ∧ ◇(x = 0) ∧ (Test ~> Test)
Stutter == UNCHANGED x
ASCII == (\A y \in S : y \in S) /\ (\E y \in S : y \in S)
Sets == (SUBSET S) \X (UNION S)
=============================================================================
