const std = @import("std");

/// A sensor reading with a name in UTF-8: café.
///
/// The value is signed so that negative readings are possible.
pub const Reading = struct {
    name: []const u8,
    value: i32,
    active: bool = true,

    pub fn scaled(self: Reading, factor: i32) i32 {
        return self.value * factor;
    }
};

const State = enum { idle, running, stopped };
const Result = union(enum) {
    reading: Reading,
    failure: anyerror,
};

fn inspect(result: Result) i32 {
    return switch (result) {
        .reading => |reading| reading.scaled(2),
        .failure => 0,
    };
}

test "reading scales" {
    const reading = Reading{ .name = "温度", .value = -3 };
    try std.testing.expectEqual(@as(i32, -6), reading.scaled(2));
    const result: Result = .{ .reading = reading };
    try std.testing.expect(inspect(result) < 0);
    _ = State.idle;
}
