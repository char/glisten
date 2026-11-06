On Error Resume Next
Dim answer
answer = Eval("2 + 2")
Execute "answer = answer + 1"
Select Case answer
    Case 5
        WScript.Echo "It is ""five"""
    Case Else
        Rem An unexpected value
        WScript.Quit 1
End Select
