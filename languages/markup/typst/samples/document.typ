= A small report <intro>

This is *strong*, _emphasized_, and `raw text`. See @intro and https://typst.app.
- First item
+ Numbered item
/ Term: Definition
A line break follows here \\
and an escaped marker: \#not-code.

#let author = "Charlotte"
#set text(size: 12pt)
#show heading: it => strong(it.body)
#let greet(name) = [Hello, *#name*!]
#greet(author) after the call is markup.
#context text.lang; this is markup after the semicolon.
#box[Markup [with nested brackets], $x_1$, and *strong #name*] outside.
Word_boundaries and foo*bar*baz stay plain; *strong _nested_* works.
