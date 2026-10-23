@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Brak Node.js. Zainstaluj Node 22 lub nowszy z https://nodejs.org
  echo i uruchom ten plik ponownie.
  echo.
  echo Jesli nie chcesz instalowac Node, pobierz gotowe Wydatki.exe
  echo z Releases na GitHubie: rozpakuj zip i kliknij Wydatki.exe.
  pause
  exit /b 1
)

node -e "const n=process.versions.node.split('.').map(Number); if (n[0]<22) { console.error('Potrzebny Node 22 lub nowszy (masz '+process.versions.node+').'); process.exit(1); }"
if errorlevel 1 (
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Pierwsze uruchomienie: instaluje zaleznosci...
  call npm install
  if errorlevel 1 (
    echo Nie udalo sie zainstalowac zaleznosci.
    pause
    exit /b 1
  )
)

if not exist "dist\index.html" (
  echo Buduje interfejs...
  call npm run build
  if errorlevel 1 (
    echo Nie udalo sie zbudowac aplikacji.
    pause
    exit /b 1
  )
)

set WYDATKI_DESKTOP=1
node server\main.ts
if errorlevel 1 pause
