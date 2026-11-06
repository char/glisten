// Intentionally incomplete and invalid lexical probes.
#![cfg_attr(feature = "extra", allow(unused))]
/* outer comment /* nested comment */ still outer */
struct Fields<T> {
    café: Option<(T, u8)>,
    pub(crate) r#type: [u8; 4],
    callback: fn(u8, u8) -> u8,
    final_field: T,
}
fn keyword_near_misses<'staticish>(input: &'staticish str) {
    let return_value = 1;
    let asyncness = false;
    let selfless = true;
    let r#match = input;
    let café = "unicode identifier";
    let field = thing.method::<u8>(0);
    let _ = thing.café::<u8>(0);
    let _ = thing.r#type :: <u8>(0);
    fn r#match<T>(value: T) -> T { value }
    let ranges = (1..2, 1.0..2.0, 1., 1.foo());
    let suffixes = (0xff_u8, 12usize, 1.2e-3f64);
    let almost = r##"one "# is not the end"##;
    let extra = r#"text"##[cfg(test)];
    let char_or_lifetime = ('a', '\n', 'label);
    'label: loop { break 'label; }
    let bad_escape = "bad \q and \u{zz}";
    let bad_char = '\xZ0';
    let _ = (return_value, asyncness, selfless, r#match, café);
    let _ = (field, ranges, suffixes, almost, extra, char_or_lifetime);
}

// A stray closing delimiter should not consume subsequent code.
*/ fn still_code() { let x = 0; }

// Unterminated raw string at EOF:
let unfinished = r###"a "## is not enough
