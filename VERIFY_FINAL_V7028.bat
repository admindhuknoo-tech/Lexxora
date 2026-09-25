@echo off
setlocal
cd /d "%~dp0"
echo [1/5] TypeScript lint...
call npm run lint || goto :fail

echo [2/5] Official authority index...
call npx tsx scripts\audit-v7028-official-authority-index.ts || goto :fail

echo [3/5] Local-first blocked-provider integration...
call npx tsx scripts\audit-v7028-local-first-integration.ts || goto :fail

echo [4/5] Performance predeploy...
node scripts\audit-v6122-performance-predeploy.mjs || goto :fail

echo [5/5] Operational readiness - live enrichment + local index...
call npx tsx scripts\audit-v7028-operational-readiness.ts || goto :fail

echo.
echo V7.0.2.8 FINAL VERIFY PASSED.
exit /b 0
:fail
echo.
echo V7.0.2.8 FINAL VERIFY FAILED.
exit /b 1
