import { useEffect, useMemo, useRef, useState } from "react";
import type { Station, Trip } from "../../domain/types";
import {
  buildMapSeries,
  DEFAULT_ZOOM,
  ensureChinaMap,
  geoOption,
  ZOOM_RANGE,
} from "./tripMapChart";
import { echarts, type EChartsType } from "../charts/echarts";

type Props = {
  trips: Trip[];
  stations: Station[];
};

export function TripMap({ trips, stations }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const series = useMemo(() => buildMapSeries(trips, stations), [trips, stations]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let disposed = false;
    let chart: EChartsType | undefined;
    let observer: ResizeObserver | undefined;
    void ensureChinaMap().then(() => {
      if (disposed) return;
      chart = echarts.init(el, undefined, { renderer: "canvas" });
      chart.setOption({
        backgroundColor: "#0b1018",
        animationDuration: 400,
        tooltip: {
          trigger: "item",
          backgroundColor: "#f4efe4",
          borderColor: "#d6cbb8",
          textStyle: { color: "#1a120c" },
        },
        geo: geoOption(),
      });
      chartRef.current = chart;
      observer = new ResizeObserver(() => chart?.resize());
      observer.observe(el);
      setMapLoaded(true);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      chart?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapLoaded) return;
    chartRef.current?.setOption({ series }, { replaceMerge: ["series"] });
  }, [series, mapLoaded]);

  function bumpZoom(factor: number) {
    const chart = chartRef.current;
    if (!chart) return;
    const option = chart.getOption() as { geo?: Array<{ zoom?: number }> };
    const zoom = option.geo?.[0]?.zoom ?? DEFAULT_ZOOM;
    chart.setOption({
      geo: { zoom: Math.min(ZOOM_RANGE.max, Math.max(ZOOM_RANGE.min, zoom * factor)) },
    });
  }

  function resetView() {
    chartRef.current?.setOption({ geo: geoOption() });
  }

  return (
    <div className="footprint-map">
      <div ref={ref} className="footprint-canvas" />
      {!mapLoaded ? <div className="footprint-loading muted">正在加载地图…</div> : null}
      <div className="footprint-controls">
        <button className="btn secondary" type="button" onClick={() => bumpZoom(1.25)}>
          放大
        </button>
        <button className="btn secondary" type="button" onClick={() => bumpZoom(1 / 1.25)}>
          缩小
        </button>
        <button className="btn secondary" type="button" onClick={resetView}>
          复位
        </button>
      </div>
    </div>
  );
}
