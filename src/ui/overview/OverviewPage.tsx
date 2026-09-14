import { useEffect, useMemo, useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { isTauri, writeBinaryFile } from "../../data/repository";
import { TRAIN_CATEGORY_LABEL, type Station, type Trip } from "../../domain/types";
import { CATEGORY_COLORS } from "../../map/buildLayers";
import { summarizeTrips, type OverviewStats } from "../../stats/summarize";
import { EChart } from "../charts/EChart";
import type { EChartsOption } from "../charts/echarts";
import { TripMap } from "../map/TripMap";
import { ShareCardDialog } from "./ShareCardDialog";
import { copyImageBlob, downloadBlob, renderShareCard } from "./shareCard";

type Props = {
  trips: Trip[];
  stations: Station[];
  onLoadDemo: () => void;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function buildOptions(stats: OverviewStats) {
  const yearOption: EChartsOption = {
    backgroundColor: "transparent",
    textStyle: { color: "#9aa6b5" },
    tooltip: { trigger: "axis" },
    grid: { left: 28, right: 10, top: 20, bottom: 24 },
    xAxis: {
      type: "category",
      data: stats.byYear.map((item) => item.year),
      axisLine: { lineStyle: { color: "#2a3544" } },
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      splitLine: { lineStyle: { color: "#2a3544" } },
    },
    series: [
      {
        type: "bar",
        data: stats.byYear.map((item) => item.count),
        itemStyle: { color: "#6ea8c9", borderRadius: [6, 6, 0, 0] },
      },
    ],
  };

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

  return { yearOption, pieOption, cityOption };
}

export function OverviewPage({ trips, stations, onLoadDemo }: Props) {
  const stats = useMemo(() => summarizeTrips(trips, stations), [trips, stations]);
  const { yearOption, pieOption, cityOption } = useMemo(() => buildOptions(stats), [stats]);
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
      const blob = await renderShareCard(trips, stations, stats);
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
          <div className="label">乘车总时长</div>
          <div className="value value-compact">{stats.durationLabel}</div>
        </article>
        <article className="card">
          <div className="label">票价合计</div>
          <div className="value value-compact">{stats.ticketPriceLabel}</div>
          {stats.pricedTripCount > 0 && stats.pricedTripCount < stats.tripCount ? (
            <div className="hint">已填 {stats.pricedTripCount} 条</div>
          ) : null}
        </article>
      </div>

      <div className="card map-wrap">
        <div className="map-toolbar">
          <button className="btn" type="button" onClick={() => void generateShare()} disabled={shareBusy}>
            {shareBusy ? "生成中…" : "生成分享图片"}
          </button>
        </div>
        <TripMap trips={trips} stations={stations} />
      </div>
      {shareError && !shareUrl ? <div className="notice">{shareError}</div> : null}

      <div className="grid-3">
        <article className="card">
          <div className="label">车型占比</div>
          <EChart option={pieOption} className="chart-wrap" />
        </article>
        <article className="card">
          <div className="label">城市统计</div>
          {stats.topCities[0] ? (
            <div className="hint" style={{ marginBottom: 8 }}>
              最常出现：{stats.topCities[0].city}（{stats.topCities[0].stations.join("、")}）
            </div>
          ) : null}
          <EChart option={cityOption} className="chart-wrap" />
        </article>
        <article className="card">
          <div className="label">按年次数</div>
          <EChart option={yearOption} className="chart-wrap" />
        </article>
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
