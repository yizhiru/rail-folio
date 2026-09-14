# 火车记（Rail Folio）架构

个人乘车档案桌面应用：行程只存在本机，不经过自建后端。界面用 Web 技术实现，系统能力（文件、OCR、内嵌 12306 窗口）通过 Tauri 交给 Rust。

开发与打包步骤见仓库根目录 [README.md](../README.md)。界面与统计口径见 [product.md](product.md)。

## 技术栈

### 界面与构建

| 技术 | 版本（约） | 用途 |
|---|---|---|
| React | 19.1 | UI |
| TypeScript | 5.8 | 前端类型与业务逻辑 |
| Vite | 7.1 | 开发服务器与前端打包 |
| ECharts | 6.1 | 总览地图（geo + lines/scatter）、年次与车型图 |
| Vitest | 3.2 | 纯逻辑单元测试（Node 环境） |

根目录的 `package.json`、`tsconfig.json`、`vite.config.ts`、`vitest.config.ts` 是给这些工具读的配置，不是业务代码。

### 桌面壳

| 技术 | 版本（约） | 用途 |
|---|---|---|
| Tauri | 2.x | 把前端装进系统 WebView，提供 IPC |
| Rust | edition 2021 | 本机命令：档案 IO、OCR、12306 窗口 |
| tauri-plugin-dialog | 2 | 选文件 / 选文件夹 |
| tauri-plugin-opener | 2 | 用系统程序打开路径或链接 |
| serde / serde_json | 1 | Rust 侧 JSON |
| objc2 + objc2-vision | 0.6 / 0.3 | macOS Vision 框架做本机 OCR |

应用标识 `com.railfolio.app`，产品名「火车记」。当前打包目标是 macOS `.app`（`scripts/package-mac.sh`）。

### 运行时数据与外部站点

| 来源 | 用途 |
|---|---|
| 本机 `trips.json` 或浏览器 `localStorage` | 用户档案 |
| `src/assets/stations.json` | 内置 12306 全量车站（电报码、城市、经纬度） |
| `src/assets/china.geo.json` | 总览地图省界，按需动态加载 |
| kyfw.12306.cn（用户自行登录） | 订单同步；应用不保存账号密码 |
| OpenStreetMap / 第三方车站坐标集 | 生成车站经纬度时用过，运行时不再访问 |

`src/assets/mileage.json` 是客里表精简数据，里程统计下线后代码不再引用。

## 运行形态

```
┌─────────────────────────────────────────────┐
│  火车记.app（Tauri WebView）                 │
│  ┌─────────────┐    invoke / Channel        │
│  │ React UI    │ ◄────────────────────────► │ Rust 命令
│  │ TypeScript  │                            │ 档案 / OCR / 12306
│  └─────────────┘                            └──────────┬──────────┘
│        │                                                │
│        │ 行程 JSON                                      │ Vision OCR
│        ▼                                                │ 内嵌 WebView
│  ~/Library/Application Support/                         │
│    com.railfolio.app/trips.json                         ▼
└─────────────────────────────────────────────┘     kyfw.12306.cn
```

另有一条 **浏览器预览**：`npm run dev` 只跑 Vite。档案走 `localStorage`，没有 OCR、没有 12306 同步。用来看界面，不能当正式使用路径。

判断是否在 Tauri 里：`window` 上是否存在 `__TAURI_INTERNALS__`（`src/data/repository.ts`）。

## 目录

```
rail-folio/
  src/                    前端
    App.tsx               页签：总览 / 行程 / 导入 / 录入
    domain/               类型与无 IO 规则（指纹、城市、时长）
    data/                 档案读写、迁移、示例数据
    ingest/               OCR 文本 / 12306 订单 → 草稿
    stats/                总览数字
    map/                  地图图层数据
    ui/                   页面与钩子
    assets/               车站表、底图
  src-tauri/              桌面壳
    src/commands.rs       档案、OCR、读目录
    src/sync12306/        12306 登录窗口与拉单
  docs/                   架构说明、产品规则
```

依赖方向约定为：`ui` → `data` / `ingest` / `stats` / `map` → `domain`。页面不直接 `invoke` Rust，一律经过 `repository.ts`。

## 核心数据

档案版本当前为 **3**（`ARCHIVE_VERSION`）。读盘时 `normalizeArchive` 按版本迁移。

```ts
Archive { version, trips: Trip[], customStations: Station[] }
Trip    { id, date, trainNo, category, fromStationId, toStationId,
          departureTime?, arrivalTime?, seatClass?, ticketPrice?, distanceKm?, notes?, source, fingerprint }
Station { id /* 电报码 */, name, city, province?, lng?, lat? }
```

- **指纹** `date|车次|出发站|到达站`：同步与入库去重。同一指纹再导入时，只把档案里空着的时刻、席别、票价等补上，已有值不覆盖；没有任何新信息才跳过。
- **车站**：内置表 + 档案里的 `customStations`；OCR 遇到未知站名会生成 `custom:站名`。相邻两站去空格后若被更长站名盖住（`合肥西安` 先命中合肥西），会退回较短的拆法。
- **城市**：优先用车站的 `city`（12306 地级市口径）；只有自定义站才用站名推导。
- **来源** `ocr` | `12306-screenshot` | `12306` | `manual` | `json-import` | `demo`。

写入：先写 `trips.json.tmp` 再 rename。JSON 损坏时把原文件改名为 `trips.corrupt-<时间戳>.json`，然后从空档案开始，避免覆盖用户数据。读盘失败则禁止整次运行写入。

## 前端分层

`App` 持有两份状态：

- `useArchive`：档案的唯一写入入口；写盘串行排队。
- `useIngest`：挂在 App 而不是导入页，切页签不会丢掉草稿。

| 页 | 做什么 |
|---|---|
| 总览 | 次数、车站数、城市数、乘车时长；ECharts 地图与图表 |
| 行程 | 列表、筛选、编辑、删除 |
| 导入 | 图片 OCR、文件夹、拖放、12306 同步 → 核对表；确认入库仅在有草稿后出现 |
| 录入 | 手工一条；导出备份 |

导入草稿是 `TripDraft`：识别结果可改，勾选后才变成 `Trip`。12306 同步按指纹跳过档案里已有且无法补充空字段的行程，以及当前核对列表里已有的行。同一趟车再导入时，会补上当时缺少的票价、席别、时刻等。

总时长只累计同时有开车与到达时刻的行程（`domain/duration.ts`），缺任一时刻则不计入。票价合计只累计填写了 `ticketPrice` 的行程。

## Rust 命令

由主窗口经 IPC 调用（`capabilities/default.json` 只授权 `main`）：

| 命令 | 作用 |
|---|---|
| `load_archive` / `save_archive` / `backup_archive` | 档案文件 |
| `ocr_images` | 并行 OCR，每张完成通过 Channel 推前端 |
| `list_images` | 目录下图片（深度 ≤ 2，最多 200 张） |
| `read_text_file` / `write_text_file` | 读写用户选定的文本文件；录入页导出走 `write_text_file` |
| `sync_12306_orders` | 打开或复用 12306 窗口，登录后同源拉单 |

OCR 仅 macOS：Vision `VNRecognizeTextRequest`，语言 `zh-Hans` / `zh-Hant` / `en-US`。

12306 同步：新建 WebView 加载 `kyfw.12306.cn` 登录页，用户在窗口内登录。注入脚本请求 `checkUser`、`queryMyOrder`（未出行 + 近两年历史）、`queryMyOrderNoComplete`。账号密码不回传到应用；cookie 留在该 WebView。拉回的原始票面由 `src/ingest/from12306.ts` 收成草稿。

## 测试与构建

- `npm test`：Vitest，覆盖指纹、城市、解析、档案迁移、12306 票面映射、统计等，不启动窗口。
- `npm run build`：`tsc && vite build`，输出 `dist/`，供 `tauri build` 打进应用。

前端与 Rust 之间的契约是 `invoke` 的命令名和 JSON 形状；没有 OpenAPI，改命令时两边一起改。
