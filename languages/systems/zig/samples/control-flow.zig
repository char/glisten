const std = @import("std");

//! A small example of labels, builtins, and strings.
const help =
    \\Usage: sensor [options]
    \\  --name  choose a sensor, e.g. café
    \\  --help  print this text
;

fn findPositive(values: []const i32) ?usize {
    return search: {
        for (values, 0..) |value, index| {
            if (value > 0) break :search index;
        }
        break :search null;
    };
}

fn sumUntil(values: []const i32, limit: i32) i32 {
    var total: i32 = 0;
    outer: for (values) |value| {
        if (value < 0) continue :outer;
        total += value;
        if (total >= limit) break :outer;
    }
    return total;
}

test "search and sum" {
    const values = [_]i32{ -1, 0, 5, 9 };
    const index = findPositive(&values) orelse return error.NotFound;
    try std.testing.expectEqual(@as(usize, 2), index);
    try std.testing.expectEqual(@as(i32, 5), sumUntil(&values, 4));
    const text = "tab\t newline\n lambda \u{3bb} hex \x41";
    const letter: u8 = '\n';
    const number = 0xff + 0b1010 + 0o17;
    const ratio: f64 = 0x1.fp+2 + 1.2e-3;
    _ = .{ help, text, letter, number, ratio };
}
