import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Station, Trip } from "../../domain/types";
import { buildMapGraph, zoomScale, type MapGranularity } from "../../map/buildLayers";
import {
  buildMapLegend,
  buildMapSeries,
  DEFAULT_ZOOM,
  ensureChinaMap,
  geoOption,
  mapFrame,
  ZOOM_RANGE,
} from "./tripMapChart";
import { echarts, type EChartsType } from "../charts/echarts";

type Props = {
  trips: Trip[];
  stations: Station[];
  granularity: MapGranularity;
  onGranularityChange: (granularity: MapGranularity) => void;
  /** 放在右上角、粒度开关右边的额外操作（如导出图片）。 */
  actions?: ReactNode;
};

const GRANULARITY_OPTIONS: Array<{ value: MapGranularity; label: string }> = [
  { value: "city", label: "城市" },
  { value: "station", label: "车站" },
];

export function TripMap({ trips, stations, granularity, onGranularityChange, actions }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [mapLoaded, setMapLoaded] = useState(false);
  // 点和线随缩放略微放大 / 收小；按 0.1 一档取整，避免滚轮每一格都重画。
  const [scale, setScale] = useState(1);
  const graph = useMemo(() => buildMapGraph(trips, stations, granularity), [trips, stations, granularity]);
  const series = useMemo(
    () => buildMapSeries(trips, stations, { granularity, scale }, graph),
    [trips, stations, granularity, scale, graph],
  );
  const legend = useMemo(
    () => buildMapLegend(trips, stations, granularity, graph),
    [trips, stations, granularity, graph],
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setMapError(null);
    setMapLoaded(false);
    let disposed = false;
    let chart: EChartsType | undefined;
    let observer: ResizeObserver | undefined;
    void ensureChinaMap().then(() => {
      if (disposed) return;
      chart = echarts.init(el, undefined, { renderer: "canvas" });
      chart.setOption({ ...mapFrame(false), animationDuration: 400 });

      const current = chart;
      current.on("georoam", (params) => {
        // 只有缩放事件带 zoom；平移时不用重算。
        if ((params as { zoom?: number }).zoom == null) return;
        const option = current.getOption() as { geo?: Array<{ zoom?: number }> };
        setScale(zoomScale(option.geo?.[0]?.zoom ?? DEFAULT_ZOOM, DEFAULT_ZOOM));
      });
      // 悬停车站时，点亮与它相连的全部线路（线系列是第 0 个系列）。
      current.on("mouseover", { seriesType: "scatter" }, (params) => {
        const indices = (params.data as { lineIndices?: number[] } | undefined)?.lineIndices;
        if (indices?.length) {
          current.dispatchAction({ type: "highlight", seriesIndex: 0, dataIndex: indices });
        }
      });
      current.on("mouseout", { seriesType: "scatter" }, () => {
        current.dispatchAction({ type: "downplay", seriesIndex: 0 });
      });

      chartRef.current = chart;
      observer = new ResizeObserver(() => chart?.resize());
      observer.observe(el);
      setMapLoaded(true);
    }).catch((err) => {
      if (!disposed) setMapError(err instanceof Error ? err.message : String(err));
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      chart?.dispose();
      chartRef.current = null;
    };
  }, [attempt]);

  useEffect(() => {
    if (!mapLoaded) return;
    chartRef.current?.setOption({ series }, { replaceMerge: ["series"] });
  }, [series, mapLoaded]);

  function bumpZoom(factor: number) {
    const chart = chartRef.current;
    if (!chart) return;
    const option = chart.getOption() as { geo?: Array<{ zoom?: number }> };
    const zoom = option.geo?.[0]?.zoom ?? DEFAULT_ZOOM;
    const next = Math.min(ZOOM_RANGE.max, Math.max(ZOOM_RANGE.min, zoom * factor));
    chart.setOption({ geo: { zoom: next } });
    setScale(zoomScale(next, DEFAULT_ZOOM));
  }

  function resetView() {
    chartRef.current?.setOption({ geo: geoOption() });
    setScale(1);
  }

  return (
    <div className="footprint-map">
      <div ref={ref} className="footprint-canvas" />
      {!mapLoaded ? <div className="footprint-loading muted">{mapError ? <>地图加载失败 <button type="button" className="btn secondary" onClick={() => setAttempt((n) => n + 1)}>重试</button></> : "正在加载地图…"}</div> : null}
      {mapLoaded && trips.length === 0 ? (
        <div className="footprint-loading muted footprint-empty">导入行程后，这里会出现你的足迹</div>
      ) : null}
      {legend.unplotted > 0 ? (
        <div className="footprint-note">
          有 {legend.unplotted} 条行程的车站缺少坐标，未画在地图上
        </div>
      ) : null}
      {legend.tiers.length > 0 ? (
        <ul className="footprint-legend" aria-label="线路次数图例">
          {legend.tiers.map((item) => (
            <li key={item.tier}>
              <svg width="26" height="8" aria-hidden="true">
                <line
                  x1="1"
                  y1="4"
                  x2="25"
                  y2="4"
                  stroke={item.color}
                  strokeOpacity={item.opacity}
                  strokeWidth={item.width + 0.6}
                  strokeLinecap="round"
                />
              </svg>
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="footprint-toolbar">
        <div className="seg" role="group" aria-label="地图粒度">
          {GRANULARITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={granularity === option.value ? "active" : undefined}
              aria-pressed={granularity === option.value}
              onClick={() => onGranularityChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {actions}
      </div>
      <div className="footprint-controls">
        <button className="map-chip" type="button" onClick={() => bumpZoom(1.25)}>
          放大
        </button>
        <button className="map-chip" type="button" onClick={() => bumpZoom(1 / 1.25)}>
          缩小
        </button>
        <button className="map-chip" type="button" onClick={resetView}>
          复位
        </button>
      </div>
    </div>
  );
}
