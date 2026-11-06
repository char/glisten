//! Literals and macros used by a tiny message formatter.

const LIMIT: usize = 1_024;
const MASK: u32 = 0xff00_abcd;
const BITS: u8 = 0b1010_0011;
const OCTAL: u16 = 0o755;
const RATIO: f64 = 6.02e+23;

macro_rules! announce {
    ($name:expr, $value:expr) => {
        println!("{} = {:?}", $name, $value)
    };
}

fn main() {
    let ordinary = "line\nquote: \" slash: \\";
    let unicode = "λ = \u{03bb}; byte = \x41";
    let raw = r#"a "quote" and # remain literal"#;
    let nested = r###"embedded "# and "## stay inside"###;
    let bytes = b"a\x20b\n";
    let raw_bytes = br##"not \n or "# yet"##;
    let c_string = c"hello\n";
    let raw_c = cr#"café"#;
    let letter = 'λ';
    let escaped = '\u{1f980}';
    let byte = b'\x41';
    let r#type = true;
    let result = Some(42_u32).map(|n| n + 1);
    announce!("result", result);
    println!("{ordinary} {unicode} {raw} {nested}");
    let _ = (bytes, raw_bytes, c_string, raw_c, letter, escaped, byte, r#type);
    let _ = (LIMIT, MASK, BITS, OCTAL, RATIO);
}
