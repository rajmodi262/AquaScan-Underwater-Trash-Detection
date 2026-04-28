@echo off
echo.
echo  ========================================
echo     AquaScan - Starting...
echo  ========================================
echo.

:: Start backend
echo  [1/2] Starting backend server...
cd /d "%~dp0backend"
start "AquaScan Backend" cmd /k "python main.py"

:: Wait for backend to be ready
echo  Waiting for backend to initialize...
timeout /t 5 /nobreak >nul

:: Start frontend
echo  [2/2] Starting frontend dev server...
cd /d "%~dp0frontend"
start "AquaScan Frontend" cmd /k "npm run dev"

timeout /t 5 /nobreak >nul

echo.
echo  ========================================
echo    AquaScan is running!
echo    Frontend: http://localhost:5173
echo    Backend:  http://localhost:8899
echo  ========================================
echo.

start http://localhost:5173
