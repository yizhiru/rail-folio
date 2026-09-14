import { useCallback, useState } from "react";
import { demoArchive } from "./data/seed";
import type { TripInput } from "./domain/types";
import { EditorPage } from "./ui/editor/EditorPage";
import { IngestPage } from "./ui/ingest/IngestPage";
import { useIngest } from "./ui/ingest/useIngest";
import { OverviewPage } from "./ui/overview/OverviewPage";
import { PageHelp } from "./ui/PageHelp";
import { StationDatalist } from "./ui/StationDatalist";
import { TripsPage } from "./ui/trips/TripsPage";
import { useArchive } from "./ui/useArchive";
import "./ui/theme.css";

type Page = "overview" | "trips" | "ingest" | "editor";

const NAV: Array<{ id: Page; label: string }> = [
  { id: "overview", label: "总览" },
  { id: "trips", label: "行程" },
  { id: "ingest", label: "导入" },
  { id: "editor", label: "录入" },
];

const PAGE_HELP: Record<Page, string> = {
  overview:
    "地图可滚轮缩放、拖动平移。城市按往来次数排，次数相同则最近到访的在前；同城车站已合并。总时长只累计同时有开车和到达时刻的行程；到达不晚于出发视为次日。票价合计只累计填写了金额的行程。",
  trips: "可按年份、车型筛选，或搜索车次、车站。到达时刻旁的 +1 表示次日到达。",
  ingest:
    "支持一次选多张、选整个文件夹，或把图片拖进窗口。也可以打开 12306 登录窗口同步订单。同一行程再导入只补空着的票价、席别、时刻等，已有信息不改。图片与订单都只在本机处理，账号密码不会保存。",
  editor: "可手录单条，或粘贴多条后先解析预览、核对勾选再导入。同一行程再导入只补空字段。导出用于备份。数据只保存在本机。",
};

function App() {
  const [page, setPage] = useState<Page>("overview");
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

  const ingest = useIngest({
    trips: archiveState.archive.trips,
    stations: archiveState.stations,
    onCommit: commitDrafts,
    onEnsureStation: addCustomStation,
    onDropStarted: goIngest,
  });

  const draftBadge = ingest.drafts.length > 0 ? ` ${ingest.drafts.length}` : "";

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">火车记</div>
        <nav className="nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? "active" : ""}
              type="button"
              onClick={() => setPage(item.id)}
            >
              {item.label}
              {item.id === "ingest" && draftBadge ? <span className="badge">{draftBadge}</span> : null}
            </button>
          ))}
        </nav>
        {archiveState.error ? <span className="notice">{archiveState.error}</span> : null}
        <PageHelp text={PAGE_HELP[page]} />
      </header>

      {archiveState.notice ? (
        <div className="notice banner">
          <span>{archiveState.notice}</span>
          <button className="btn secondary" type="button" onClick={archiveState.dismissNotice}>
            知道了
          </button>
        </div>
      ) : null}

      <StationDatalist stations={archiveState.stations} />

      {!archiveState.ready ? (
        <section className="page muted">正在读取本地档案…</section>
      ) : page === "overview" ? (
        <OverviewPage
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
    </div>
  );
}

export default App;
