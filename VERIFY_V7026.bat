@echo off
setlocal
cd /d "%~dp0"
echo [1/6] TypeScript lint...
call npm run lint || goto :fail
echo [2/6] Fallback discovery parser...
call npx tsx scripts\audit-v7026-fallback-discovery.ts || goto :fail
echo [3/6] Provider access regression...
call npx tsx scripts\audit-v7024-provider-access-semantics.ts || goto :fail
echo [4/6] Probe contract compatibility...
call node scripts\audit-v7025-probe-contract-compatibility.mjs || goto :fail
echo [5/6] Performance predeploy...
call node scripts\audit-v6122-performance-predeploy.mjs || goto :fail
echo [6/6] LIVE provider path - NO MOCK...
call npx tsx scripts\audit-v7024-live-provider-connectivity.ts || goto :livefail
echo.
echo V7.0.2.6 VERIFY PASS - INCLUDING LIVE PROVIDER PATH.
exit /b 0
:livefail
echo.
echo V7.0.2.6 STATIC/REGRESSION PASSED, LIVE PROVIDER PATH FAILED OR REMAINS BLOCKED.
exit /b 2
:fail
echo.
echo V7.0.2.6 VERIFY FAILED.
exit /b 1
