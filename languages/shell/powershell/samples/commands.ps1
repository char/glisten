<#
.SYNOPSIS
    List source files and print their lengths.
.DESCRIPTION
    Demonstrates parameters, types, pipelines, and comment help.
.EXAMPLE
    Get-SourceStats -Path . -Verbose
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $Path,
    [int] $Limit = 1kb
)

function Get-SourceStats {
    param([string] $Root)
    $items = Get-ChildItem -Path $Root -Recurse |
        Where-Object { $_.Length -ge 0x10L -and $PSItem.Name -like '*.ps1' }
    foreach ($item in $items) {
        Write-Host -Object "$($item.Name): $($item.Length)`n"
    }
    return [System.IO.File]::Exists($Root)
}
Get-SourceStats -Path $env:PATH -Limit $Limit
