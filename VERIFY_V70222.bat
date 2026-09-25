@echo off
setlocal
cd /d "%~dp0.."
echo [1/4] TypeScript lint/typecheck...
call npm run lint
if errorlevel 1 exit /b 1

echo [2/4] Production build...
call npm run build
if errorlevel 1 exit /b 1

echo [3/4] Closure regression audit...
call npx tsx scripts\audit-v70222-closure-batch.ts
if errorlevel 1 exit /b 1

echo [4/4] Cross-case regression audit...
call npx tsx scripts\audit-v70222-cross-case.ts
if errorlevel 1 exit /b 1

echo.
echo V7.0.2.22 verification completed successfully.
endlocal
