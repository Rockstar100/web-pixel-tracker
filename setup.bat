@echo off
REM Quick Start Script for Seleric Tracker with Umami Integration (Windows)
REM This script helps you set up and run the development environment

setlocal enabledelayedexpansion

REM Configuration
set DEFAULT_LOCAL_PORT=39351
set DEFAULT_NGROK_API=http://localhost:4040/api/tunnels

REM Color codes (Windows 10+)
set "RESET=[0m"
set "BLUE=[34m"
set "GREEN=[32m"
set "YELLOW=[33m"
set "RED=[31m"

echo.
echo %BLUE%================================================%RESET%
echo %BLUE%Seleric Tracker + Umami Integration Setup%RESET%
echo %BLUE%================================================%RESET%
echo.

REM Check prerequisites
echo %YELLOW%Checking prerequisites...%RESET%

where node >nul 2>nul
if errorlevel 1 (
    echo %RED%✗ Node.js is not installed%RESET%
    echo   Download from: https://nodejs.org
    exit /b 1
) else (
    for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
    echo %GREEN%✓ Node.js !NODE_VERSION!%RESET%
)

where npm >nul 2>nul
if errorlevel 1 (
    echo %RED%✗ npm is not installed%RESET%
    exit /b 1
) else (
    echo %GREEN%✓ npm installed%RESET%
)

where shopify >nul 2>nul
if errorlevel 1 (
    echo %RED%✗ Shopify CLI is not installed%RESET%
    echo   Download from: https://shopify.dev/docs/apps/tools/cli/install
    exit /b 1
) else (
    echo %GREEN%✓ Shopify CLI installed%RESET%
)

if defined DATABASE_URL (
    echo %GREEN%✓ DATABASE_URL configured%RESET%
) else (
    echo %YELLOW%! DATABASE_URL not set%RESET%
    echo   Set your PostgreSQL connection string:
    echo   set DATABASE_URL=postgresql://user:password@localhost:5432/seleric_tracker
)

echo.

REM Handle command line arguments
if "%1"=="" (
    call :print_help
    goto :eof
)

if /i "%1"=="--setup" (
    call :setup_database
    goto :eof
)

if /i "%1"=="--tunnel-url" (
    if "%2"=="" (
        echo %RED%Error: --tunnel-url requires a URL argument%RESET%
        call :print_help
        exit /b 1
    )
    call :setup_database
    if errorlevel 1 exit /b 1
    call :build_extension
    call :start_dev_server "%2"
    goto :eof
)

if /i "%1"=="--tunnel" (
    call :setup_database
    if errorlevel 1 exit /b 1
    call :build_extension
    call :start_tunnel
    goto :eof
)

if /i "%1"=="--help" (
    call :print_help
    goto :eof
)

echo %RED%Unknown option: %1%RESET%
call :print_help
exit /b 1

REM Subroutines

:setup_database
echo %YELLOW%Setting up database...%RESET%

if not defined DATABASE_URL (
    echo %RED%Error: DATABASE_URL not set%RESET%
    echo Please set DATABASE_URL environment variable and try again
    echo Example: set DATABASE_URL=postgresql://user:password@localhost/seleric_tracker
    exit /b 1
)

echo Running Prisma migrations...
call npm run setup
if errorlevel 1 (
    echo %RED%Database setup failed%RESET%
    exit /b 1
)
echo %GREEN%✓ Database setup complete%RESET%
echo.
exit /b 0

:build_extension
echo %YELLOW%Building web pixel extension...%RESET%

cd extensions\seleric-pixel
call npm install --legacy-peer-deps
call npm run build
cd ..\..

echo %GREEN%✓ Extension built%RESET%
echo.
exit /b 0

:start_tunnel
echo %YELLOW%Starting ngrok tunnel...%RESET%

where ngrok >nul 2>nul
if errorlevel 1 (
    echo %RED%Error: ngrok not found%RESET%
    echo.
    echo %YELLOW%Setup ngrok manually:%RESET%
    echo 1. Download from https://ngrok.com/download
    echo 2. Sign up at https://ngrok.com
    echo 3. Configure auth token:
    echo    ngrok config add-authtoken YOUR_TOKEN
    echo 4. Start tunnel:
    echo    ngrok http %DEFAULT_LOCAL_PORT%
    echo.
    exit /b 1
)

start /B ngrok http %DEFAULT_LOCAL_PORT%
timeout /t 3 /nobreak

for /f "delims=" %%i in ('powershell -Command "try { (Invoke-RestMethod -Uri %DEFAULT_NGROK_API% -ErrorAction Stop).tunnels[0].public_url } catch { }"') do set TUNNEL_URL=%%i

if defined TUNNEL_URL (
    echo %GREEN%✓ Tunnel started%RESET%
    echo %BLUE%Tunnel URL: !TUNNEL_URL!%RESET%
    call :start_dev_server "!TUNNEL_URL!"
) else (
    echo %YELLOW%! Could not get tunnel URL%RESET%
    echo   Run ngrok in another terminal: ngrok http %DEFAULT_LOCAL_PORT%
    echo   Then use: script.bat --tunnel-url https://xxxx.ngrok-free.dev
)
exit /b 0

:start_dev_server
echo %YELLOW%Starting development server...%RESET%
echo.

if "%1"=="" (
    echo %YELLOW%Usage Instructions:%RESET%
    echo 1. Start ngrok tunnel in another terminal:
    echo    ngrok http %DEFAULT_LOCAL_PORT%
    echo.
    echo 2. Get the tunnel URL (format: https://xxxx.ngrok-free.dev)
    echo.
    echo 3. Run the development server:
    echo    %0 --tunnel-url https://xxxx.ngrok-free.dev
    echo.
    exit /b 1
)

echo %BLUE%Starting with tunnel URL: %1%RESET%
echo.
echo Important notes:
echo 1. The app will be available at: %1
echo 2. Shopify will validate and register the pixel extension
echo 3. Watch for the login prompt and complete authentication
echo 4. Your development store will be selected
echo.
echo Press Ctrl+C to stop the server
echo.

call npm run dev -- --tunnel-url %1
exit /b 0

:print_help
echo Usage: %0 [OPTIONS]
echo.
echo Options:
echo   --setup              Run setup only (check prerequisites, setup database^)
echo   --tunnel-url URL     Start dev server with specified tunnel URL
echo   --tunnel             Start ngrok tunnel and dev server
echo   --help               Print this help message
echo.
echo Examples:
echo   REM Setup and exit
echo   %0 --setup
echo.
echo   REM Start with specific tunnel
echo   %0 --tunnel-url https://example.ngrok-free.dev
echo.
echo   REM Start tunnel automatically (requires ngrok installed^)
echo   %0 --tunnel
echo.
echo Getting Started:
echo.
echo 1. Set environment variables:
echo    set DATABASE_URL=postgresql://user:password@localhost/seleric_tracker
echo.
echo 2. Check prerequisites:
echo    %0 --help
echo.
echo 3. Setup database:
echo    %0 --setup
echo.
echo 4. Start ngrok tunnel (in another terminal^):
echo    ngrok http %DEFAULT_LOCAL_PORT%
echo.
echo 5. Start dev server with tunnel URL:
echo    %0 --tunnel-url https://xxxx.ngrok-free.dev
echo.
exit /b 0
