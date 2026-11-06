-- Near-matching levels must not close early.
local text = [=[first ]] second ]==] third]=]
--[=[ comment ]] still comment ]=]
local x <const> = "bad\q unicode λ"
local unclosed = 'unfinished
local after = 42
local bogus = [== not a long opener
:: label :: goto label
--[==[ unclosed long comment ]=]
