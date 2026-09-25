@echo off
setlocal
cd /d "%~dp0"

echo [LexiCore V7.0.2.2] Root-safe verification
if not exist package.json (
  echo FAIL: package.json not found. Extract this ZIP CONTENTS directly into the LexiCore project root.
  exit /b 10
)
if not exist server\caseAnalysis.ts (
  echo FAIL: server\caseAnalysis.ts not found after extraction.
  exit /b 11
)
if not exist server\officialLawRetriever.ts (
  echo FAIL: server\officialLawRetriever.ts not found after extraction.
  exit /b 12
)

echo.
echo [1/9] TypeScript integration
call npm run lint || exit /b 20

echo.
echo [2/9] V7.0.2 judicial retrieval
call npx tsx scripts\audit-v702-judicial-authority-retrieval.ts || exit /b 21

echo.
echo [3/9] Query scheduling
call npx tsx scripts\audit-query-scheduling-v679.ts || exit /b 22

echo.
echo [4/9] Authority query
call npx tsx scripts\audit-authority-query-v6710.ts || exit /b 23

echo.
echo [5/9] Query decomposition
call npx tsx scripts\audit-query-decomposition-v677.ts || exit /b 24

echo.
echo [6/9] Topical policy
call npx tsx scripts\audit-topical-policy-v678.ts || exit /b 25

echo.
echo [7/9] Canonical authority regressions
call npx tsx scripts\audit-canonical-seed-v680.ts || exit /b 26
call npx tsx scripts\audit-canonical-authority-v680b.ts || exit /b 27
call npx tsx scripts\audit-canonical-authority-seed-v6712.ts || exit /b 28

echo.
echo [8/9] Performance predeploy
call node scripts\audit-v6122-performance-predeploy.mjs || exit /b 29

echo.
echo STATIC/REGRESSION GATES: PASS

echo.
echo [9/9] LIVE official-provider connectivity - REAL NETWORK, NO MOCK
call npx tsx scripts\audit-v7021-live-provider-connectivity.ts
if errorlevel 1 (
  echo.
  echo LIVE CONNECTIVITY: FAIL/UNVERIFIED. Do NOT relabel this as PASS.
  echo Check DNS, proxy, firewall, or provider reachability, then rerun this file.
  exit /b 30
)

echo.
echo LIVE CONNECTIVITY: PASS
exit /b 0
