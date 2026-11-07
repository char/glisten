// comment "not a string"
let escaped = "quote: \" hex: \x41 unicode: \u03bb \U0001f600";
let raw = `literal \n
still raw`;
let runes = ['a', '\n', '\u03bb'];
let nums = [1u8, 2z, 1e3f32, 0xCA_FE, 0o77, 0b10_01, 3.14f64];
let choices: (int | str)! = call::work()?;
// word boundaries
let iffy = true_value; let integer = 12;
let multiline = "first
second";
