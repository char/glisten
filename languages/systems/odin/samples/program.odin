package main

import "core:fmt"

// Sum the first n integers.
sum :: proc(n: int) -> int {
    total := 0
    for i in 0..<n {
        total += i
    }
    return total
}

main :: proc() {
    value: int = sum(10)
    defer fmt.println("done")
    if value > 0 {
        fmt.printf("sum = %d\n", value)
    } else {
        fmt.println("empty")
    }
}
