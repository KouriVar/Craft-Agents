#!/bin/bash
set -e

# build-win.sh — Windows NSIS x64 build (counterpart to build-dmg.sh)
#
# On an Apple Silicon host this is a cross-build: electron-builder downloads
# its own wine (run via Rosetta 2) to run the NSIS compiler. Make sure
# Rosetta 2 is installed:
#   softwareupdate --install-rosetta --agree-to-license

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ELECTRON_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$(dirname "$ELECTRON_DIR")")"
source "$SCRIPT_DIR/download-with-retry.sh"

require_path() {
    local path="$1"
    local description="$2"
    local hint="$3"
    if [ ! -e "$path" ]; then
        echo "ERROR: $description not found at $path"
        [ -n "$hint" ] && echo "$hint"
        exit 1
    fi
}

ARCH="x64"
BUN_VERSION="bun-v1.3.9"  # Pinned version for reproducible builds
OUTPUT_DIR="$(craft_pack_output_dir)"
mkdir -p "$OUTPUT_DIR"

echo "=== Building Craft Agents Windows NSIS (${ARCH}) using electron-builder ==="

# 1. Clean previous build artifacts
echo "Cleaning previous builds..."
rm -rf "$ELECTRON_DIR/vendor"
rm -rf "$ELECTRON_DIR/node_modules/@anthropic-ai"
rm -rf "$ELECTRON_DIR/packages"
rm -rf "$ELECTRON_DIR/release"

# 2. Install dependencies
echo "Installing dependencies..."
cd "$ROOT_DIR"
bun install

# 3. Download Bun binary for win32-x64
echo "Downloading Bun ${BUN_VERSION} for win32-${ARCH}..."
mkdir -p "$ELECTRON_DIR/vendor/bun"
BUN_DOWNLOAD="bun-windows-${ARCH}-baseline"

TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

BUN_CACHE_DIR="$(craft_build_cache_dir)/${BUN_VERSION}"
BUN_ARCHIVE="$BUN_CACHE_DIR/${BUN_DOWNLOAD}.zip"
BUN_CHECKSUMS="$BUN_CACHE_DIR/SHASUMS256.txt"
mkdir -p "$BUN_CACHE_DIR"
rm -f "$BUN_CHECKSUMS" "$BUN_CHECKSUMS.partial"
download_with_retry \
    "https://github.com/oven-sh/bun/releases/download/${BUN_VERSION}/SHASUMS256.txt" \
    "$BUN_CHECKSUMS" \
    "Bun checksums"

if [ -s "$BUN_ARCHIVE" ] && ! (cd "$BUN_CACHE_DIR" && grep "${BUN_DOWNLOAD}.zip" SHASUMS256.txt | shasum -a 256 -c - >/dev/null 2>&1); then
    echo "Cached Bun archive failed checksum; downloading a clean copy..."
    rm -f "$BUN_ARCHIVE" "$BUN_ARCHIVE.partial"
fi
download_with_retry \
    "https://github.com/oven-sh/bun/releases/download/${BUN_VERSION}/${BUN_DOWNLOAD}.zip" \
    "$BUN_ARCHIVE" \
    "Bun ${BUN_VERSION} for win32-${ARCH}"

echo "Verifying checksum..."
(cd "$BUN_CACHE_DIR" && grep "${BUN_DOWNLOAD}.zip" SHASUMS256.txt | shasum -a 256 -c -)

unzip -o "$BUN_ARCHIVE" -d "$TEMP_DIR"
# bun-windows-x64.zip extracts to bun-windows-x64/bun.exe
cp "$TEMP_DIR/${BUN_DOWNLOAD}/bun.exe" "$ELECTRON_DIR/vendor/bun/"
chmod +x "$ELECTRON_DIR/vendor/bun/bun.exe"

# 4. Copy SDK from root node_modules (monorepo hoisting)
SDK_SOURCE="$ROOT_DIR/node_modules/@anthropic-ai/claude-agent-sdk"
require_path "$SDK_SOURCE" "SDK core" "Run 'bun install' from the repository root first."
echo "Copying SDK core..."
mkdir -p "$ELECTRON_DIR/node_modules/@anthropic-ai"
rm -rf "$ELECTRON_DIR/node_modules/@anthropic-ai/claude-agent-sdk"
cp -r "$SDK_SOURCE" "$ELECTRON_DIR/node_modules/@anthropic-ai/"

# 4a. Resolve the win32-x64 binary package. If present in node_modules use it,
#     otherwise fetch and unpack the matching tarball directly via npm.
SDK_BIN_PKG="claude-agent-sdk-win32-${ARCH}"
SDK_BIN_SOURCE="$ROOT_DIR/node_modules/@anthropic-ai/${SDK_BIN_PKG}"
if [ ! -d "$SDK_BIN_SOURCE" ]; then
    echo "Cross-arch build: ${SDK_BIN_PKG} not in node_modules — fetching from npm..."
    SDK_VERSION=$(node -p "require('$ROOT_DIR/package.json').dependencies['@anthropic-ai/claude-agent-sdk']" | tr -d '"')
    PKG_TMP=$(mktemp -d)
    (
        cd "$PKG_TMP"
        npm pack "@anthropic-ai/${SDK_BIN_PKG}@${SDK_VERSION}" >/dev/null
        TARBALL=$(ls anthropic-ai-*.tgz | head -1)
        tar -xzf "$TARBALL"
    )
    mkdir -p "$SDK_BIN_SOURCE"
    cp -r "$PKG_TMP/package/." "$SDK_BIN_SOURCE/"
    rm -rf "$PKG_TMP"
fi

require_path "$SDK_BIN_SOURCE" "SDK native binary package (${SDK_BIN_PKG})" \
  "Run 'bun install' from the repository root, or check your network for the npm cross-fetch."

echo "Staging SDK native binary as claude-agent-sdk-binary alias..."
ALIAS_DEST="$ELECTRON_DIR/node_modules/@anthropic-ai/claude-agent-sdk-binary"
rm -rf "$ALIAS_DEST"
mkdir -p "$ALIAS_DEST"
cp -r "$SDK_BIN_SOURCE/." "$ALIAS_DEST/"

# Sanity check: native binary should be ~210 MB.
BIN_FILE="$ALIAS_DEST/claude.exe"
if [ ! -f "$BIN_FILE" ]; then
    echo "WARNING: $BIN_FILE not found, listing alias contents:"
    ls -la "$ALIAS_DEST"
else
    BIN_SIZE=$(stat -f%z "$BIN_FILE" 2>/dev/null || stat -c%s "$BIN_FILE")
    if [ "$BIN_SIZE" -lt 50000000 ]; then
        echo "ERROR: claude.exe at $BIN_FILE is only ${BIN_SIZE} bytes (expected ~210 MB)"
        exit 1
    fi
    echo "  Native binary: $((BIN_SIZE / 1024 / 1024)) MB"
fi

# 5. Stage target-native dependencies for the cross-build.
stage_target_ripgrep "win32" "$ARCH" "$ROOT_DIR" "$ELECTRON_DIR"
ensure_target_koffi "win32" "$ARCH" "$ROOT_DIR"

# 6. Copy network interceptor sources (needed for the Pi subprocess)
INTERCEPTOR_SOURCE="$ROOT_DIR/packages/shared/src/unified-network-interceptor.ts"
require_path "$INTERCEPTOR_SOURCE" "Interceptor" "Ensure packages/shared/src/unified-network-interceptor.ts exists."
echo "Copying interceptor (for Pi subprocess)..."
mkdir -p "$ELECTRON_DIR/packages/shared/src"
cp "$INTERCEPTOR_SOURCE" "$ELECTRON_DIR/packages/shared/src/"
for dep in interceptor-common.ts feature-flags.ts interceptor-request-utils.ts; do
  if [ -f "$ROOT_DIR/packages/shared/src/$dep" ]; then
    cp "$ROOT_DIR/packages/shared/src/$dep" "$ELECTRON_DIR/packages/shared/src/"
  fi
done

# 7. Build Electron app
echo "Building Electron app..."
cd "$ROOT_DIR"
CRAFT_DEV_RUNTIME=1 bun run electron:build

# electron:build runs on the host platform, so a macOS cross-build would copy
# darwin subprocess resources. Overwrite them with Windows-targeted resources
# before electron-builder packages the app.
echo "Rebuilding bundled subprocess resources for win32-${ARCH}..."
bun run scripts/electron-build-subprocess.ts --platform=win32 --arch=${ARCH}

# 8. Package with electron-builder (win nsis x64)
#    On non-Windows hosts electron-builder auto-downloads wine (run via Rosetta
#    on Apple Silicon) to invoke the NSIS compiler.
echo "Packaging app with electron-builder (win nsis x64)..."
cd "$ELECTRON_DIR"
export CSC_IDENTITY_AUTO_DISCOVERY=false
npx electron-builder --win --x64

# 9. Verify the EXE was built
EXE_NAME="Craft-Agents-x64.exe"
EXE_PATH="$OUTPUT_DIR/$EXE_NAME"

for artifact in \
    "$EXE_NAME" \
    "${EXE_NAME}.blockmap" \
    "latest.yml"; do
    if [ -f "$ELECTRON_DIR/release/$artifact" ]; then
        cp -f "$ELECTRON_DIR/release/$artifact" "$OUTPUT_DIR/$artifact"
    fi
done

if [ ! -f "$EXE_PATH" ]; then
    echo "ERROR: Expected EXE not found at $EXE_PATH"
    echo "Contents of output directory:"
    ls -la "$OUTPUT_DIR"
    exit 1
fi

echo ""
echo "=== Build Complete ==="
echo "EXE: $EXE_PATH"
echo "Size: $(du -h "$EXE_PATH" | cut -f1)"
