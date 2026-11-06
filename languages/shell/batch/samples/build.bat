@echo off
setlocal EnableExtensions EnableDelayedExpansion
rem Build each configuration from the script directory.
set "ROOT=%~dp0"
for %%i in (Debug Release) do (
  echo Building %%i in !ROOT!
  if not exist "!ROOT!build\%%i" mkdir "!ROOT!build\%%i"
  cmake --build "!ROOT!build\%%i" > build.log 2>&1 || exit /b 1
)
endlocal
exit /b 0
