@echo off
cd /d "%~dp0"

REM === Prevent window from closing on any error ===
if "%~1"=="" (
    cmd /k "%~f0" RUNNING
    exit /b
)

echo ========================================
echo   EURO-OFFICE: EU Project Idea Draft
echo   INFINITA d.o.o. (c) 2026
echo   React 19 + Vite 6 + Supabase
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js ni namescen!
    echo Prenesi ga iz https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo Node.js found:
call node --version
echo.

REM ========================================
REM   Clean Vite cache for fresh start
REM ========================================
if exist "node_modules\.vite" (
    echo Cleaning Vite cache...
    rmdir /s /q "node_modules\.vite"
    echo Vite cache cleared.
    echo.
)
if exist "dist" (
    echo Cleaning old build output...
    rmdir /s /q "dist"
    echo Build output cleared.
    echo.
)
if exist "vite_output.tmp" (
    del /f /q "vite_output.tmp"
)

REM Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo ========================================
    echo   Installing dependencies...
    echo   (this may take a minute on first run)
    echo ========================================
    echo.
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo ERROR: npm install ni uspel!
        echo Preveri internetno povezavo in poskusi znova.
        echo.
        pause
        exit /b 1
    )
    echo.
    echo Dependencies installed successfully!
    echo.
)

REM ========================================
REM   Check critical dependencies
REM ========================================
set "MISSING=0"

if not exist "node_modules\@supabase\supabase-js" (
    echo [MISSING] @supabase/supabase-js
    set "MISSING=1"
)
if not exist "node_modules\recharts" (
    echo [MISSING] recharts
    set "MISSING=1"
)
if not exist "node_modules\react" (
    echo [MISSING] react
    set "MISSING=1"
)
if not exist "node_modules\docx" (
    echo [MISSING] docx
    set "MISSING=1"
)
if not exist "node_modules\jszip" (
    echo [MISSING] jszip
    set "MISSING=1"
)
if not exist "node_modules\html2canvas" (
    echo [MISSING] html2canvas
    set "MISSING=1"
)
if not exist "node_modules\qrcode" (
    echo [MISSING] qrcode
    set "MISSING=1"
)
if not exist "node_modules\@google\genai" (
    echo [MISSING] @google/genai
    set "MISSING=1"
)

if "%MISSING%"=="1" (
    echo.
    echo ========================================
    echo   Installing missing dependencies...
    echo ========================================
    echo.
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo ERROR: npm install ni uspel!
        echo Preveri internetno povezavo in poskusi znova.
        echo.
        pause
        exit /b 1
    )
    REM === Ensure jszip is installed (not in package.json yet) ===
    if not exist "node_modules\jszip" (
        echo Installing jszip separately...
        call npm install jszip
    )
    echo.
    echo All dependencies installed!
    echo.
) else (
    echo All critical dependencies OK.
    echo.
)

REM === Final safety check: jszip (dynamically imported, may not be in package.json) ===
if not exist "node_modules\jszip" (
    echo [FIX] jszip not found - installing...
    call npm install jszip
    echo jszip installed.
    echo.
)

REM Optional: .env info (NOT required - Supabase is hardcoded, AI keys via Settings)
if not exist ".env" (
    echo [INFO] .env datoteka ni najdena - to je OK.
    echo        Supabase credentials so v supabaseClient.ts.
    echo        AI API kljuce nastavi v aplikaciji pod Settings.
    echo.
)

echo ========================================
echo   Starting development server...
echo   (clean Vite cache = fresh build)
echo ========================================
echo.

REM Start the dev server in a separate window
start "EURO-OFFICE Vite Server" cmd /c "npm run dev"

REM Wait for Vite to start
echo Waiting for Vite server to start...
timeout /t 8 /nobreak >nul

REM Open browser on port 3000 (configured in vite.config.ts)
start http://localhost:3000

echo.
echo ========================================
echo   Browser opened at http://localhost:3000
echo.
echo   App is running!
echo   Press any key to STOP the server.
echo ========================================
echo.

pause

REM Kill node processes when user presses a key
taskkill /F /IM node.exe >nul 2>nul
echo.
echo Server stopped. Goodbye!
timeout /t 2 /nobreak >nul