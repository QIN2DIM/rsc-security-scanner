#!/bin/bash
# RSC Detector Build Script
# Generates installable packages for Chrome and Firefox

set -e

# Get Windows-style path for PowerShell compatibility
ROOT="$(cd "$(dirname "$0")" && pwd)"
WIN_ROOT="$(cygpath -w "$ROOT")"
DIST="$ROOT/dist"
WIN_DIST="$(cygpath -w "$DIST" 2>/dev/null || echo "$WIN_ROOT\\dist")"

# Clean and create dist directory
rm -rf "$DIST"
mkdir -p "$DIST"

echo "======================================"
echo "  RSC Detector Build Script"
echo "======================================"
echo ""

# Files to include
FILES=(
    "manifest.json"
    "content.js"
    "popup.js"
    "popup.html"
    "background.js"
    "rules.json"
)

# === Build Chrome Version ===
echo "[1/2] Building Chrome .zip ..."

CHROME_TEMP="$DIST/_chrome_temp"
mkdir -p "$CHROME_TEMP"

for file in "${FILES[@]}"; do
    [ -f "$ROOT/src/$file" ] && cp "$ROOT/src/$file" "$CHROME_TEMP/"
done
[ -d "$ROOT/images" ] && cp -r "$ROOT/images" "$CHROME_TEMP/"
[ -d "$ROOT/icons" ] && cp -r "$ROOT/icons" "$CHROME_TEMP/"

WIN_CHROME_TEMP="$(cygpath -w "$CHROME_TEMP")"
powershell -Command "Compress-Archive -Path '$WIN_CHROME_TEMP\\*' -DestinationPath '$WIN_DIST\\rsc-security-scanner.zip' -Force"
rm -rf "$CHROME_TEMP"

echo "  -> dist/rsc-security-scanner.zip"

# === Build Firefox Version ===
echo "[2/2] Building Firefox .xpi ..."

FIREFOX_TEMP="$DIST/_firefox_temp"
mkdir -p "$FIREFOX_TEMP"

for file in "${FILES[@]}"; do
    [ "$file" = "manifest.json" ] && continue
    [ -f "$ROOT/src/$file" ] && cp "$ROOT/src/$file" "$FIREFOX_TEMP/"
done

# Use Firefox manifest
if [ -f "$ROOT/src/manifest.firefox.json" ]; then
    cp "$ROOT/src/manifest.firefox.json" "$FIREFOX_TEMP/manifest.json"
else
    echo "  [!] manifest.firefox.json not found!"
    cp "$ROOT/src/manifest.json" "$FIREFOX_TEMP/manifest.json"
fi

[ -d "$ROOT/images" ] && cp -r "$ROOT/images" "$FIREFOX_TEMP/"
[ -d "$ROOT/icons" ] && cp -r "$ROOT/icons" "$FIREFOX_TEMP/"

WIN_FIREFOX_TEMP="$(cygpath -w "$FIREFOX_TEMP")"
powershell -Command "Compress-Archive -Path '$WIN_FIREFOX_TEMP\\*' -DestinationPath '$WIN_DIST\\RSC_Detector_Firefox.zip' -Force"
mv "$DIST/RSC_Detector_Firefox.zip" "$DIST/rsc-security-scanner.xpi"
rm -rf "$FIREFOX_TEMP"

echo "  -> dist/rsc-security-scanner.xpi"

# === Summary ===
echo ""
echo "======================================"
echo "  Done!"
echo "======================================"
echo ""
echo "dist/"
echo "  rsc-security-scanner.zip   <- Drag to chrome://extensions/"
echo "  rsc-security-scanner.xpi  <- Drag to about:addons"
echo ""
