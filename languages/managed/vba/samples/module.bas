Attribute VB_Name = "Utilities"
Option Explicit
Option Base 1

#If VBA7 Then
Private Declare PtrSafe Function GetTickCount Lib "kernel32" () As Long
#Else
Private Declare Function GetTickCount Lib "kernel32" () As Long
#End If

Public Sub Main()
    Dim names() As String
    ReDim Preserve names(10)
    On Error GoTo Failed
    names(1) = "Hello ""world"""
    Exit Sub
Failed:
    Debug.Print Err.Description
    Resume Next
End Sub
