#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ELECTRON_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$(dirname "$ELECTRON_DIR")")"
source "$SCRIPT_DIR/download-with-retry.sh"

# Helper function to check required file/directory exists
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

# Load environment variables from .env
if [ -f "$ROOT_DIR/.env" ]; then
    set -a
    source "$ROOT_DIR/.env"
    set +a
fi

# Parse arguments
ARCH="x64"
UPLOAD=false
UPLOAD_LATEST=false
UPLOAD_SCRIPT=false

show_help() {
    cat << EOF
Usage: build-linux.sh [x64|arm64] [--upload] [--latest] [--script]

Arguments:
  x64|arm64    Target architecture (default: x64)
  --upload     Upload AppImage to S3 after building
  --latest     Also update electron/latest (requires --upload)
  --script     Also upload install-app.sh (requires --upload)

Environment variables (from .env or environment):
  S3_VERSIONS_BUCKET_*      - S3 credentials (for --upload)
EOF
    exit 0
}

while [[ $# -gt 0 ]]; do
    case $1 in
        x64|arm64)     ARCH="$1"; shift ;;
        --upload)      UPLOAD=true; shift ;;
        --latest)      UPLOAD_LATEST=true; shift ;;
        --script)      UPLOAD_SCRIPT=true; shift ;;
        -h|--help)     show_help ;;
        *)
            echo "Unknown option: $1"
            echo "Run with --help for usage"
            exit 1
            ;;
    esac
done

# Configuration
BUN_VERSION="bun-v1.3.9"  # Pinned version for reproducible builds
OUTPUT_DIR="$(craft_pack_output_dir)"
mkdir -p "$OUTPUT_DIR"

echo "=== Building Craft Agents AppImage (${ARCH}) using electron-builder ==="
if [ "$UPLOAD" = true ]; then
    echo "Will upload to S3 after build"
fi

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

# 3. Download Bun binary with checksum verification
echo "Downloading Bun ${BUN_VERSION} for linux-${ARCH}..."
mkdir -p "$ELECTRON_DIR/vendor/bun"

# Map architecture names (electron uses x64/arm64, bun uses x64/aarch64)
if [ "$ARCH" = "arm64" ]; then
    BUN_DOWNLOAD="bun-linux-aarch64"
else
    BUN_DOWNLOAD="bun-linux-x64-baseline"
fi

# Create temp directory to avoid race conditions
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Download binary into a persistent cache. Interrupted runs resume the partial
# file instead of restarting the transfer from zero.
BUN_CACHE_DIR="$(craft_build_cache_dir)/${BUN_VERSION}"
BUN_ARCHIVE="$BUN_CACHE_DIR/${BUN_DOWNLOAD}.zip"
BUN_CHECKSUMS="$BUN_CACHE_DIR/SHASUMS256.txt"
mkdir -p "$BUN_CACHE_DIR"
rm -f "$BUN_CHECKSUMS" "$BUN_CHECKSUMS.partial"
download_with_retry \
    "https://github.com/oven-sh/bun/releases/download/${BUN_VERSION}/SHASUMS256.txt" \
    "$BUN_CHECKSUMS" \
    "Bun checksums"

EXPECTED_BUN_HASH=$(grep "${BUN_DOWNLOAD}.zip" "$BUN_CHECKSUMS" | awk '{print $1}')
if [ -z "$EXPECTED_BUN_HASH" ]; then
    echo "ERROR: Bun checksum entry not found for ${BUN_DOWNLOAD}.zip"
    exit 1
fi
if [ -s "$BUN_ARCHIVE" ] && ! verify_sha256_file "$BUN_ARCHIVE" "$EXPECTED_BUN_HASH"; then
    echo "Cached Bun archive failed checksum; downloading a clean copy..."
    rm -f "$BUN_ARCHIVE" "$BUN_ARCHIVE.partial"
fi
download_with_retry \
    "https://github.com/oven-sh/bun/releases/download/${BUN_VERSION}/${BUN_DOWNLOAD}.zip" \
    "$BUN_ARCHIVE" \
    "Bun ${BUN_VERSION} for linux-${ARCH}"

# Verify checksum
echo "Verifying checksum..."
verify_sha256_file "$BUN_ARCHIVE" "$EXPECTED_BUN_HASH"
echo "${BUN_DOWNLOAD}.zip: OK"

# Extract and install
unzip -o "$BUN_ARCHIVE" -d "$TEMP_DIR"
cp "$TEMP_DIR/${BUN_DOWNLOAD}/bun" "$ELECTRON_DIR/vendor/bun/"
chmod +x "$ELECTRON_DIR/vendor/bun/bun"

# 4. Copy SDK from root node_modules (monorepo hoisting).
# Since SDK 0.2.113: thin core + per-platform binary package.
# See apps/electron/scripts/build-dmg.sh for the full rationale.
SDK_SOURCE="$ROOT_DIR/node_modules/@anthropic-ai/claude-agent-sdk"
require_path "$SDK_SOURCE" "SDK core" "Run 'bun install' from the repository root first."
echo "Copying SDK core..."
mkdir -p "$ELECTRON_DIR/node_modules/@anthropic-ai"
rm -rf "$ELECTRON_DIR/node_modules/@anthropic-ai/claude-agent-sdk"
cp -r "$SDK_SOURCE" "$ELECTRON_DIR/node_modules/@anthropic-ai/"

# 4a. Resolve the target arch's binary package (cross-fetch from npm if absent).
SDK_BIN_PKG="claude-agent-sdk-linux-${ARCH}"
SDK_BIN_SOURCE="$ROOT_DIR/node_modules/@anthropic-ai/${SDK_BIN_PKG}"
if [ ! -d "$SDK_BIN_SOURCE" ]; then
    echo "Cross-arch build: ${SDK_BIN_PKG} not in node_modules — fetching from npm..."
    SDK_VERSION=$(node -p "require('$ROOT_DIR/package.json').dependencies['@anthropic-ai/claude-agent-sdk']" | tr -d '"')
    PKG_TMP=$(mktemp -d)
    trap "rm -rf $PKG_TMP" RETURN
    (
        cd "$PKG_TMP"
        npm pack "@anthropic-ai/${SDK_BIN_PKG}@${SDK_VERSION}" >/dev/null
        TARBALL=$(ls anthropic-ai-*.tgz | head -1)
        tar -xzf "$TARBALL"
    )
    mkdir -p "$SDK_BIN_SOURCE"
    cp -r "$PKG_TMP/package/." "$SDK_BIN_SOURCE/"
fi

require_path "$SDK_BIN_SOURCE" "SDK native binary package (${SDK_BIN_PKG})" \
  "Run 'bun install' from the repository root, or check your network for the npm cross-fetch."

echo "Staging SDK native binary as claude-agent-sdk-binary alias..."
ALIAS_DEST="$ELECTRON_DIR/node_modules/@anthropic-ai/claude-agent-sdk-binary"
rm -rf "$ALIAS_DEST"
mkdir -p "$ALIAS_DEST"
cp -r "$SDK_BIN_SOURCE/." "$ALIAS_DEST/"
chmod +x "$ALIAS_DEST/claude"

BIN_SIZE=$(stat -f%z "$ALIAS_DEST/claude" 2>/dev/null || stat -c%s "$ALIAS_DEST/claude")
if [ "$BIN_SIZE" -lt 50000000 ]; then
    echo "ERROR: claude binary at $ALIAS_DEST/claude is only ${BIN_SIZE} bytes (expected ~210 MB)"
    exit 1
fi
echo "  Native binary: $((BIN_SIZE / 1024 / 1024)) MB"

# 5. Stage Linux-native dependencies. Copying host node_modules here would
#    otherwise put macOS binaries inside the AppImage during a cross-build.
stage_target_ripgrep "linux" "$ARCH" "$ROOT_DIR" "$ELECTRON_DIR"
ensure_target_koffi "linux" "$ARCH" "$ROOT_DIR"

# 6. Copy network interceptor sources (for Pi subprocess; Claude no longer
#    uses --preload — Phase 2 will move that to SDK hooks or a local proxy).
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

# 6. Build Electron app
echo "Building Electron app..."
cd "$ROOT_DIR"
CRAFT_DEV_RUNTIME=1 bun run electron:build

echo "Rebuilding bundled subprocess resources for linux-${ARCH}..."
bun run scripts/electron-build-subprocess.ts --platform=linux --arch=${ARCH}

# 7. Package with electron-builder
echo "Packaging app with electron-builder..."
cd "$ELECTRON_DIR"

# Run electron-builder
# Note: electron-builder may build both archs due to config, but we only use the requested one
npx electron-builder --linux --${ARCH}

# 8. Verify the AppImage was built
# electron-builder uses Linux-style arch names: x86_64 for x64, aarch64 for arm64
if [ "$ARCH" = "x64" ]; then
    LINUX_ARCH="x86_64"
else
    LINUX_ARCH="aarch64"
fi

# Prefer the current electron-builder naming, with the historical Linux arch
# spelling retained as a compatibility fallback.
APPIMAGE_NAME="Craft-Agents-${ARCH}.AppImage"
BUILT_APPIMAGE_PATH="$ELECTRON_DIR/release/$APPIMAGE_NAME"
if [ ! -f "$BUILT_APPIMAGE_PATH" ]; then
    BUILT_APPIMAGE_NAME="Craft-Agents-${LINUX_ARCH}.AppImage"
    BUILT_APPIMAGE_PATH="$ELECTRON_DIR/release/$BUILT_APPIMAGE_NAME"
fi

if [ ! -f "$BUILT_APPIMAGE_PATH" ]; then
    echo "ERROR: Expected AppImage not found at $BUILT_APPIMAGE_PATH"
    echo "Contents of release directory:"
    ls -la "$ELECTRON_DIR/release/"
    exit 1
fi

APPIMAGE_PATH="$OUTPUT_DIR/$APPIMAGE_NAME"
cp -f "$BUILT_APPIMAGE_PATH" "$APPIMAGE_PATH"
for artifact in "${APPIMAGE_NAME}.blockmap" "latest-linux.yml"; do
    if [ -f "$ELECTRON_DIR/release/$artifact" ]; then
        cp -f "$ELECTRON_DIR/release/$artifact" "$OUTPUT_DIR/$artifact"
    fi
done

echo ""
echo "=== Build Complete ==="
echo "AppImage: $APPIMAGE_PATH"
echo "Size: $(du -h "$APPIMAGE_PATH" | cut -f1)"

# 9. Create manifest.json for upload script
# Read version from package.json
ELECTRON_VERSION=$(cat "$ELECTRON_DIR/package.json" | grep '"version"' | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
echo "Creating manifest.json (version: $ELECTRON_VERSION)..."
mkdir -p "$ROOT_DIR/.build/upload"
echo "{\"version\": \"$ELECTRON_VERSION\"}" > "$ROOT_DIR/.build/upload/manifest.json"

# 10. Upload to S3 (if --upload flag is set)
if [ "$UPLOAD" = true ]; then
    echo ""
    echo "=== Uploading to S3 ==="

    # Check for S3 credentials
    if [ -z "$S3_VERSIONS_BUCKET_ENDPOINT" ] || [ -z "$S3_VERSIONS_BUCKET_ACCESS_KEY_ID" ] || [ -z "$S3_VERSIONS_BUCKET_SECRET_ACCESS_KEY" ]; then
        cat << EOF
ERROR: Missing S3 credentials. Set these environment variables:
  S3_VERSIONS_BUCKET_ENDPOINT
  S3_VERSIONS_BUCKET_ACCESS_KEY_ID
  S3_VERSIONS_BUCKET_SECRET_ACCESS_KEY

You can add them to .env or export them directly.
EOF
        exit 1
    fi

    # Build upload flags
    UPLOAD_FLAGS="--electron"
    [ "$UPLOAD_LATEST" = true ] && UPLOAD_FLAGS="$UPLOAD_FLAGS --latest"
    [ "$UPLOAD_SCRIPT" = true ] && UPLOAD_FLAGS="$UPLOAD_FLAGS --script"

    cd "$ROOT_DIR"
    bun run scripts/upload.ts $UPLOAD_FLAGS

    echo ""
    echo "=== Upload Complete ==="
fi
