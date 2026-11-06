# Slash after an operand is division, after an operator a regex.
/a[\/]b/ { x = $1 / 2; y = x / /z/; $NF = "$(not a field)" }
BEGIN {
    n = .5e+2; n /= 2
    if ($0 !~ /[/]/) print "escaped: \" and \n"
    a = $(i + 1); b = ++i / 3; c = i++ / 4
    if ((i + 1) > 0) /statement/
    ratio = (i + 1) / 2
    typed = @/a[\/]b/; matched = match($0, typed)
    x = 1 + \
        2 # continuation
}
