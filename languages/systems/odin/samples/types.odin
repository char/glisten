package examples

@(private="file")
Pair :: struct($T: typeid) {
    left, right: T,
}

Status :: enum { Pending, Ready, Failed }
Number :: union { int, f64 }
Flags :: bit_set[Status]
Id :: distinct u64

@(require_results)
first :: proc(pair: Pair($T)) -> T {
    return pair.left
}

foreign import c "system:c"
foreign c {
    puts :: proc "c" (text: cstring) -> i32 ---
}

#assert(size_of(i64) == 8)
