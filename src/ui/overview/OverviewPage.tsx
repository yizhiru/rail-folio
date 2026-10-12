import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { isTauri, writeBinaryFile } from "../../data/repository";
import { formatDateCn } from "../../domain/dateLabel";
import { formatTicketPrice } from "../../domain/price";
import { TRAIN_CATEGORY_LABEL, type Station, type Trip } from "../../domain/types";
import { CATEGORY_COLORS } from "../charts/categoryColors";
import { summarizeTrips, type OverviewStats } from "../../stats/summarize";
import { EChart } from "../charts/EChart";
import type { EChartsOption } from "../charts/echarts";
import { ActionMenu } from "../ActionMenu";
import { DurationValue } from "../DurationValue";
import { IconImage } from "../navIcons";
import { TripMap } from "../map/TripMap";
import { useMapGranularity } from "../map/useMapGranularity";
import {
  buildYearCountOption,
  buildYearSpendOption,
  hasYearSpend,
  spendSummary,
  yearWindow,
} from "./yearChart";
import { ShareCardDialog } from "./ShareCardDialog";
import { copyImageBlob, downloadBlob, renderShareCard } from "./shareCard";

type Props = {
  trips: Trip[];
  stations: Station[];
  onLoadDemo: () => void;
};

type HighlightTrip = { date: string; trainNo: string; fromName: string; toName: string };

/** 最贵 / 最长一程：主数字一行；下面一行是「起点 → 终点」加灰色的「日期 · 车次」。 */
function HighlightCard({
  label,
  value,
  trip,
}: {
  label: string;
  value: ReactNode;
  trip?: HighlightTrip;
}) {
  return (
    <article className="card">
      <div className="label">{label}</div>
      {value}
      {trip ? (
        <div className="highlight">
          <div className="route">
            {trip.fromName} → {trip.toName}
          </div>
          <div className="meta">
            {formatDateCn(trip.date)} · {trip.trainNo}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function buildOptions(stats: OverviewStats) {
  const pieOption: EChartsOption = {
    backgroundColor: "transparent",
    tooltip: { trigger: "item" },
    series: [
      {
        type: "pie",
        radius: ["40%", "64%"],
        data: stats.byCategory.map((item) => ({
          name: TRAIN_CATEGORY_LABEL[item.category],
          value: item.count,
          itemStyle: { color: CATEGORY_COLORS[item.category] },
        })),
        label: { color: "#ece7dc", fontSize: 11 },
        labelLine: { length: 6, length2: 8 },
      },
    ],
  };

  const cityOption: EChartsOption = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      formatter: (raw) => {
        const items = Array.isArray(raw) ? raw : [raw];
        const point = items[0] as { name?: string; value?: number; dataIndex?: number };
        const city = stats.topCities[point.dataIndex ?? 0];
        const stationsLabel = city?.stations.join("、") ?? "";
        return `${escapeHtml(String(point.name ?? ""))}<br/>往来 ${point.value} 次<br/>车站：${escapeHtml(stationsLabel)}`;
      },
    },
    grid: { left: 44, right: 16, top: 12, bottom: 20 },
    xAxis: {
      type: "value",
      minInterval: 1,
      splitLine: { lineStyle: { color: "#2a3544" } },
      axisLine: { lineStyle: { color: "#2a3544" } },
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: stats.topCities.map((item) => item.city),
      axisLine: { lineStyle: { color: "#2a3544" } },
      axisLabel: { color: "#ece7dc" },
    },
    series: [
      {
        type: "bar",
        data: stats.topCities.map((item) => item.count),
        itemStyle: { color: "#d27a3a", borderRadius: [0, 6, 6, 0] },
      },
    ],
  };

  return { pieOption, cityOption };
}

export function OverviewPage({ trips, stations, onLoadDemo }: Props) {
  const stats = useMemo(() => summarizeTrips(trips, stations), [trips, stations]);
  const [granularity, setGranularity] = useMapGranularity();
  const { pieOption, cityOption } = useMemo(() => buildOptions(stats), [stats]);
  // 年度两张图共用一个年份窗口：最近 16 年，更早的往前翻。
  const [yearPage, setYearPage] = useState(0);
  const yearView = useMemo(() => yearWindow(stats.byYear, yearPage), [stats.byYear, yearPage]);
  const yearCountOption = useMemo(() => buildYearCountOption(yearView.years), [yearView.years]);
  const spendLabel = spendSummary(stats.totalTicketPrice, stats.pricedTripCount);
  const yearSpendOption = useMemo(() => buildYearSpendOption(yearView.years), [yearView.years]);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const shareBlobRef = useRef<Blob | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (shareUrl) URL.revokeObjectURL(shareUrl);
    };
  }, [shareUrl]);

  async function generateShare() {
    if (shareBusy) return;
    setShareBusy(true);
    setShareError(null);
    setShareNotice(null);
    try {
      const blob = await renderShareCard(trips, stations, stats, granularity);
      if (!mountedRef.current) return;
      shareBlobRef.current = blob;
      setShareUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(blob);
      });
    } catch (err) {
      if (!mountedRef.current) return;
      setShareError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mountedRef.current) setShareBusy(false);
    }
  }

  async function copyShare() {
    const blob = shareBlobRef.current;
    if (!blob) return;
    setShareError(null);
    try {
      await copyImageBlob(blob);
      setShareNotice("已复制，可直接粘贴到微信、朋友圈或其他社交软件");
    } catch (err) {
      setShareError(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveShare() {
    const blob = shareBlobRef.current;
    if (!blob) return;
    setShareError(null);
    try {
      if (isTauri()) {
        const path = await save({
          defaultPath: "火车记-足迹.png",
          filters: [{ name: "PNG", extensions: ["png"] }],
        });
        if (!path) return;
        await writeBinaryFile(path, new Uint8Array(await blob.arrayBuffer()));
        setShareNotice(`已保存到 ${path}`);
        return;
      }
      downloadBlob(blob, "火车记-足迹.png");
      setShareNotice("已开始下载");
    } catch (err) {
      setShareError(err instanceof Error ? err.message : String(err));
    }
  }

  if (trips.length === 0) {
    return (
      <section className="page">
        <div className="card empty">
          <p>还没有乘车记录。可以从票面图片导入，或先载入示例数据看看总览。</p>
          <button className="btn" type="button" onClick={onLoadDemo}>
            载入示例数据
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="cards">
        <article className="card">
          <div className="label">乘车次数</div>
          <div className="value">{stats.tripCount}</div>
        </article>
        <article className="card">
          <div className="label">到过车站</div>
          <div className="value">{stats.stationCount}</div>
          {stats.topStation ? (
            <div className="hint">
              最常出现：{stats.topStation.name}（{stats.topStation.count} 次）
            </div>
          ) : null}
        </article>
        <article className="card">
          <div className="label">到过城市</div>
          <div className="value">{stats.cityCount}</div>
        </article>
        <article className="card">
          <div className="label">乘车时长</div>
          <DurationValue minutes={stats.totalMinutes} />
        </article>
        <article className="card">
          <div className="label">总花费</div>
          <div className="value value-compact">{stats.ticketPriceLabel}</div>
          {stats.pricedTripCount > 0 && stats.pricedTripCount < stats.tripCount ? (
            <div className="hint">已填 {stats.pricedTripCount} 条</div>
          ) : null}
        </article>
      </div>

      <div className="card map-wrap">
        <TripMap
          trips={trips}
          stations={stations}
          granularity={granularity}
          onGranularityChange={setGranularity}
          actions={
            <ActionMenu
              busy={shareBusy}
              items={[
                {
                  id: "share",
                  label: shareBusy ? "生成中…" : "生成分享图片",
                  icon: <IconImage />,
                  disabled: shareBusy,
                  onSelect: () => void generateShare(),
                },
              ]}
            />
          }
        />
      </div>
      {shareError && !shareUrl ? <div className="notice">{shareError}</div> : null}

      <div className="grid-years">
        <article className="card">
          <div className="card-head year-head">
            <div className="label">年度出行</div>
            {yearView.pageCount > 1 ? (
              <div className="pager" role="group" aria-label="年份范围">
                <button
                  type="button"
                  aria-label="更早的年份"
                  disabled={!yearView.hasOlder}
                  onClick={() => setYearPage(yearView.page + 1)}
                >
                  ‹
                </button>
                <span>{yearView.label}</span>
                <button
                  type="button"
                  aria-label="更近的年份"
                  disabled={!yearView.hasNewer}
                  onClick={() => setYearPage(yearView.page - 1)}
                >
                  ›
                </button>
              </div>
            ) : null}
          </div>
          <EChart option={yearCountOption} className="chart-wrap" />
        </article>
        <article className="card">
          <div className="card-head year-head">
            <div className="label">年度花费</div>
            {spendLabel ? <div className="hint">{spendLabel}</div> : null}
          </div>
          {hasYearSpend(stats.byYear) ? (
            <EChart option={yearSpendOption} className="chart-wrap" />
          ) : (
            <div className="muted chart-empty">还没有填写票价的行程</div>
          )}
        </article>
      </div>

      <div className="grid-3">
        <article className="card">
          <div className="label">车型占比</div>
          <EChart option={pieOption} className="chart-wrap" />
        </article>
        <article className="card">
          <div className="label">常去城市</div>
          <EChart option={cityOption} className="chart-wrap" />
        </article>
        <article className="card stack">
          <div className="label">常坐线路</div>
          <div style={{ overflowX: "auto" }}>
            <table className="table table-routes">
              <thead>
                <tr>
                  <th>区间</th>
                  <th className="num">次数</th>
                </tr>
              </thead>
              <tbody>
                {stats.topRoutes.map((row) => (
                  <tr key={`${row.fromName}|${row.toName}`}>
                    <td>
                      {row.fromName} → {row.toName}
                    </td>
                    <td className="num">{row.tripCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </div>
      <div className="cards cards-2">
        <HighlightCard
          label="最贵一程"
          value={
            <div className="value value-compact">
              {stats.maxPriceTrip ? formatTicketPrice(stats.maxPriceTrip.ticketPrice) : "—"}
            </div>
          }
          trip={stats.maxPriceTrip}
        />
        <HighlightCard
          label="最长一程"
          value={<DurationValue minutes={stats.longestTrip ? stats.longestTrip.minutes : null} />}
          trip={stats.longestTrip}
        />
      </div>
      {shareUrl ? (
        <ShareCardDialog
          imageUrl={shareUrl}
          busy={shareBusy}
          error={shareError}
          notice={shareNotice}
          onCopy={() => void copyShare()}
          onSave={() => void saveShare()}
          onClose={() => {
            setShareUrl((current) => {
              if (current) URL.revokeObjectURL(current);
              return null;
            });
            shareBlobRef.current = null;
            setShareError(null);
            setShareNotice(null);
          }}
        />
      ) : null}
    </section>
  );
}
