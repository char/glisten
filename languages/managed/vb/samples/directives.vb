#Const DEBUG = True
#If DEBUG Then
#Region "Dates and attributes"
<Assembly: CLSCompliant(True)>
Public Module Dates
    Public Function IsRecent(value As Date) As Boolean
        Dim cutoff As Date = #1/1/2024#
        Return value >= cutoff AndAlso _
            value < #12/31/2030#
    End Function
End Module
#End Region
#End If
