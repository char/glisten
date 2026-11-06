module example.strings;
auto normal = "newline\n and entity \&amp;"w;
auto raw = r"backslashes \ are literal";
auto ticks = `raw \ text`d;
auto bytes = x"DE AD be ef";
auto paired = q"(outer (inner) end)";
auto brackets = q"[alpha [beta] gamma]"c;
auto arbitrary = q"/slashes and text/";
auto heredoc = q"EOS
line one
EOS_more is not a footer
EOS"w;
auto tokens = q{
    int square(int x) { return x * x; }
    auto inner = q{ if (true) { return 42; } };
};
dchar letter = '\u03BB';
