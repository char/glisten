%%% A small message worker.
-module(worker).
-export([start/0, loop/1, sum/1]).
-define(DEFAULT_TIMEOUT, 5000).
-record(state, {count = 0, label = 'ready now'}).

start() ->
    spawn(fun() -> loop(#state{}) end).

loop(State = #state{count = Count}) ->
    receive
        {get, From} ->
            From ! {ok, Count},
            loop(State);
        {add, N} when is_integer(N), N > 0 ->
            loop(State#state{count = Count + N})
    after ?DEFAULT_TIMEOUT ->
        ok
    end.

sum(Items) ->
    lists:sum([N || {ok, N} <- Items, N rem 2 =:= 0]).
