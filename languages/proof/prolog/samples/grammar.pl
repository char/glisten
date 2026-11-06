:- module(words, [sentence//1, pick/2]).

sentence(S) --> noun(N), verb(V), { S =.. [sentence, N, V] }.
noun(cat) --> [cat].
noun(dog) --> [dog].
verb(sleeps) --> [sleeps].

pick([Head|Tail], Value) :-
    ( Head \= none -> Value = Head
    ; Tail = [Next|_] -> Value = Next
    ; !, fail
    ).

profile(Name, Info) :-
    Info = _{name: Name, status: active}.
