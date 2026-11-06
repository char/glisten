// The `(*)` operator is not the start of a comment.
let multiply = (*)
(* outer (* inner *) outer *)
let escaped = "hello\nworld\u0041"B
let verbatim = @"a ""quoted"" path C:\work"
let multiline = """first line
second line"""
let name = "F#"
let greeting = $"Hello {name}; {{braces}}"
let path = $@"C:\{name}\file"
let raw = $"""hello {name}"""
let rawBraces = $$"""literal {x}, expression {{name}}"""
let letter = 'x'
let newline = '\n'
let nums = [ 1L; 1uy; 1.0m; 0xffUL; 0b1010; 0o77 ]
