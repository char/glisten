"""String literals and interpolation."""

name = "Ada"
width = 12
precision = 3
value = 2.71828
plain = 'hello\nworld'
quoted = "A \"quote\" and a backslash: \\\\"
byte_data = b"\x48\x69\012"
unicode_name = "\N{LATIN CAPITAL LETTER A}\u03bb\U0001F600"
raw_path = r"C:\new\folder\file.txt"
raw_quote = r'can\'t'
raw_bytes = br"\x00\n"
text = u"old spelling"
triple = """Line one
Line two with 'quotes'
Line three"""
raw_triple = r'''a\nb
c\td'''

simple = f"Hello, {name}!"
representation = f"{name!r} {value!s} {name!a}"
debug = f"{value = :.2f}"
columns = f"{name:>{width}} {value:{width}.{precision}f}"
brace_text = f"{{hello}} = {name}"
inner = f"{f'{name.upper()}'}"
same_quote = f"{ {'x': 'value'}['x'] }"
raw_format = rf"\n{name}\t{{ok}}"
complex_field = f"""result: {
    value + 1  # comments are legal in replacement fields
:.2f}"""

assert len(simple) > 0
assert raw_path.endswith("txt")
