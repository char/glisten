VERSION 1.0 CLASS
Attribute VB_Name = "Customer"
Option Explicit
Private mName As String

Public Property Get Name() As String
    Name = mName
End Property

Public Property Let Name(ByVal Value As String)
    mName = Value
End Property

Public Function DisplayName$()
    DisplayName = mName & " since " & #1/1/2020#
End Function
