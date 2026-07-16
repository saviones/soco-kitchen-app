@echo off
title SoCo Kitchen App
cd /d "%~dp0"
echo.
echo   =============================================
echo    SOUTHERN COMFORT KITCHEN  --  phone app
echo    Comfort In Every Bite!
echo   =============================================
echo.
where python >nul 2>nul
if %errorlevel%==0 (
  echo   Serving at http://localhost:8737  ... close this window to stop.
  start "" http://localhost:8737
  python -m http.server 8737
) else (
  where py >nul 2>nul
  if %errorlevel%==0 (
    echo   Serving at http://localhost:8737  ... close this window to stop.
    start "" http://localhost:8737
    py -3 -m http.server 8737
  ) else (
    echo   Python not found - opening directly in your browser.
    start "" "%~dp0index.html"
  )
)
