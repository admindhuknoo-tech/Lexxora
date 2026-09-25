@echo off
setlocal
cd /d "%~dp0"

echo [1/10] TypeScript lint...
call npm run lint || goto :fail

echo [2/10] Provider access semantics...
call npx tsx scripts\audit-v7024-provider-access-semantics.ts || goto :fail

echo [3/10] Authority funnel regression...
call npx tsx scripts\audit-v7023-authority-funnel.ts || goto :fail

echo [4/10] End-to-end case pipeline...
call npx tsx scripts\audit-v7023-case-pipeline.ts || goto :fail

echo [5/10] Query scheduling...
call npx tsx scripts\audit-query-scheduling-v679.ts || goto :fail

echo [6/10] Authority query...
call npx tsx scripts\audit-authority-query-v6710.ts || goto :fail

echo [7/10] Topical policy...
call npx tsx scripts\audit-topical-policy-v678.ts || goto :fail

echo [8/10] Canonical authority contracts...
call npx tsx scripts\audit-canonical-authority-contract-v681.ts || goto :fail
call npx tsx scripts\audit-canonical-runtime-shape-v682.ts || goto :fail

echo [9/10] Performance predeploy...
call node scripts\audit-v6122-performance-predeploy.mjs || goto :fail

echo [10/10] LIVE provider path - NO MOCK...
call npx tsx scripts\audit-v7024-live-provider-connectivity.ts
if errorlevel 1 goto :livefail

echo.
echo V7.0.2.4 VERIFY PASS - including LIVE provider path.
exit /b 0

:livefail
echo.
echo STATIC/REGRESSION PASSED, BUT LIVE PROVIDER PATH IS NOT FULLY USABLE.
echo HTTP 401/403/429 means REACHABLE_BLOCKED, not DNS/firewall failure.
echo Do not claim live retrieval release-ready until the audit reports all providers usable.
exit /b 2

:fail
echo.
echo V7.0.2.4 VERIFY FAILED.
exit /b 1
