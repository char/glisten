# An exact supported shebang selects Python.
python:
    #!/usr/bin/env python3
    print("snow 雪 {{name}}")

choice := if os() == 'linux' {
    'yes'
} else {
    'no'
}

build:
    echo {{env("HOME", "fallback")}}
    echo {{if ok { 'yes' } else { 'no' }}}
next:
    @echo done

# A genuinely unterminated string stays open through EOF.
unfinished := 'not closed 雪
