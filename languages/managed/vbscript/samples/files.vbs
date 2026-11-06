Option Explicit
Dim shell, files, item
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
WScript.Echo "Current folder: " & shell.CurrentDirectory
For Each item In files.GetFolder(".").Files
    WScript.Echo item.Name
Next
