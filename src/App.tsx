import { lazy, Suspense, useCallback, useState, type ReactNode } from "react";
import { demoArchive } from "./data/seed";
import type { TripInput } from "./domain/types";
import { useIngest } from "./ui/ingest/useIngest";
import { exportArchive } from "./ui/exportArchive";
import { IconAnalyze, IconEditor, IconExport, IconIngest, IconOverview, IconTrips } from "./ui/navIcons";
import { PageHelp } from "./ui/PageHelp";
import { StationDatalist } from "./ui/StationDatalist";
import { useArchive } from "./ui/useArchive";
import "./ui/theme.css";

const EditorPage = lazy(() => import("./ui/editor/EditorPage").then((module) => ({ default: module.EditorPage })));

const IngestPage = lazy(() => import("./ui/ingest/IngestPage").then((module) => ({ default: module.IngestPage })));

const AnalyzePage = lazy(() => import("./ui/analyze/AnalyzePage").then((module) => ({ default: module.AnalyzePage })));

const OverviewPage = lazy(() => import("./ui/overview/OverviewPage").then((module) => ({ default: module.OverviewPage })));

const TripsPage = lazy(() => import("./ui/trips/TripsPage").then((module) => ({ default: module.TripsPage })));

type Page = "overview" | "analyze" | "trips" | "ingest" | "editor";

const NAV: Array<{ id: Page; label: string; group: string; icon: ReactNode }> = [
  { id: "overview", label: "总览", group: "浏览", icon: <IconOverview /> },
  { id: "analyze", label: "分析", group: "浏览", icon: <IconAnalyze /> },
  { id: "trips", label: "行程", group: "浏览", icon: <IconTrips /> },
  { id: "ingest", label: "导入", group: "记录", icon: <IconIngest /> },
  { id: "editor", label: "录入", group: "记录", icon: <IconEditor /> },
];

const PAGE_HELP: Record<Page, string> = {
  overview:
    "地图可滚轮缩放、拖动平移。常去城市按往来次数排，次数相同则最近到访的在前；同城车站已合并。常坐线路按方向分开，去和回各算一条。乘车时长只累计同时有开车和到达时刻的行程；到达不晚于出发视为次日。年度出行看次数，年度花费看金额。年度新增足迹按整份档案中首次出现的起讫城市、车站统计；跨年到达计入到达年份，同城多站只算一座城市。补录更早的行程会重新计算。三张年度图共用年份窗口。总花费、年度花费与最贵一程只看填写了金额的行程；最长一程只看同时有开车和到达时刻的行程。",
  analyze:
    "可切换年份。该年地图与总览相同，可滚轮缩放、拖动平移。月度出行按各月次数。次数、城市、时长、票价用卡片和图表看。票价、时长只累计已填写的。新增城市、车站按整份档案中的首次到访统计；跨年到达计入到达年份，同城多站只算一座城市。补录更早的行程会重新计算。年份可包含只有跨年首次到达、没有出发行程的一年。",
  trips: "可按年份、车型筛选，或搜索车次、车站。日期新的在前，同一天最晚出发的在前。到达时刻旁的 +N 表示 N 天后到达，跨日天数可在编辑中填写。",
  ingest:
    "支持一次选多张、选整个文件夹，或把图片拖进窗口。也可以打开 12306 登录窗口同步订单。同一行程再导入只补空着的票价、席别、时刻等，已有信息不改。图片与订单都只在本机处理，账号密码不会保存。",
  editor: "可手录单条，或粘贴多条后先解析预览、核对勾选再导入。同一行程再导入只补空字段。数据只保存在本机。",
};

function App() {
  const [page, setPage] = useState<Page>("overview");
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const archiveState = useArchive();
  const { upsertTrip, upsertTrips, addCustomStation } = archiveState;

  const commitDrafts = useCallback(
    async (rows: TripInput[]) => (await upsertTrips(rows)).persisted,
    [upsertTrips],
  );
  const saveOne = useCallback(
    async (input: TripInput) => (await upsertTrip(input)).persisted,
    [upsertTrip],
  );
  const goIngest = useCallback(() => setPage("ingest"), []);
  const exportJson = useCallback(async () => {
    setExporting(true);
    try {
      const message = await exportArchive(archiveState.archive);
      if (message) setExportNotice(message);
    } catch (err) {
      setExportNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }, [archiveState.archive]);

  const ingest = useIngest({
    trips: archiveState.archive.trips,
    stations: archiveState.stations,
    onCommit: commitDrafts,
    onEnsureStation: addCustomStation,
    onDropStarted: goIngest,
  });

  const draftCount = ingest.drafts.length;
  const groups = [...new Set(NAV.map((item) => item.group))];

  return (
    <div className="app">
      <header className="topbar">
        {archiveState.error ? <span className="notice">{archiveState.error}</span> : null}
        <PageHelp text={PAGE_HELP[page]} />
      </header>

      <aside className="sidebar">
        <nav className="nav">
          {groups.map((group) => (
            <div key={group} className="nav-section">
              <div className="nav-group">{group}</div>
              {NAV.filter((item) => item.group === group).map((item) => (
                <button
                  key={item.id}
                  className={page === item.id ? "active" : ""}
                  type="button"
                  onClick={() => setPage(item.id)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.id === "ingest" && draftCount > 0 ? <span className="badge">{draftCount}</span> : null}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <button
          className="sidebar-export"
          type="button"
          title="把行程导出为 CSV 表格"
          disabled={!archiveState.ready || exporting}
          onClick={() => void exportJson()}
        >
          <IconExport />
          <span>导出</span>
        </button>
        <div className="sidebar-foot">
          {archiveState.ready ? `${archiveState.archive.trips.length} 条行程 · 只在本机` : "数据只在本机"}
        </div>
      </aside>

      <div className="shell">
        {archiveState.notice ? (
          <div className="notice banner">
            <span>{archiveState.notice}</span>
            <button className="btn secondary" type="button" onClick={archiveState.dismissNotice}>
              知道了
            </button>
          </div>
        ) : null}
        {exportNotice ? (
          <div className="notice banner">
            <span>{exportNotice}</span>
            <button className="btn secondary" type="button" onClick={() => setExportNotice(null)}>
              知道了
            </button>
          </div>
        ) : null}

        <StationDatalist stations={archiveState.stations} />

        <Suspense fallback={<section className="page muted">正在加载页面…</section>}>
          {!archiveState.ready ? (
            <section className="page muted">正在读取本地档案…</section>
          ) : page === "overview" ? (
            <OverviewPage
              trips={archiveState.archive.trips}
              stations={archiveState.stations}
              onLoadDemo={() => void archiveState.replaceArchive(demoArchive(archiveState.stations))}
            />
          ) : page === "analyze" ? (
            <AnalyzePage
              trips={archiveState.archive.trips}
              stations={archiveState.stations}
              onLoadDemo={() => void archiveState.replaceArchive(demoArchive(archiveState.stations))}
            />
          ) : page === "trips" ? (
            <TripsPage
              trips={archiveState.archive.trips}
              stations={archiveState.stations}
              onDelete={(id) => void archiveState.removeTrip(id)}
              onUpdate={saveOne}
              onEnsureStation={addCustomStation}
            />
          ) : page === "ingest" ? (
            <IngestPage ingest={ingest} />
          ) : (
            <EditorPage
              archive={archiveState.archive}
              stations={archiveState.stations}
              onSave={saveOne}
              onSaveMany={commitDrafts}
              onEnsureStation={addCustomStation}
            />
          )}
        </Suspense>
      </div>
    </div>
  );
}

export default App;
