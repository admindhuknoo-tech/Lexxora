@echo off
setlocal
cd /d "%~dp0"

echo [1/3] Full TypeScript lint - includes all historical audit scripts...
call npm run lint || goto :fail

echo [2/3] Probe contract compatibility regression...
call node scripts\audit-v7025-probe-contract-compatibility.mjs || goto :fail

echo [3/3] Continue V7.0.2.4 verification including LIVE provider path...
call VERIFY_V7024.bat
if errorlevel 1 goto :v7024fail

echo.
echo V7.0.2.5 VERIFY PASS - historical probe contract and V7.0.2.4 suite passed.
exit /b 0

:v7024fail
echo.
echo V7.0.2.5 STATIC CONTRACT FIX PASSED, BUT V7.0.2.4 VERIFY DID NOT FULLY PASS.
echo Inspect the V7.0.2.4 output. A live provider 403 may be REACHABLE_BLOCKED rather than network failure.
exit /b 2

:fail
echo.
echo V7.0.2.5 VERIFY FAILED.
exit /b 1
