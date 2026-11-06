// Deliberately incomplete snippets; recovery after line endings matters.
class EdgeCases {
    int classy = 0;
    int interfaceValue = 1;
    int trueValue = 2;
    int record = 3;
    int sealed = 4;
    int yield = 5;
    int var = 6;
    int non = 7;
    int $amount = 8;
    int café = 9;
    int 漢字 = 10;

    String unfinished = "oops
    int afterString = 11;
    char unfinishedChar = 'x
    int afterChar = 12;

    double values = 1.0 + .25 + 1e3 + 0x1p4;
    long more = 42L + 0b11L + 0xffL;
    Object fn = String::valueOf;
    boolean test = more > 0 && values != 0;
    int shifted = 1 << 3;
    String escapes = "\s \b \f \r \t \\ \" \u0041";
    // A comment with "quotes" and /* not a nested comment.
    /* A block with // and "quotes". */
    @example.api.Marker
    void test() {
        Runnable r = () -> System.out.println("ok");
        r.run();
    }
}
/* unfinished comment
