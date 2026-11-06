#!/usr/bin/env ruby
require "json"
name = "雪"
words = %w[one [two] three]
symbols = %i(red blue)
raw = %q{literal #{name}}
expanded = %Q{Hello #{name.upcase}!}
pattern = %r<\A#{name}/[a-z]+\z>i
match = /a[\/]b/i
ratio = total / count
text = "hello #@user and #{name}"
values = [0xff, 0b1010_0011, 0o77, 3r, 2i, ?a]
config = {ready: true, :title => :"hello #{name}"}
