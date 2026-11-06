:- module(family, [ancestor/2, count_children/2]).
:- use_module(library(lists)).
:- dynamic parent/2.

% Each clause begins with a predicate, including facts.
parent(ada, beatrice).
parent(beatrice, charles). parent('D''Arcy', eve).

ancestor(X, Y) :-
    parent(X, Y).
ancestor(X, Y) :-
    parent(X, Z),
    ancestor(Z, Y).

count_children(Parent, Count) :-
    findall(Child, parent(Parent, Child), Children),
    length(Children, Count).
