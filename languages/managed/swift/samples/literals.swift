/// Various Swift literals.
let plain = "hello\n\(name.uppercased())"
let lines = """
    A value: \(compute(1 + 2))
    Multiple lines.
    """
let raw = ##"One # and \#(notInterpolation); value \##(answer)"##
let rawLines = #"""
    Raw \n and \#(answer)
    """#
let pattern = /[a-z]+\d*/
let rawPattern = #/a[\/]+\#(suffix)/#
let values = [0xff, 0b1010_0011, 0o755, 0x1.fp3, 1_000.25e-2]
