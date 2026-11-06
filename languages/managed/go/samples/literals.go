package literals

const (
    zero = 0
    decimal = 1_234_567
    octal = 0o755
    legacy = 0755
    binary = 0b1010_0011
    hexadecimal = 0xCAFE_F00D
    fraction = .125
    exponent = 1.25e-3
    hexFloat = 0x1.fp+2
    imaginary = 2.5i
    binaryImaginary = 0b10i
)

var (
    a = '\n'
    b = '\x41'
    c = '\123'
    d = '\u03bb'
    e = '\U0001f600'
    quoted = "tab\t slash\\ quote\" bell\a"
    escaped = "\x41\101\u03bb\U0001f600"
    raw = `first line
second line \n is literal`
)

// A line comment.
/* A block comment
   with another // marker. */
func values() []any {
    return []any{zero, decimal, octal, legacy, binary, hexadecimal,
        fraction, exponent, hexFloat, imaginary, binaryImaginary,
        a, b, c, d, e, quoted, escaped, raw, true, false, nil}
}
