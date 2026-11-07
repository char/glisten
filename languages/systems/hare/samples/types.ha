@symbol("hare_example") export fn example(xs: []u8, p: nullable *int) (str | void) = {
	for (let i = 0z; i < len(xs); i += 1) {
		if (xs[i] == 0xffu8) break;
	};
	return `raw text`;
};

type item = struct { value: int, next: nullable *item };
@test fn check() void = { assert(true); };
