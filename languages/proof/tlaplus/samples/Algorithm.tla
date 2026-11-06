----------------------------- MODULE Algorithm -----------------------------
EXTENDS Naturals

(* A nested comment: (* inner *) back outside. *)
(* --fair algorithm Countdown {
  variables n = 3;
  process (worker = "worker") {
    start:
      while (n > 0) {
        await n \in Nat;
        n := n - 1;
      };
    finish:
      either { goto done; } or { skip; };
    done: skip;
  }
} *)
\* The algorithm above is a comment in TLA+, but contains PlusCal code.
=============================================================================
