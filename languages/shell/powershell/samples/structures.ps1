using namespace System.Collections.Generic
$settings = @{
    Name = 'worker'
    Enabled = $true
    Missing = $null
    Values = @(1, 2.5, 0x10L, 1kb)
}
$argsForChild = @{ Path = '.'; ErrorAction = 'Stop' }
Get-Item @argsForChild | ForEach-Object {
    $script:count += 1
    if ($_.Name -MATCH 'test' -or $false) {
        Write-Output ($_.Name ?? 'unknown')
    }
}
$result = [System.IO.File]::Exists($settings.Name)
$maybe = $settings?.Name
# .SYNOPSIS a line-help keyword
Write-Output `
    $using:result
