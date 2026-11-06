package example;

@interface Note {
    String value();
}

@Note("measurement")
record Measurement(double value, String unit) {
    static final long MASK = 0xCAFE_F00DL;
    static final int BITS = 0b1010_0110;
    static final int OCTAL = 07_77;
    static final double HEX = 0x1.fp+3;
    static final double EXP = .5e-2;
    static final float FLOAT = 1_000.25f;
    static final char QUOTE = '\'';
    static final char NEWLINE = '\n';
    static final char OCTET = '\141';
    static final char UNICODE = '\u0041';
    static final String MESSAGE = "tab\tquote\" slash\\";
    static final String BLOCK = """
        The first line has a trailing space\s
        This line continues \
        here.
        A quote: \" and a slash: \\
        """;

    double scaled(double factor) {
        return value * factor;
    }

    boolean valid() {
        return value >= 0 && unit != null;
    }
}
