VERSION 5.00
Begin VB.Form MainForm
   Caption = "Example"
End
Attribute VB_Name = "MainForm"
Option Compare Text

Private Type Point
    X As Long
    Y As Long
End Type

Public Sub Visit(ByVal items As Collection)
    Dim item As Variant
10  For Each item In items
        With item
            Select Case .Value
                Case &HFF: GoSub LogItem
                Case &O77: Debug.Print "octal"
            End Select
        End With
    Next item
    Exit Sub
LogItem:
    Rem Legacy subroutine
    Debug.Print item.Value _
        & "!"
    Return
End Sub
