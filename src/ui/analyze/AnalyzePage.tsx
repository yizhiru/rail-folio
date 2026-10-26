import { useEffect, useMemo, useState } from "react";
import type { Station, Trip } from "../../domain/types";
import {
  analyzeYear,
  listYears,
  type YearView,
} from "../../stats/analyze";
import { EChart } from "../charts/EChart";
import type { EChartsOption } from "../charts/echarts";
import { DurationValue } from "../DurationValue";
import { TripMap } from "../map/TripMap";
import { useMapGranularity } from "../map/useMapGranularity";

type Props = {
  trips: Trip[];
  stations: Station[];
  onLoadDemo: () => void;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function yearCharts(view: YearView) {
  const axis = { axisLine: { lineStyle: { color: "#2a3544" } } };
  const split = { splitLine: { lineStyle: { color: "#2a3544" } } };

  const monthOption: EChartsOption = {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" },
    grid: { left: 28, right: 10, top: 20, bottom: 24 },
    xAxis: {
      type: "category",
      data: view.byMonth.map((item) => item.label),
      axisLabel: { color: "#ece7dc", fontSize: 11, interval: 0 },
      ...axis,
    },
    yAxis: { type: "value", minInterval: 1, ...split },
    series: [
      {
        type: "bar",
        data: view.byMonth.map((item) => item.count),
        itemStyle: { color: "#6ea8c9", borderRadius: [6, 6, 0, 0] },
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
        const city = view.topCities[point.dataIndex ?? 0];
        const stationsLabel = city?.stations.join("、") ?? "";
        return `${escapeHtml(String(point.name ?? ""))}<br/>往来 ${point.value} 次<br/>车站：${escapeHtml(stationsLabel)}`;
      },
    },
    grid: { left: 44, right: 16, top: 12, bottom: 20 },
    xAxis: { type: "value", minInterval: 1, ...split, ...axis },
    yAxis: {
      type: "category",
      inverse: true,
      data: view.topCities.map((item) => item.city),
      ...axis,
      axisLabel: { color: "#ece7dc" },
    },
    series: [
      {
        type: "bar",
        data: view.topCities.map((item) => item.count),
        itemStyle: { color: "#d27a3a", borderRadius: [0, 6, 6, 0] },
      },
    ],
  };

  return { monthOption, cityOption };
}

export function AnalyzePage({ trips, stations, onLoadDemo }: Props) {
  const years = useMemo(() => listYears(trips, stations), [trips, stations]);
  const [year, setYear] = useState(years[0] ?? "");
  const [granularity, setGranularity] = useMapGranularity();
  const yearTrips = useMemo(
    () => (year ? trips.filter((trip) => trip.date.slice(0, 4) === year) : []),
    [trips, year],
  );
  const yearView = useMemo(
    () => (year ? analyzeYear(trips, stations, year) : undefined),
    [trips, stations, year],
  );
  const charts = useMemo(() => (yearView ? yearCharts(yearView) : undefined), [yearView]);

  useEffect(() => {
    if (years.length === 0) {
      setYear("");
      return;
    }
    if (!years.includes(year)) setYear(years[0]);
  }, [years, year]);

  if (trips.length === 0) {
    return (
      <section className="page">
        <div className="card empty">
          <p>还没有乘车记录。可以从票面图片导入，或先载入示例数据看看分析。</p>
          <button className="btn" type="button" onClick={onLoadDemo}>
            载入示例数据
          </button>
        </div>
      </section>
    );
  }

  const slice = yearView?.slice;

  return (
    <section className="page">
      <div className="toolbar">
        <select value={year} onChange={(event) => setYear(event.target.value)} aria-label="年份">
          {years.map((item) => (
            <option key={item} value={item}>
              {item}年
            </option>
          ))}
        </select>
      </div>

      {slice ? (
        <div className="cards cards-6">
          <article className="card">
            <div className="label">乘车次数</div>
            <div className="value">{slice.tripCount}</div>
          </article>
          <article className="card">
            <div className="label">到过城市</div>
            <div className="value">{slice.cityCount}</div>
          </article>
          <article className="card">
            <div className="label">乘车时长</div>
            <DurationValue minutes={slice.totalMinutes > 0 ? slice.totalMinutes : null} />
          </article>
          <article className="card">
            <div className="label">总花费</div>
            <div className="value value-compact">{slice.ticketPriceLabel}</div>
            {slice.pricedTripCount > 0 && slice.pricedTripCount < slice.tripCount ? (
              <div className="hint">已填 {slice.pricedTripCount} 条</div>
            ) : null}
          </article>
          <article className="card">
            <div className="label">新增城市</div>
            <div className="value">{yearView?.newCityCount ?? 0}</div>
          </article>
          <article className="card">
            <div className="label">新增车站</div>
            <div className="value">{yearView?.newStationCount ?? 0}</div>
          </article>
        </div>
      ) : null}

      {year ? (
        <div className="card map-wrap">
          <TripMap
            trips={yearTrips}
            stations={stations}
            granularity={granularity}
            onGranularityChange={setGranularity}
          />
        </div>
      ) : null}

      {charts ? (
        <div className="grid-stats">
          <article className="card">
            <div className="label">月度出行</div>
            {yearView && yearView.slice.tripCount === 0 ? (
              <div className="muted">这一年还没有行程</div>
            ) : (
              <EChart option={charts.monthOption} className="chart-wrap" />
            )}
          </article>
          <article className="card">
            <div className="label">常去城市</div>
            {yearView && yearView.topCities.length === 0 ? (
              <div className="muted">这一年还没有行程</div>
            ) : (
              <EChart option={charts.cityOption} className="chart-wrap" />
            )}
          </article>
        </div>
      ) : null}
    </section>
  );
}
