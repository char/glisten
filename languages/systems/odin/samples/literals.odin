#+private file
package examples

/* Outer /* nested */ outer again. */
example :: #force_inline proc() {
    binary := 0b1010_0110
    octal := 0o755
    dozenal := 0zAB
    hex := 0xdead_beef
    exact_float := 0h3f800000
    complex_value := 1.5i + 2j
    text := "line\nnext \u03bb"
    raw := `first line
second line`
    letter := '\n'
    octal_rune := '\123'
    uninitialized: int = ---
    for i in 1..=3 {
        _ = i
    }
    _ = binary
}
