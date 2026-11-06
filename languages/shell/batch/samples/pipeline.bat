@echo off
setlocal enabledelayedexpansion
for /f "tokens=1,2 delims==" %%A in ('set PATH') do (
  set "KEY=%%A"
  set "VALUE=%%B"
  echo !KEY!: !VALUE:~0,32!
)
set "SLUG=%NAME: =_%"
if /i "%SLUG%" neq "" echo %SLUG% ^& echo ready
if defined TEMP pushd "%TEMP%" && dir /b | findstr /i ".log" >> "%~dp0logs.txt"
popd
