%% Shared records and compile-time settings.
-ifndef(ORCHARD_HRL).
-define(ORCHARD_HRL, true).
-define(TAG(Value), {tag, Value}).
-record(request, {id :: non_neg_integer(), payload = #{}}).
-type status() :: idle | {running, pid()}.
-spec encode(binary()) -> binary().

-endif.
