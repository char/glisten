Option Explicit
Class Greeting
    Private mName
    Public Property Let Name(value)
        mName = value
    End Property
    Public Function SayHello()
        SayHello = "Hello, " & mName
    End Function
End Class
Dim g
Set g = New Greeting
g.Name = "Ada"
WScript.Echo g.SayHello()
