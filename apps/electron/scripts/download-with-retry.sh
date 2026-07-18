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
