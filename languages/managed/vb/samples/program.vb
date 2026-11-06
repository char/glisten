Option Strict On
Imports System

<Serializable>
Public Class Counter
    Private _count As Integer = 0

    Public Sub Increment(<Obsolete> ByVal amount As Integer)
        If amount > 0 Then
            _count += amount
        End If
    End Sub

    Public ReadOnly Property Value As Integer
        Get
            Return _count
        End Get
    End Property
End Class
