@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   🚀 Git Push - Logistics Dashboard
echo ============================================
echo.

:: Show current status
echo 📋 Archivos modificados:
echo --------------------------------------------
git status --short
echo --------------------------------------------
echo.

:: Ask for commit message
set /p MSG="💬 Mensaje del commit (Enter para auto): "
if "%MSG%"=="" (
    for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set FECHA=%%c-%%a-%%b
    for /f "tokens=1-2 delims=: " %%a in ('time /t') do set HORA=%%a:%%b
    set MSG=update %FECHA% %HORA%
)

echo.
echo ⏳ Subiendo cambios...

git add -A
git commit -m "%MSG%"
git push origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ ¡Cambios subidos exitosamente!
) else (
    echo.
    echo ❌ Error al subir. Revisa los mensajes arriba.
)

echo.
pause
