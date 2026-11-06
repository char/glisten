package edge

// Keyword near misses and Unicode identifiers.
var variable = 1
var interfaceValue = 2
var trueValue = false
var integer = 3
var café = "☕"
var 日本語 = `日本語`
var Δ2 = '\u0394'

func inspect(ch chan int) {
outer:
    for {
        select {
        case n := <-ch:
            if n == 0 {
                break outer
            }
        default:
            continue outer
        }
    }
}

var valid = 0X_1.Ap-2 + 42i + .5e+2
var dot = object.field
var call = object.Method()
var missing = "unterminated
var next = 1
var missingRune = 'x
var after = 2
var strange = "\q \xZ1"
var unfinished = `raw string continues
through the end of the file
