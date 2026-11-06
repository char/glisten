module example.widget;
import std.stdio : writeln;
static import std.algorithm;

/// An example of D declarations and attributes.
@safe @nogc struct Widget(T) {
    T value;
    @property ref T get() pure nothrow { return value; }
}

struct Custom { string name; }
@Custom("example") template describe(T) {
    static if (is(T == int)) enum describe = "integer";
    else enum describe = typeof(T).stringof;
}

unittest {
    auto widget = Widget!int(42);
    scope(exit) writeln("done");
    foreach_reverse (i; 0 .. 3) writeln(widget.get, i);
    static foreach (n; 0 .. 2) { assert(n >= 0); }
    auto flag = __traits(compiles, cast(int) widget.value);
}
