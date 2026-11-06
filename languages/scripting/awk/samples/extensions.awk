@namespace "demo"
@include "shared.awk"
BEGINFILE { print FILENAME, ARGIND }
function describe(text, parts, n) {
    n = split(text, parts, /[,:]/)
    return sprintf("%d fields", n)
}
{
    line = gensub(/foo/, "bar", "g", $0)
    if (length(line) > 0) print describe(line)
    nextfile
}
ENDFILE { print FNR }
