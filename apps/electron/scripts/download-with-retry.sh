#!/bin/bash

# Shared, resumable downloader for desktop packaging scripts.
# Completed files are kept in a persistent build cache; interrupted downloads
# retain their .partial file so a later packaging run can continue from it.

craft_build_cache_dir() {
    if [ -n "${CRAFT_BUILD_CACHE_DIR:-}" ]; then
        printf '%s\n' "$CRAFT_BUILD_CACHE_DIR"
    elif [ "$(uname -s)" = "Darwin" ]; then
        printf '%s\n' "$HOME/Library/Caches/CraftAgent/build-downloads"
    else
        printf '%s\n' "${XDG_CACHE_HOME:-$HOME/.cache}/craft-agent/build-downloads"
    fi
}

craft_pack_output_dir() {
    printf '%s\n' "${CRAFT_PACK_OUTPUT_DIR:-$HOME/Downloads/Craft Pack}"
}

verify_sha256_file() {
    local file="$1"
    local expected="$2"
    local actual

    if command -v shasum >/dev/null 2>&1; then
        actual=$(shasum -a 256 "$file" | awk '{print $1}')
    elif command -v sha256sum >/dev/null 2>&1; then
        actual=$(sha256sum "$file" | awk '{print $1}')
    else
        echo "ERROR: Neither shasum nor sha256sum is available."
        return 1
    fi

    [ "$actual" = "$expected" ]
}

download_with_retry() {
    local url="$1"
    local output="$2"
    local label="${3:-$(basename "$output")}"
    local partial="${output}.partial"
    local attempt=1
    local max_attempts=8

    mkdir -p "$(dirname "$output")"
    if [ -s "$output" ]; then
        echo "Using cached ${label}: $output"
        return 0
    fi

    while [ "$attempt" -le "$max_attempts" ]; do
        if [ -s "$partial" ]; then
            echo "Downloading ${label} (attempt ${attempt}/${max_attempts}, resuming $(du -h "$partial" | cut -f1))..."
        else
            echo "Downloading ${label} (attempt ${attempt}/${max_attempts})..."
        fi

        if curl -fL \
            --connect-timeout 30 \
            --speed-limit 1024 \
            --speed-time 90 \
            --retry 3 \
            --retry-delay 2 \
            --retry-connrefused \
            --continue-at - \
            --output "$partial" \
            "$url"; then
            mv "$partial" "$output"
            return 0
        fi

        echo "Warning: ${label} download interrupted; the partial file is kept for resuming."
        attempt=$((attempt + 1))
        [ "$attempt" -le "$max_attempts" ] && sleep 3
    done

    echo "ERROR: Failed to download ${label} after ${max_attempts} attempts."
    echo "Partial download retained at: $partial"
    return 1
}

# Stage the target platform's ripgrep binary. @vscode/ripgrep installs only
# the host binary, so copying node_modules directly during a cross-build would
# silently put a macOS executable in Windows/Linux packages.
stage_target_ripgrep() {
    local platform="$1"
    local arch="$2"
    local root_dir="$3"
    local electron_dir="$4"
    local rg_version="v15.0.1"
    local target archive_name expected_hash binary_name

    case "${platform}-${arch}" in
        darwin-arm64)
            target="aarch64-apple-darwin"
            archive_name="ripgrep-${rg_version}-${target}.tar.gz"
            expected_hash="2fa16464fd8638588a67c7fc172d3c4b57fbdc65dff366e10b0b0e90734628a6"
            binary_name="rg"
            ;;
        darwin-x64)
            target="x86_64-apple-darwin"
            archive_name="ripgrep-${rg_version}-${target}.tar.gz"
            expected_hash="591c693e80bb444ef1907b2a906feb9c77bcafe1cdf509107cc75dcf0e875bd2"
            binary_name="rg"
            ;;
        win32-x64)
            target="x86_64-pc-windows-msvc"
            archive_name="ripgrep-${rg_version}-${target}.zip"
            expected_hash="bd28761f4918ea8fcb7a95f636b4422a915d55af268d9805be82d8ce0fdfc823"
            binary_name="rg.exe"
            ;;
        linux-x64)
            target="x86_64-unknown-linux-musl"
            archive_name="ripgrep-${rg_version}-${target}.tar.gz"
            expected_hash="4499958bfd5252df3d9e7504127fd448e4a14fbf2805ef4f14baaa1bcf775188"
            binary_name="rg"
            ;;
        linux-arm64)
            target="aarch64-unknown-linux-musl"
            archive_name="ripgrep-${rg_version}-${target}.tar.gz"
            expected_hash="dd3738a4b6e8df0fb3bc3edc5af352c4c39e0d97ad118a23e5176bdc5d48ba08"
            binary_name="rg"
            ;;
        *)
            echo "ERROR: Unsupported ripgrep target: ${platform}-${arch}"
            return 1
            ;;
    esac

    local rg_source="$root_dir/node_modules/@vscode/ripgrep"
    local rg_dest="$electron_dir/node_modules/@vscode/ripgrep"
    local cache_dir="$(craft_build_cache_dir)/ripgrep/${rg_version}"
    local archive_path="$cache_dir/$archive_name"
    local extract_dir
    local extracted_binary

    if [ ! -d "$rg_source" ]; then
        echo "ERROR: @vscode/ripgrep is not installed at $rg_source"
        return 1
    fi

    if [ -s "$archive_path" ] && ! verify_sha256_file "$archive_path" "$expected_hash"; then
        echo "Cached ripgrep archive failed checksum; downloading a clean copy..."
        rm -f "$archive_path" "$archive_path.partial"
    fi
    download_with_retry \
        "https://github.com/microsoft/ripgrep-prebuilt/releases/download/${rg_version}/${archive_name}" \
        "$archive_path" \
        "ripgrep ${rg_version} for ${platform}-${arch}"
    if ! verify_sha256_file "$archive_path" "$expected_hash"; then
        echo "ERROR: ripgrep checksum verification failed: $archive_path"
        return 1
    fi

    extract_dir=$(mktemp -d)
    if [[ "$archive_name" == *.zip ]]; then
        unzip -q -o "$archive_path" -d "$extract_dir"
    else
        tar -xzf "$archive_path" -C "$extract_dir"
    fi
    extracted_binary=$(find "$extract_dir" -type f -name "$binary_name" -print -quit)
    if [ -z "$extracted_binary" ]; then
        echo "ERROR: $binary_name was not found in $archive_name"
        return 1
    fi

    echo "Staging @vscode/ripgrep for ${platform}-${arch}..."
    mkdir -p "$(dirname "$rg_dest")"
    rm -rf "$rg_dest"
    cp -R "$rg_source" "$rg_dest"
    rm -rf "$rg_dest/bin"
    mkdir -p "$rg_dest/bin"
    cp "$extracted_binary" "$rg_dest/bin/$binary_name"
    chmod +x "$rg_dest/bin/$binary_name"
    rm -rf "$extract_dir"
}

# Bun installs koffi's native optional package only for the host. Cross-builds
# need the target package available before electron-build-subprocess stages Pi.
ensure_target_koffi() {
    local platform="$1"
    local arch="$2"
    local root_dir="$3"
    local package_name="koffi-${platform}-${arch}"
    local package_dir="$root_dir/node_modules/@koromix/$package_name"
    local target_dir="${platform}_${arch}"

    if [ -d "$package_dir/$target_dir" ]; then
        echo "Using cached @koromix/${package_name}"
        return 0
    fi

    local koffi_version
    local temp_dir
    local tarball
    koffi_version=$(node -p "require('$root_dir/package.json').dependencies.koffi")
    temp_dir=$(mktemp -d)
    echo "Fetching @koromix/${package_name}@${koffi_version}..."
    (
        cd "$temp_dir"
        npm pack "@koromix/${package_name}@${koffi_version}" >/dev/null
        tarball=$(find . -maxdepth 1 -name 'koromix-*.tgz' -print -quit)
        tar -xzf "$tarball"
    )
    mkdir -p "$package_dir"
    cp -R "$temp_dir/package/." "$package_dir/"
    rm -rf "$temp_dir"

    if [ ! -d "$package_dir/$target_dir" ]; then
        echo "ERROR: @koromix/${package_name} does not contain $target_dir"
        return 1
    fi
}
