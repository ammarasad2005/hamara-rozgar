@echo off
rem Hamara-Rozgar Standalone APK Builder (Windows)
echo =========================================
echo    Hamara-Rozgar Standalone APK Builder   
echo =========================================

echo 1. Building React Web Bundle...
call npm run build

echo 2. Syncing Assets with Capacitor Android Platform...
call npx cap sync android

echo 3. Compiling Release APK via Gradle Wrapper...
cd android
call gradlew.bat assembleRelease

echo.
echo =========================================
echo    Compilation Successful! [celebrate]            
echo =========================================
echo Your standalone release APK is located at:
echo android\app\build\outputs\apk\release\app-release-unsigned.apk
echo =========================================
pause
