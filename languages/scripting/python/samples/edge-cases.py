# Deliberately incomplete Python for highlighting recovery.
name = "café"
δ = 0xCA_FE
near = (matchbox, casework, typewriter, selfless, classifier)
prefixes = (r"raw\n", b'bytes\x20', rb"raw bytes", u'unicode')
formatted = f"{name!r:>{width}}"
paired = f"{{literal}} {δ=}"
nested = f"{f'{name}'}"
same_quote = f"{mapping["name"]}"
continued = "line\
continuation"
multiline = '''first
second
third'''
hexadecimal = 0x_FF
binary = 0b_1010
integer = 10_000
fraction = .25e-2
imaginary = 1.0j

@registry.register("entry")
class Example:
    def method(self, value: list[str]) -> str:
        # Unicode identifiers are valid Python.
        café = value[0]
        return f"{café!s}"

# Each incomplete string ends at the physical line.
broken = "unterminated
next_name = 42
broken_again = 'unfinished
still_code = True
