/* Outer comment, with /* nested */ text still commented. */
:- use_module(library(lists)).

'quoted head'(X) :- X = 'isn''t this an atom?'.
numbers([0'a, 0'\n, 0xFF, 0o77, 0b1010, 2'1010,
         1_000_000, 1.25e-3]).
texts("quote: \" unicode: \u263A", `backquoted \n codes`,
      'octal \141\ and hex \x41\').
comparisons(A, B) :-
    A =\= B,
    A @< B,
    \+ A =.. [bad|_],
    Value is (A + B) // 2,
    Value =:= 42.
zero. next(X) :-
    X = a.b.
