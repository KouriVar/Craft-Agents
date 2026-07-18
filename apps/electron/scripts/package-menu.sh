#!/bin/bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ELECTRON_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$(dirname "$ELECTRON_DIR")")"
source "$SCRIPT_DIR/download-with-retry.sh"

VERSION=$(node -p "require('$ELECTRON_DIR/package.json').version")
export CRAFT_PACK_OUTPUT_DIR="${CRAFT_PACK_OUTPUT_DIR:-$(craft_pack_output_dir)}"
CACHE_DIR="$(craft_build_cache_dir)"
LOG_DIR="$CRAFT_PACK_OUTPUT_DIR/logs"
LOG_FILE="$LOG_DIR/package-${VERSION}-$(date '+%Y%m%d-%H%M%S').log"

mkdir -p "$CRAFT_PACK_OUTPUT_DIR" "$LOG_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

pause_before_exit() {
    echo ""
    echo "按任意键关闭窗口..."
    read -n 1 -s || true
}

handle_error() {
    local exit_code=$?
    local line="$1"
    trap - ERR
    echo ""
    echo "========================================="
    echo "  打包失败（退出码: $exit_code，脚本行: $line）"
    echo "  日志: $LOG_FILE"
    echo "========================================="
    pause_before_exit
    exit "$exit_code"
}
trap 'handle_error $LINENO' ERR

require_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "错误：缺少必要命令 '$1'。$2"
        return 1
    fi
}

preflight() {
    require_command bun "请先安装 Bun。"
    require_command node "请先安装 Node.js。"
    require_command npm "请先安装 npm。"
    require_command npx "请先安装 npx。"
    require_command curl "系统需要 curl 下载打包运行时。"
    require_command unzip "系统需要 unzip 解压运行时。"
    require_command git "请先安装 Xcode Command Line Tools。"
    echo "环境检查通过。"
}

build_macos() {
    echo ""
    echo "[macOS arm64] 开始打包..."
    bash "$SCRIPT_DIR/build-dmg.sh" arm64
}

build_windows() {
    echo ""
    echo "[Windows x64] 开始打包..."
    if [ "$(uname -s)" = "Darwin" ]; then
        bash "$SCRIPT_DIR/build-win.sh"
    elif command -v pwsh >/dev/null 2>&1; then
        pwsh -NoProfile -ExecutionPolicy Bypass -File "$SCRIPT_DIR/build-win.ps1"
    elif command -v powershell.exe >/dev/null 2>&1; then
        powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$SCRIPT_DIR/build-win.ps1"
    else
        echo "错误：当前系统没有可用的 Windows 打包入口。"
        return 1
    fi
}

build_linux() {
    echo ""
    echo "[Linux x64] 开始打包 AppImage..."
    bash "$SCRIPT_DIR/build-linux.sh" x64
}

show_artifacts() {
    echo ""
    echo "========================================="
    echo "  打包完成"
    echo "  输出目录: $CRAFT_PACK_OUTPUT_DIR"
    echo "========================================="
    find "$CRAFT_PACK_OUTPUT_DIR" -maxdepth 1 -type f \
        \( -name 'Craft-Agents-*' -o -name 'latest*.yml' \) \
        -print | sort | while IFS= read -r artifact; do
            printf '  %-12s %s\n' "$(du -h "$artifact" | cut -f1)" "$(basename "$artifact")"
        done
    echo ""
    echo "日志: $LOG_FILE"
}

cd "$ROOT_DIR"
preflight

if [ "${1:-}" = "--check" ]; then
    echo "打包工具检查通过。"
    echo "版本: $VERSION"
    echo "输出目录: $CRAFT_PACK_OUTPUT_DIR"
    echo "缓存目录: $CACHE_DIR"
    echo "日志: $LOG_FILE"
    exit 0
fi

echo "========================================="
echo "  Craft Agents 三平台打包工具"
echo "  当前版本: $VERSION"
echo "  输出目录: $CRAFT_PACK_OUTPUT_DIR"
echo "  下载缓存: $CACHE_DIR"
echo "========================================="
echo ""
echo "  [1] macOS (arm64)"
echo "  [2] Windows (x64)"
echo "  [3] Linux (x64 AppImage)"
echo "  [4] macOS + Windows"
echo "  [5] 三个平台全部打包"
echo ""
echo "说明：bun install 每次仅校验依赖；Bun、uv、ripgrep、Electron、"
echo "Wine/NSIS 和 npm 下载均会复用本机缓存，不会正常情况下重复下载。"
echo ""

read -r -p "请选择打包平台 (1/2/3/4/5): " choice

case "$choice" in
    1) build_macos ;;
    2) build_windows ;;
    3) build_linux ;;
    4) build_macos; build_windows ;;
    5) build_macos; build_windows; build_linux ;;
    *)
        echo "无效选择：$choice"
        exit 1
        ;;
esac

show_artifacts
pause_before_exit
