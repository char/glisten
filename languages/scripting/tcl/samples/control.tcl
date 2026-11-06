# A small Tcl procedure
proc greet {name} {
    if {$name eq ""} {
        return "Hello, stranger"
    } else {
        return "Hello, $name"
    }
}
foreach person {Ada Grace Linus} {
    puts [greet $person]
}
