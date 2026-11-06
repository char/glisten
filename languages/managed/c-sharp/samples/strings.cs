var normal = "Line\n\u0041";
var utf8 = "hello"u8;
var verbatim = @"C:\path\""file""";
var interpolation = $"value {{literal}} {Calculate(1, 2):N2}";
var combined = $@"value {Environment.UserName}: ""yes""";
var reversed = @$"value {42}";
var single = 'x';
var raw = """
    This is "raw".
    """;
var four = """"Embedded """ quotes"""";
var computed = $$"""
    Hello {{person.Name}}; {single braces}
    Nested {{M("""inner""")}}.
    """;
