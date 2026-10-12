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
| `src/assets/stations.json` | 内置 12306 全量车站（电报码、城市、经纬度）。`city` 取地级市 / 直辖市；县级市、县、区的车站要写所属地级市（京山南 → 荆门），重庆各区县归重庆；省直辖县级市（仙桃、琼海等）和自治州 / 盟 / 地区内的车站沿用各自名称，不强并 |
| `src/assets/china.geo.json` | 总览地图省界，按需动态加载 |
| kyfw.12306.cn（用户自行登录） | 订单同步；应用不保存账号密码 |
| OpenStreetMap / 第三方车站坐标集 | 生成车站经纬度时用过，运行时不再访问 |

客里表与总里程统计已下线，来源与原始文件见 [deprecated.md](deprecated.md)。

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
    App.tsx               页签：总览 / 分析 / 行程 / 导入 / 录入
    domain/               类型与无 IO 规则（指纹、城市、时长）
    data/                 档案读写、迁移、示例数据
    ingest/               OCR 文本 / 12306 订单 → 草稿
    stats/                总览与分析数字
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

档案版本当前为 **4**（`ARCHIVE_VERSION`）。读盘时 `normalizeArchive` 按版本迁移。v4 增加可选的 `arrivalDayOffset`（跨日天数，0–30 整数），旧记录未填时继续按时刻推断。

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

写入：先写带进程 ID 和序号的独立临时文件，再 rename。JSON 损坏时把原文件改名为 `trips.corrupt-<时间戳>.json`，然后从空档案开始。版本不兼容、部分记录异常（无效日期 / 时刻、重复 ID 等）或读盘失败时，保留原档案并禁止整次运行写入，不再静默丢弃记录。迁移或修正指纹前复制原始档案到 `trips.before-migration-<时间戳>.json`，备份失败则停止加载。

## 前端分层

`App` 持有两份状态：

- `useArchive`：档案的唯一写入入口；`ArchiveWriter` 串行计算并写盘，成功后才发布内存快照。失败保持最后成功状态，重试重新写盘；自定义车站随引用它的行程一起保存。
- `useIngest`：挂在 App 而不是导入页，切页签不会丢掉草稿。

| 页 | 做什么 |
|---|---|
| 总览 | 次数、车站数、城市数、乘车时长；ECharts 地图与图表；常坐线路 |
| 分析 | 按年切换地图与图表；车型饼图可切换次数 / 金额 |
| 行程 | 列表、筛选、编辑、删除 |
| 导入 | 图片 OCR、文件夹、拖放、12306 同步 → 核对表；确认入库仅在有草稿后出现 |
| 录入 | 手工一条；智能导入 |

导入草稿是 `TripDraft`：识别结果可改，勾选后才变成 `Trip`。12306 同步按指纹跳过档案里已有且无法补充空字段的行程，以及当前核对列表里已有的行。同一趟车再导入时，会补上当时缺少的票价、席别、时刻等。

乘车时长只累计同时有开车与到达时刻的行程（`domain/duration.ts`），缺任一时刻则不计入；展示为 `11 h 11 min`，精确到分钟，不折成天。总花费只累计填写了 `ticketPrice` 的行程。

## Rust 命令

由主窗口经 IPC 调用（`capabilities/default.json` 只授权 `main`）：

| 命令 | 作用 |
|---|---|
| `load_archive` / `save_archive` / `backup_archive` | 档案文件 |
| `ocr_images` | 并行 OCR，每张完成通过 Channel 推前端 |
| `list_images` | 目录下图片（深度 ≤ 2，最多 200 张） |
| `read_text_file` / `write_text_file` | 读写用户选定的文本文件；侧栏「导出」走 `write_text_file` |
| `sync_12306_orders` | 打开或复用 12306 窗口，登录后同源拉单 |

OCR 仅 macOS：Vision `VNRecognizeTextRequest`，语言 `zh-Hans` / `zh-Hant` / `en-US`。

12306 同步：新建 WebView 加载 `kyfw.12306.cn` 登录页，用户在窗口内登录。确认登录后打开订单页 `train_order.html`，再注入脚本请求 `checkUser` / `login/conf`、`queryMyOrderNoComplete`、`queryMyOrder`（未出行按订票日期与乘车日期，历史按约 30 天一段往前查，接口拒绝更早的日期就停止）。账号密码不回传到应用；cookie 留在该 WebView。拉回的原始票面由 `src/ingest/from12306.ts` 收成草稿，并按用户填写的乘车人姓名（`passengerDTO.passenger_name`）过滤，同一订单里其他乘车人的票不入核对列表；姓名存在 `localStorage`。

## 测试与构建

- `cargo test --offline --manifest-path src-tauri/Cargo.toml`：验证原子写入、失败清理和并发临时文件隔离。
- 保存事务与恢复测试覆盖失败重试、并发提交、版本不兼容、异常记录和迁移备份失败。
- 页面按需加载；地图图层与图例共享聚合结果，缩放时复用聚合结果。
- `npm test`：Vitest，覆盖指纹、城市、解析、档案迁移、12306 票面映射、统计等，不启动窗口。
- `npm run build`：`tsc && vite build`，输出 `dist/`，供 `tauri build` 打进应用。

导出文件（`src/data/tripsCsv.ts`）是一张 CSV 行程表，与本机档案 `trips.json` 是两种格式：本机档案按电报码存车站、带 id 与指纹，供程序内部使用；CSV 只有站名与用户可见字段。`parseImportText` 能读 CSV 和旧的 JSON 档案。

前端与 Rust 之间的契约是 `invoke` 的命令名和 JSON 形状；没有 OpenAPI，改命令时两边一起改。
