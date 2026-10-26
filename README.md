# Rail Folio

个人乘车档案桌面应用：本机保存行程，总览地图与统计，支持火车票 / 12306 截图的本机 OCR 导入，以及在应用内登录 12306 后同步订单。

架构与技术栈见 [docs/architecture.md](docs/architecture.md)。界面与统计口径见 [docs/product.md](docs/product.md)。

## 开发

```bash
npm install
npm run tauri dev
```

仅看界面（无 OCR、数据在浏览器 localStorage）：

```bash
npm run dev
```

```bash
npm test
```

## 打包为桌面应用

macOS（在 Mac 上执行）：

```bash
npm run package:mac
```

通用二进制（Apple 芯片和 Intel 各打一份再合成，仍需在 Mac 上执行）：

```bash
bash scripts/package-mac.sh universal-apple-darwin
```

产物在 `src-tauri/target/<目标>/release/bundle/`（本机默认目标时目录是 `release`）：

- `macos/火车记.app`：拖到「应用程序」即可双击运行。
- `dmg/火车记_<版本>_<架构>.dmg`：用于分发的安装镜像。通用包的架构名是 `universal`。

脚本先调用 `tauri build --bundles app` 生成 `.app`，再用 `hdiutil` 直接做 DMG；没有走 Tauri 自带的 `bundle_dmg.sh`，因为它靠 AppleScript 控制 Finder 排版，在部分 macOS 版本上会间歇性失败。

Windows（在 Windows 上执行，需要 Visual Studio 生成工具）：

```bash
npm run package:win
```

产物：`src-tauri/target/release/bundle/nsis/火车记_<版本>_x64-setup.exe`。安装时会按需下载 WebView2。

推送 `v*` 标签（例如 `v1.1.0`）会走 `.github/workflows/release.yml`：macOS 通用 DMG 和 Windows 安装包打好后上传到同一个 GitHub Release。

应用使用 ad-hoc 签名，没有 Apple 开发者证书公证，Windows 安装包也未签名。macOS 上首次打开若被 Gatekeeper 拦下，右键 → 打开，或在「系统设置 → 隐私与安全性」里点「仍要打开」。Windows 上 SmartScreen 可能提示未知发布者，选择仍要运行。要免提示需要各自平台的付费签名。

本机截图 OCR 只在 macOS 上可用。Windows 版可以记行程、导入 JSON/CSV，并在应用内登录 12306 后同步订单。

数据文件：

- macOS：`~/Library/Application Support/com.railfolio.app/trips.json`
- Windows：`%APPDATA%\com.railfolio.app\trips.json`

## 从 12306 同步

导入页的「从 12306 同步」需要先填写乘车人姓名（同一订单里可能有多位乘车人，只同步这一位的车票；姓名只记在本机，下次自动带出）。点击后会弹出系统内嵌窗口打开 12306 登录页。你在窗口里自己登录（滑块、短信都走 12306 自己的流程），火车记不保存账号密码。登录成功后，程序打开订单页，按页面现在的条件读取未完成、未出行和历史订单里的行程（历史单次约 30 天，能继续往前查就接着查，超出保存期限就停），结果进入导入核对列表，勾选后再入库。会话 cookie 留在应用的 WebView 里，下次同步若尚未过期可跳过登录。需要桌面应用（`npm run tauri dev`），浏览器预览模式不可用。

写入采用「临时文件 + 重命名」保证原子性；如果启动时发现 `trips.json` 无法解析，会把它改名为 `trips.corrupt-<时间戳>.json` 保留在同目录，再从空档案开始。

## 车站数据

`src/assets/stations.json` 是 12306 全量车站表（3384 站，取自 `kyfw.12306.cn/otn/resources/js/framework/station_name.js`，2026-09），`id` 即电报码，`city` 直接沿用 12306 的城市字段（口径为地级市 / 直辖市 / 自治州，例如昆山南 → 苏州、义乌 → 金华）。经纬度以 OpenStreetMap 的 `railway=station` 节点为主（WGS84），OSM 缺失或同名歧义无法判断时退回 [pooobaby/train](https://github.com/pooobaby/train) / heywhale 车站坐标集；5 个站无坐标，约 20 个偏远小站坐标可能不准。同城车站的归并只看 `city` 字段，`cityFromStationName` 仅用于 OCR 识别出的、不在表里的站。
