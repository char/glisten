$single = 'don''t expand $env:HOME or `n'
$double = "Hello $env:USER; $(Get-Date -Format 'yyyy'); ${odd name}`n"
$plain = @'
Literal $x and $(Get-Date)
not a terminator '@ unless at line start
'@
$expanded = @"
User: $env:USERNAME
Value: $($script:value + 1)
Indented "@ is not a terminator.
"@
$escaped = "escaped `"quote`" and ``backtick``"
