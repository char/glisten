set values {one two {three four} $not_a_variable}
set prefix world
set message "Hello ${prefix}: [join $values ,]"
set table($prefix) [string toupper $message]
puts $table($prefix)
puts {*}$values
puts one; # a comment after a command separator
puts #this_is_an_argument
