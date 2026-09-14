#!/usr/bin/env bash
# 打包 macOS 桌面应用：生成 .app，并用 hdiutil 直接做成 .dmg。
# 不走 Tauri 自带的 bundle_dmg.sh，因为它依赖 AppleScript 控制 Finder 排版，
# 在部分 macOS 版本上会间歇性失败（Finder -10006）。
set -euo pipefail

cd "$(dirname "$0")/.."

npx tauri build --bundles app

APP_NAME="火车记"
VERSION="$(node -p "require('./src-tauri/tauri.conf.json').version")"
ARCH="$(uname -m)"
BUNDLE_DIR="src-tauri/target/release/bundle"
APP_PATH="$BUNDLE_DIR/macos/$APP_NAME.app"
DMG_DIR="$BUNDLE_DIR/dmg"
DMG_PATH="$DMG_DIR/${APP_NAME}_${VERSION}_${ARCH}.dmg"

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
