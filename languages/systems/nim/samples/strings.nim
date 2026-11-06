template tag(s: string): string = s

let ordinary = "line\n and \x41"
let raw = r"backslashes \ and doubled ""quote"""
let longText = """A raw triple string
with \n and "quotes"."""
let generalized = tag"raw \n text"
let generalizedTriple = tag"""raw \n
multiple lines"""
let ch = 'a'
let newline = '\n'
let small = 255'u8
let hex = 0xFF_FF'i32
let bits = 0b1010_0110'u64
let octal = 0o755
let large = 1e10'f32
