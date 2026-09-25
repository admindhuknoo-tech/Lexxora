@echo off
setlocal
cd /d "%~dp0"

echo [1/8] TypeScript lint...
call npm run lint || goto :fail

echo [2/8] V7.0.2.3 authority funnel...
call npx tsx scripts\audit-v7023-authority-funnel.ts || goto :fail

echo [3/8] V7.0.2.3 end-to-end case pipeline...
call npx tsx scripts\audit-v7023-case-pipeline.ts || goto :fail

echo [4/8] Query scheduling regression...
call npx tsx scripts\audit-query-scheduling-v679.ts || goto :fail

echo [5/8] Authority query regression...
call npx tsx scripts\audit-authority-query-v6710.ts || goto :fail

echo [6/8] Topical policy regression...
call npx tsx scripts\audit-topical-policy-v678.ts || goto :fail

echo [7/8] Performance predeploy...
call node scripts\audit-v6122-performance-predeploy.mjs || goto :fail

echo [8/8] LIVE official provider connectivity - NO MOCK...
call npx tsx scripts\audit-v7023-live-provider-connectivity.ts || goto :livefail

echo.
echo V7.0.2.3 VERIFY: PASS INCLUDING LIVE CONNECTIVITY
exit /b 0

:livefail
echo.
echo V7.0.2.3 STATIC/REGRESSION MAY HAVE PASSED, BUT LIVE CONNECTIVITY FAILED.
echo DO NOT CLAIM RELEASE-READY UNTIL THIS LIVE STEP PASSES.
exit /b 2

:fail
echo.
echo V7.0.2.3 VERIFY: FAIL
exit /b 1
