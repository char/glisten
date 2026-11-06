# Summarize records by category.
BEGIN { FS = ","; OFS = "\t" }
NR > 1 && $2 ~ /^[0-9]+$/ {
    count[$1]++
    total[$1] += $2
}
END {
    for (key in count)
        printf "%s%s%.2f\n", key, OFS, total[key] / count[key]
}
