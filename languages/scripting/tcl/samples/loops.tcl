namespace eval demo {
    proc countdown {n} {
        for {set i $n} {$i > 0} {incr i -1} {
            puts "count: $i"
        }
        while {$n > 0} {
            incr n -1
        }
        catch {puts "done"} result
    }
}
set message first\
    second
