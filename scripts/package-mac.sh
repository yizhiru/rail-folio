#!/usr/bin/env bash
# 打包 macOS 桌面应用：生成 .app，并用 hdiutil 直接做成 .dmg。
# 不走 Tauri 自带的 bundle_dmg.sh，因为它依赖 AppleScript 控制 Finder 排版，
# 在部分 macOS 版本上会间歇性失败（Finder -10006）。
#
# 用法：
#   bash scripts/package-mac.sh
#   bash scripts/package-mac.sh universal-apple-darwin
#   bash scripts/package-mac.sh aarch64-apple-darwin
set -euo pipefail

cd "$(dirname "$0")/.."

TARGET="${1:-}"
BUILD_ARGS=(--bundles app)
TARGET_DIR="src-tauri/target/release"
ARCH_LABEL="$(uname -m)"

if [ -n "$TARGET" ]; then
  BUILD_ARGS+=(--target "$TARGET")
  TARGET_DIR="src-tauri/target/${TARGET}/release"
  case "$TARGET" in
    universal-apple-darwin) ARCH_LABEL="universal" ;;
    aarch64-apple-darwin) ARCH_LABEL="aarch64" ;;
    x86_64-apple-darwin) ARCH_LABEL="x64" ;;
    *) ARCH_LABEL="$TARGET" ;;
  esac
  if [ "$TARGET" = "universal-apple-darwin" ] && command -v rustup >/dev/null 2>&1; then
    rustup target add aarch64-apple-darwin x86_64-apple-darwin
  fi
fi

npx tauri build "${BUILD_ARGS[@]}"

APP_NAME="火车记"
VERSION="$(node -p "require('./src-tauri/tauri.conf.json').version")"
BUNDLE_DIR="$TARGET_DIR/bundle"
APP_PATH="$BUNDLE_DIR/macos/$APP_NAME.app"
DMG_DIR="$BUNDLE_DIR/dmg"
DMG_PATH="$DMG_DIR/${APP_NAME}_${VERSION}_${ARCH_LABEL}.dmg"

[ -d "$APP_PATH" ] || { echo "未找到 $APP_PATH"; exit 1; }

STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT
cp -R "$APP_PATH" "$STAGING/"
ln -s /Applications "$STAGING/Applications"

mkdir -p "$DMG_DIR"
rm -f "$DMG_PATH"
hdiutil create -quiet -volname "$APP_NAME" -srcfolder "$STAGING" -ov -format UDZO "$DMG_PATH"

echo
echo "应用：$PWD/$APP_PATH"
echo "镜像：$PWD/$DMG_PATH"
