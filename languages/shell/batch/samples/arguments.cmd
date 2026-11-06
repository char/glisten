@ECHO OFF
:: Argument processing and a subroutine
IF "%~1"=="" GOTO :usage
SET /P "NAME=Enter name: "
SET /A COUNT=1+2*3
CALL :show "%NAME%" %COUNT%
GOTO :EOF

:show
ECHO Hello, %~1! Count=%2
EXIT /B 0

:usage
ECHO Usage: %~nx0 name
EXIT /B 1
