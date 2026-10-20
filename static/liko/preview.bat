@echo off
setlocal

rem ============================================================
rem  LikoLiko static preview (no server logic, just file serving)
rem    opens http://localhost:8000
rem ============================================================

set NODE=C:\Users\Earture\Desktop\audio-world\runtime\node-v24.22.0-win-x64\node.exe
if not exist "%NODE%" set NODE=node

if not exist "%~dp0serve.js" (
    echo [error] serve.js not found next to this bat file.
    pause
    exit /b 1
)

echo LikoLiko static preview: http://localhost:8000
echo Change the data source in js\config.js.
echo.

"%NODE%" "%~dp0serve.js"
pause
