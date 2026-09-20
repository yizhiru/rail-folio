import { useEffect, useMemo, useState } from "react";
import { formatTicketPrice } from "../../domain/price";
import { TRAIN_CATEGORY_LABEL, type Station, type TrainCategory, type Trip } from "../../domain/types";
import { CATEGORY_COLORS } from "../../map/buildLayers";
import {
  analyzeYear,
  listYears,
  type YearView,
} from "../../stats/analyze";
import { EChart } from "../charts/EChart";
import type { EChartsOption } from "../charts/echarts";
import { DurationValue } from "../DurationValue";
import { TripMap } from "../map/TripMap";

type Props = {
  trips: Trip[];
  stations: Station[];
  onLoadDemo: () => void;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

type CategoryMetric = "count" | "price";

function categoryPieOption(
  items: Array<{ category: TrainCategory; value: number }>,
  formatValue: (value: number) => string,
): EChartsOption {
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      formatter: (raw) => {
        const item = (Array.isArray(raw) ? raw[0] : raw) as {
          name?: string;
          value?: number;
          percent?: number;
        };
        const name = escapeHtml(String(item.name ?? ""));
        const value = Number(item.value ?? 0);
        const percent = item.percent == null ? "" : `<br/>${item.percent}%`;
        return `${name}<br/>${escapeHtml(formatValue(value))}${percent}`;
      },
    },
    series: [
      {
        type: "pie",
        radius: ["40%", "64%"],
        data: items.map((item) => ({
          name: TRAIN_CATEGORY_LABEL[item.category],
          value: item.value,
          itemStyle: { color: CATEGORY_COLORS[item.category] },
        })),
        label: { color: "#ece7dc", fontSize: 11 },
        labelLine: { length: 6, length2: 8 },
      },
    ],
  };
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

  const pieOption = categoryPieOption(
    view.byCategory.map((item) => ({ category: item.category, value: item.tripCount })),
    (value) => `${value} 次`,
  );
  const pricePieOption = categoryPieOption(
    view.byCategory
      .filter((item) => item.totalTicketPrice > 0)
      .map((item) => ({ category: item.category, value: item.totalTicketPrice })),
    formatTicketPrice,
  );

  return { monthOption, cityOption, pieOption, pricePieOption };
}

export function AnalyzePage({ trips, stations, onLoadDemo }: Props) {
  const years = useMemo(() => listYears(trips), [trips]);
  const [year, setYear] = useState(years[0] ?? "");
  const [categoryMetric, setCategoryMetric] = useState<CategoryMetric>("count");
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
        <div className="cards cards-4">
          <article className="card">
            <div className="label">乘车次数</div>
            <div className="value">{slice.tripCount}</div>
          </article>
          <article className="card">
            <div className="label">往来城市</div>
            <div className="value">{slice.cityCount}</div>
          </article>
          <article className="card">
            <div className="label">乘车时长</div>
            <DurationValue minutes={slice.totalMinutes > 0 ? slice.totalMinutes : null} />
          </article>
          <article className="card">
            <div className="label">票价合计</div>
            <div className="value value-compact">{slice.ticketPriceLabel}</div>
            {slice.pricedTripCount > 0 && slice.pricedTripCount < slice.tripCount ? (
              <div className="hint">已填 {slice.pricedTripCount} 条</div>
            ) : null}
          </article>
        </div>
      ) : null}

      {year ? (
        <div className="card map-wrap">
          <TripMap trips={yearTrips} stations={stations} />
        </div>
      ) : null}

      {charts ? (
        <div className="grid-3">
          <article className="card">
            <div className="label">月度出行</div>
            {yearView && yearView.slice.tripCount === 0 ? (
              <div className="muted">这一年还没有行程</div>
            ) : (
              <EChart option={charts.monthOption} className="chart-wrap" />
            )}
          </article>
          <article className="card">
            <div className="label">往来城市</div>
            {yearView && yearView.topCities.length === 0 ? (
              <div className="muted">这一年还没有行程</div>
            ) : (
              <EChart option={charts.cityOption} className="chart-wrap" />
            )}
          </article>
          <article className="card">
            <div className="card-head">
              <div className="label">车型</div>
              <div className="seg" role="group" aria-label="车型统计口径">
                <button
                  type="button"
                  className={categoryMetric === "count" ? "active" : undefined}
                  aria-pressed={categoryMetric === "count"}
                  onClick={() => setCategoryMetric("count")}
                >
                  次数
                </button>
                <button
                  type="button"
                  className={categoryMetric === "price" ? "active" : undefined}
                  aria-pressed={categoryMetric === "price"}
                  onClick={() => setCategoryMetric("price")}
                >
                  金额
                </button>
              </div>
            </div>
            {yearView && yearView.byCategory.length === 0 ? (
              <div className="muted">这一年还没有行程</div>
            ) : categoryMetric === "price" && yearView && yearView.slice.pricedTripCount === 0 ? (
              <div className="muted">这一年还没有填写票价</div>
            ) : (
              <EChart
                option={categoryMetric === "price" ? charts.pricePieOption : charts.pieOption}
                className="chart-wrap"
              />
            )}
          </article>
        </div>
      ) : null}
    </section>
  );
}
