Imports System.Threading.Tasks

Module App
    Async Function DescribeAsync(name As String) As Task(Of String)
        Await Task.Delay(10)
        Dim value = &HFFUI + &B10 + 12_345D
        Dim message = $"Hello, {name.ToUpper()}! Value: {value:N2}"
        Dim quote = "a ""quoted"" value"
        Dim letter As Char = "x"c
        ' Apostrophe comment
        ’ Smart apostrophe comment
        REM Another comment
        Return message
    End Function
End Module
