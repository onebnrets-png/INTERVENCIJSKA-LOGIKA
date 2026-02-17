@echo off
cd /d "%~dp0"
chcp 65001 >nul 2>nul

echo ========================================
echo   EURO-OFFICE: EU Project Idea Draft
echo   INFINITA d.o.o. (c) 2026
echo   React 19 + Vite 6 + Supabase
echo ========================================
echo.

REM ----------------------------------------
REM 1. CHECK NODE.JS
REM ----------------------------------------
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js ni namescen!
    echo         Prenesi ga iz https://nodejs.org/ (LTS verzija 18+)
    echo.
    pause
    exit /b 1
)

REM Check Node version (minimum 18 required for React 19 + Vite 6)
for /f "tokens=1 delims=v." %%a in ('node --version') do set NODE_MAJOR=%%a
for /f "tokens=2 delims=v." %%a in ('node --version') do set NODE_MAJOR=%%a
if %NODE_MAJOR% LSS 18 (
    echo [ERROR] Node.js verzija je prestara!
    echo         Potrebna je verzija 18+, trenutna:
    call node --version
    echo         Prenesi novo verzijo iz https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js:
call node --version
echo.

REM ----------------------------------------
REM 2. CHECK .env FILE (Supabase credentials — optional with fallback)
REM ----------------------------------------
if not exist ".env" (
    echo [INFO] .env datoteka ni najdena — uporabljam privzete Supabase podatke.
    echo.
    echo        Za lasten Supabase projekt ustvari .env z vsebino:
    echo.
    echo        VITE_SUPABASE_URL=https://tvoj-projekt.supabase.co
    echo        VITE_SUPABASE_ANON_KEY=tvoj-anon-key
    echo.
    echo        (Podatke najdes v Supabase Dashboard -^> Settings -^> API)
    echo.
) else (
    echo [OK] .env datoteka najdena
)
echo.

REM ----------------------------------------
REM 3. INSTALL DEPENDENCIES
REM ----------------------------------------
if not exist "node_modules" (
    echo ========================================
    echo   Namescanje odvisnosti...
    echo   (ob prvem zagonu traja 1-2 min)
    echo ========================================
    echo.
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo [ERROR] npm install ni uspel!
        echo         Preveri internetno povezavo in poskusi znova.
        echo.
        pause
        exit /b 1
    )
    echo.
    echo [OK] Odvisnosti uspesno namescene!
    echo.
)

REM Check critical dependencies
set MISSING_DEPS=0

if not exist "node_modules\@supabase\supabase-js" (
    echo [!] Manjka: @supabase/supabase-js
    set MISSING_DEPS=1
)
if not exist "node_modules\recharts" (
    echo [!] Manjka: recharts
    set MISSING_DEPS=1
)
if not exist "node_modules\typescript" (
    echo [!] Manjka: typescript
    set MISSING_DEPS=1
)

if %MISSING_DEPS% EQU 1 (
    echo.
    echo Ponovna namestitev odvisnosti...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] npm install ni uspel!
        pause
        exit /b 1
    )
    echo [OK] Odvisnosti dopolnjene
    echo.
)

REM ----------------------------------------
REM 4. CHECK PORT 3000
REM ----------------------------------------
netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [OPOZORILO] Port 3000 je ze zaseden!
    echo.
    echo   Moznosti:
    echo   1. Zapri aplikacijo, ki uporablja port 3000
    echo   2. Ali pa se Vite ze izvaja - odpri http://localhost:3000
    echo.
    choice /C DN /M "Nadaljujem vseeno (D=Da, N=Ne)?"
    if %ERRORLEVEL% EQU 2 (
        echo Prekinjam.
        timeout /t 2 /nobreak >nul
        exit /b 0
    )
    echo.
)

REM ----------------------------------------
REM 5. START VITE DEV SERVER
REM ----------------------------------------
echo ========================================
echo   Zaganjam razvojni streznik...
echo   (735+ modulov, pocakaj ~8s)
echo ========================================
echo.

REM Save PID for clean shutdown
start /B cmd /c "npm run dev > vite_output.tmp 2>&1"

REM Wait for Vite to compile (735+ modules need time)
echo Cakam, da se Vite zgradi...
set WAIT_COUNT=0

:WAIT_LOOP
timeout /t 2 /nobreak >nul
set /a WAIT_COUNT+=2

netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul 2>nul
if %ERRORLEVEL% EQU 0 goto SERVER_READY

if %WAIT_COUNT% GEQ 30 (
    echo.
    echo [ERROR] Vite se ni zagnal v 30 sekundah!
    echo         Preveri vite_output.tmp za napake.
    echo.
    pause
    goto CLEANUP
)

echo   ... se zaganja (%WAIT_COUNT%s)
goto WAIT_LOOP

:SERVER_READY
echo.
echo [OK] Vite streznik tece na http://localhost:3000
echo.

REM Open browser
start http://localhost:3000

echo ========================================
echo.
echo   EURO-OFFICE se izvaja!
echo   Brskalnik odprt na http://localhost:3000
echo.
echo   Pritisni KATEROKOLI tipko za ZAUSTAVITEV.
echo.
echo ========================================

pause >nul

REM ----------------------------------------
REM 6. GRACEFUL SHUTDOWN
REM ----------------------------------------
:CLEANUP
echo.
echo Zaustavljam streznik...

REM Kill only the Node process on port 3000 (not all Node processes!)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%p >nul 2>nul
)

REM Clean up temp file
if exist "vite_output.tmp" del /q "vite_output.tmp"

echo.
echo [OK] Streznik zaustavljen. Nasvidenje!
timeout /t 2 /nobreak >nul
exit /b 0
