#!/bin/bash
# Hamara-Rozgar Standalone APK Builder (Mac/Linux)
echo "========================================="
echo "   Hamara-Rozgar Standalone APK Builder   "
echo "========================================="

echo "1. Building React Web Bundle..."
npm run build

echo "2. Syncing Assets with Capacitor Android Platform..."
npx cap sync android

echo "3. Compiling Release APK via Gradle Wrapper..."
cd android
./gradlew assembleRelease

echo ""
echo "========================================="
echo "   Compilation Successful! 🎉            "
echo "========================================="
echo "Your standalone release APK is located at:"
echo "android/app/build/outputs/apk/release/app-release-unsigned.apk"
echo "========================================="
