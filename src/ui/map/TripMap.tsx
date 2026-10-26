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

type FocusPoint = { id: string; dataIndex: number; lineIndices: number[] };

function focusPoint(chart: EChartsType, point: FocusPoint | null) {
  chart.dispatchAction({ type: "downplay", seriesIndex: [0, 1] });
  if (!point) return;
  chart.dispatchAction({ type: "highlight", seriesIndex: 1, dataIndex: point.dataIndex });
  if (point.lineIndices.length) {
    chart.dispatchAction({ type: "highlight", seriesIndex: 0, dataIndex: point.lineIndices });
  }
}

export function TripMap({ trips, stations, granularity, onGranularityChange, actions }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const selectedPointRef = useRef<FocusPoint | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [mapLoaded, setMapLoaded] = useState(false);
  // 地名布局按帧合并更新；点线大小仍按 0.1 一档随缩放变化。
  const [viewRevision, setViewRevision] = useState(0);
  const layoutFrameRef = useRef<number | null>(null);
  const [scale, setScale] = useState(1);
  const graph = useMemo(() => buildMapGraph(trips, stations, granularity), [trips, stations, granularity]);
  const legend = useMemo(
    () => buildMapLegend(trips, stations, granularity, graph),
    [trips, stations, granularity, graph],
  );

  function updateZoom(zoom: number) {
    setScale(zoomScale(zoom, DEFAULT_ZOOM));
    refreshLayout();
  }

  function refreshLayout() {
    if (layoutFrameRef.current != null) return;
    layoutFrameRef.current = requestAnimationFrame(() => {
      layoutFrameRef.current = null;
      setViewRevision((revision) => revision + 1);
    });
  }

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
      current.on("georoam", () => {
        const option = current.getOption() as { geo?: Array<{ zoom?: number }> };
        updateZoom(option.geo?.[0]?.zoom ?? DEFAULT_ZOOM);
      });
      // 第 0 个系列是线路，第 1 个是可交互节点；光晕不参与交互。
      current.on("mouseover", { seriesIndex: 1 }, (params) => {
        const data = params.data as { id: string; lineIndices: number[] };
        focusPoint(current, { ...data, dataIndex: params.dataIndex });
      });
      current.on("mouseout", { seriesIndex: 1 }, () => {
        focusPoint(current, selectedPointRef.current);
      });
      current.on("click", { seriesIndex: 1 }, (params) => {
        const data = params.data as { id: string; lineIndices: number[] };
        selectedPointRef.current = selectedPointRef.current?.id === data.id
          ? null : { ...data, dataIndex: params.dataIndex };
        focusPoint(current, selectedPointRef.current);
      });
      current.getZr().on("click", (event) => {
        if (event.target) return;
        selectedPointRef.current = null;
        focusPoint(current, null);
      });

      chartRef.current = chart;
      observer = new ResizeObserver(() => {
        chart?.resize();
        refreshLayout();
      });
      observer.observe(el);
      setMapLoaded(true);
    }).catch((err) => {
      if (!disposed) setMapError(err instanceof Error ? err.message : String(err));
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      if (layoutFrameRef.current != null) cancelAnimationFrame(layoutFrameRef.current);
      layoutFrameRef.current = null;
      chart?.dispose();
      chartRef.current = null;
    };
  }, [attempt]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!mapLoaded || !chart) return;
    const canvasRect = ref.current!.getBoundingClientRect();
    const obstacles = Array.from(ref.current!.parentElement!.querySelectorAll(
      ".footprint-toolbar, .footprint-controls, .footprint-legend, .footprint-note",
    )).map((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.left - canvasRect.left, y: rect.top - canvasRect.top, width: rect.width, height: rect.height };
    });
    const option = chart.getOption() as { geo?: Array<{ zoom?: number }> };
    const series = buildMapSeries(trips, stations, {
      granularity, scale,
      labelViewport: {
        width: chart.getWidth(), height: chart.getHeight(),
        zoom: option.geo?.[0]?.zoom ?? DEFAULT_ZOOM, obstacles,
        project: (coordinates) => chart.convertToPixel({ geoIndex: 0 }, coordinates),
      },
    }, graph);
    chart.setOption({ series }, { replaceMerge: ["series"] });
    const points = (series[1] as { data: Array<{ id: string; lineIndices: number[] }> }).data;
    const dataIndex = points.findIndex((point) => point.id === selectedPointRef.current?.id);
    selectedPointRef.current = dataIndex < 0 ? null : { ...points[dataIndex], dataIndex };
    focusPoint(chart, selectedPointRef.current);
  }, [trips, stations, granularity, scale, graph, viewRevision, mapLoaded]);

  function bumpZoom(factor: number) {
    const chart = chartRef.current;
    if (!chart) return;
    const option = chart.getOption() as { geo?: Array<{ zoom?: number }> };
    const zoom = option.geo?.[0]?.zoom ?? DEFAULT_ZOOM;
    const next = Math.min(ZOOM_RANGE.max, Math.max(ZOOM_RANGE.min, zoom * factor));
    chart.setOption({ geo: { zoom: next } });
    updateZoom(next);
  }

  function resetView() {
    selectedPointRef.current = null;
    if (chartRef.current) focusPoint(chartRef.current, null);
    chartRef.current?.setOption({ geo: geoOption() });
    updateZoom(DEFAULT_ZOOM);
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
      <div className="footprint-controls" role="group" aria-label="地图缩放">
        <button className="map-chip map-zoom" type="button" aria-label="放大地图" title="放大" disabled={!mapLoaded} onClick={() => bumpZoom(1.25)}>
          ＋
        </button>
        <button className="map-chip map-zoom" type="button" aria-label="缩小地图" title="缩小" disabled={!mapLoaded} onClick={() => bumpZoom(1 / 1.25)}>
          −
        </button>
        <button className="map-chip" type="button" title="恢复全国视野" disabled={!mapLoaded} onClick={resetView}>
          复位
        </button>
      </div>
    </div>
  );
}
