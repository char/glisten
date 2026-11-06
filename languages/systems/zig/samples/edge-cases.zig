// Intentionally incomplete and invalid lexical probes.
const iffy = 1;
const return_value = 2;
const while2 = 3;
const trueish = false;
const u8suffix = 4;
const @"field with space" = 5;
const escaped_name = @"quote\"name";
const café = "unicode identifier";
const Weird = struct {
    field: u32,
    callback: *const fn (u8) void,
    nested: struct { value: i8 },
};
fn probe(item: Weird) void {
    const x = item.field;
    const y = item.callback(0);
    const ranges = .{ 1..2, 1...2, 1.0, 0x1.fp-2 };
    const bad_numbers = .{ 0b102, 0xZZ, 1e+ };
    const bad_escape = "bad \q and \u{zz}";
    const bad_char = '\xZ0';
    named: while (true) {
        if (x > 0) break :named;
        continue :named;
    }
    _ = .{ x, y, ranges, bad_numbers, bad_escape, bad_char };
}
// Zig has no block comments: these delimiters are operators.
/* not a block comment */
const after = 42;
const broken = "unterminated
const recovered = 7;
// Multiline strings end at the physical line, even with quotes:
const lines =
    \\raw "quotes" and \n are literal
    \\second line, λ
;
const unfinished = "unterminated at EOF
