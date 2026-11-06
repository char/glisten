proc p {} { # } }
if 1 { puts "}" }
if 1 { puts "\}"; puts inside }
if 1 {puts "{"
# }
puts still_inside}; puts after
if 1 {puts [list "{"]
# }
puts nested}; puts done
