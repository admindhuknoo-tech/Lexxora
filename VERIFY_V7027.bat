@echo off
setlocal
cd /d %~dp0

echo [1/6] TypeScript lint...
call npm run lint || goto :fail

echo [2/6] V7.0.2.7 official aggregator audit...
call npx tsx scripts\audit-v7027-official-aggregator.ts || goto :fail

echo [3/6] V7.0.2.6 fallback parser regression...
call npx tsx scripts\audit-v7026-fallback-discovery.ts || goto :fail

echo [4/6] Provider access semantics regression...
call npx tsx scripts\audit-v7024-provider-access-semantics.ts || goto :fail

echo [5/6] Performance predeploy...
call node scripts\audit-v6122-performance-predeploy.mjs || goto :fail

echo [6/6] LIVE provider path - NO MOCK...
call npx tsx scripts\audit-v7024-live-provider-connectivity.ts
if errorlevel 1 goto :livefail

echo.
echo V7.0.2.7 VERIFY PASS INCLUDING LIVE PROVIDERS.
exit /b 0

:livefail
echo.
echo V7.0.2.7 STATIC/REGRESSION PASSED, BUT LIVE PROVIDER PATH FAILED OR REMAINS BLOCKED.
exit /b 2

:fail
echo.
echo V7.0.2.7 VERIFY FAILED.
exit /b 1
