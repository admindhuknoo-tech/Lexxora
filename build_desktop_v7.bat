@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo ============================================================
echo  LexiCore Desktop V7 - Canonical Electron Build
echo ============================================================

rem Core / regression gates
call npm run lint || exit /b 1
call npm run audit:group-a || exit /b 1
call npm run audit:group-b || exit /b 1
call npm run audit:group-c || exit /b 1
call npm run audit:group-d || exit /b 1
call npm run audit:consolidation || exit /b 1
call npm run audit:performance || exit /b 1

rem IMPORTANT: Desktop and Web are separate V7 release tracks.
rem Desktop packaging must be gated only by common + desktop checks.
node scripts\audit-v7-release.mjs desktop || exit /b 1

rem Build frozen-core application runtime and prepare Electron payload.
call npm run build || exit /b 1
node scripts\prepare-electron-runtime.mjs || exit /b 1

if exist "dist\installer-electron" rmdir /s /q "dist\installer-electron"

pushd desktop-electron || exit /b 1
if exist package-lock.json (
  call npm ci --no-audit --no-fund || (popd & exit /b 1)
) else (
  call npm install --no-audit --no-fund || (popd & exit /b 1)
)
call npm run pack:dir || (popd & exit /b 1)
popd

node scripts\verify-electron-packaged-runtime.mjs || exit /b 1

pushd desktop-electron || exit /b 1
call npm run dist || (popd & exit /b 1)
popd

node scripts\verify-electron-packaged-runtime.mjs || exit /b 1
if not exist "dist\installer-electron\LexiCore-Desktop-Setup-v7.0.exe" (
  echo ERROR: installer artifact tidak ditemukan.
  exit /b 1
)

echo.
echo PASS: V7 Desktop release gate verified.
echo PASS: Packaged runtime dependencies verified.
echo PASS: Packaged local server startup verified.
echo PASS: dist\installer-electron\LexiCore-Desktop-Setup-v7.0.exe
endlocal
