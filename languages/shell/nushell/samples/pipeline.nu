# Find large files
ls --all | where size > 10kb | sort-by size | each {|row|
  $"($row.name): ($row.size)"
}
let paths = $env.PATH
print $paths.0?
