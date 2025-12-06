#!/bin/bash
# RSC Detector Build Script
# Generates installable packages for Chrome and Firefox
#
# Usage:
#   bash build.sh         # Development build (unsigned)
#   bash build.sh dev     # Development build (unsigned)
#   bash build.sh release # Release build (signed)

set -e

# Parse arguments
MODE="${1:-dev}"

# Get Windows-style path for PowerShell compatibility
ROOT="$(cd "$(dirname "$0")" && pwd)"
WIN_ROOT="$(cygpath -w "$ROOT")"

# Set output directory based on mode
if [ "$MODE" = "release" ]; then
    DIST="$ROOT/dist/release"
    BUILD_TITLE="Release Build (Signed)"
else
    DIST="$ROOT/dist/dev"
    BUILD_TITLE="Development Build"
    MODE="dev"
fi

WIN_DIST="$(cygpath -w "$DIST" 2>/dev/null || echo "$WIN_ROOT\\dist\\$MODE")"

# Load .env.local if exists (for Firefox signing)
if [ -f "$ROOT/.env.local" ]; then
    set -a
    source "$ROOT/.env.local"
    set +a
fi

# Clean and create dist directory
rm -rf "$DIST"
mkdir -p "$DIST"

echo "======================================"
echo "  RSC Detector - $BUILD_TITLE"
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
echo "[1/3] Building Chrome .zip ..."

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

echo "  -> $MODE/rsc-security-scanner.zip"

# === Build Firefox Version ===
echo "[2/3] Building Firefox .xpi ..."

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

# === Handle Firefox packaging based on mode ===
echo "[3/3] Packaging Firefox extension ..."

if [ "$MODE" = "dev" ]; then
    # Development mode: create unsigned xpi
    WIN_FIREFOX_TEMP="$(cygpath -w "$FIREFOX_TEMP")"
    # PowerShell only supports .zip, so create temp .zip first then rename to .xpi
    powershell -Command "Compress-Archive -Path '$WIN_FIREFOX_TEMP\\*' -DestinationPath '$WIN_DIST\\_firefox_temp.zip' -Force"
    mv "$DIST/_firefox_temp.zip" "$DIST/rsc-security-scanner.xpi"
    rm -rf "$FIREFOX_TEMP"
    echo "  -> $MODE/rsc-security-scanner.xpi (unsigned)"
    
elif [ "$MODE" = "release" ]; then
    # Release mode: sign with Mozilla AMO
    if [ -z "$WEB_EXT_API_KEY" ] || [ -z "$WEB_EXT_API_SECRET" ]; then
        echo "  [!] Error: API credentials not found!"
        echo "      Set WEB_EXT_API_KEY and WEB_EXT_API_SECRET in .env.local"
        rm -rf "$FIREFOX_TEMP"
        exit 1
    fi
    
    echo "  Signing with Mozilla AMO..."
    
    # Try to sign, capture output for error handling
    SIGN_OUTPUT=$(npx web-ext sign \
        --source-dir="$FIREFOX_TEMP" \
        --artifacts-dir="$DIST" \
        --api-key="$WEB_EXT_API_KEY" \
        --api-secret="$WEB_EXT_API_SECRET" \
        --channel=unlisted 2>&1) || true
    
    rm -rf "$FIREFOX_TEMP"
    
    # Check if signing succeeded
    SIGNED_XPI=$(ls "$DIST"/*.xpi 2>/dev/null | head -1)
    
    if [ -n "$SIGNED_XPI" ]; then
        mv "$SIGNED_XPI" "$DIST/rsc-security-scanner.xpi"
        echo "  -> release/rsc-security-scanner.xpi (signed ✓)"
    else
        # Signing failed
        if echo "$SIGN_OUTPUT" | grep -q "already exists"; then
            echo ""
            echo "  ❌ Error: Version already signed!"
            echo "     Update 'version' in manifest.firefox.json before releasing."
            echo ""
        else
            echo ""
            echo "  ❌ Signing failed:"
            echo "$SIGN_OUTPUT" | grep -i "error\|fail" | head -5
            echo ""
        fi
        exit 1
    fi
fi

# === Summary ===
echo ""
echo "======================================"
echo "  Done! Output: dist/$MODE/"
echo "======================================"
echo ""
ls -1 "$DIST" | sed "s/^/  $MODE\//"
echo ""

if [ "$MODE" = "dev" ]; then
    echo "Note: Development builds are unsigned."
    echo "      Use 'pnpm run build:release' for signed Firefox extension."
    echo ""
fi
