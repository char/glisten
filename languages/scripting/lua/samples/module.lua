#!/usr/bin/env lua
local M = {}
local limit <const> = 0x1.fp+3
local handle <close> = assert(io.open("data.txt", "r"))

function M:process(items, ...)
  local total = 0
  for index, value in ipairs(items) do
    if value > limit then
      total = total + math.floor(value)
    elseif value == nil then
      goto finished
    end
  end
  ::finished::
  self.total = total
  print("total:", self.total, ...)
  return total
end

local function load_config(path)
  return require(path), { enabled = true, missing = nil }
end
return M
