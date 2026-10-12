import { formatTicketPrice } from "../../domain/price";
import type { YearCount } from "../../stats/summarize";
import type { EChartsOption } from "../charts/echarts";

const COUNT_COLOR = "#6ea8c9";
const SPEND_COLOR = "#d27a3a";
const AXIS = "#2a3544";

/** 年度图一次最多显示的年数；更早的年份翻页看。 */
export const YEAR_WINDOW = 16;

/** 把中间没有行程的年份补成 0 次，横轴才是连续的年份，不会把相隔几年的两年挨在一起。 */
export function fillYearGaps(years: YearCount[]): YearCount[] {
  if (years.length < 2) return years;
  const numbers = years.map((item) => Number(item.year));
  if (numbers.some((value) => !Number.isInteger(value))) return years;
  const byYear = new Map(years.map((item) => [Number(item.year), item]));
  const filled: YearCount[] = [];
  for (let year = Math.min(...numbers); year <= Math.max(...numbers); year += 1) {
    filled.push(byYear.get(year) ?? { year: String(year), count: 0, spend: undefined, pricedCount: 0 });
  }
  return filled;
}

export type YearWindow = {
  years: YearCount[];
  /** 0 是最近的一窗，数字越大越早。 */
  page: number;
  pageCount: number;
  /** 当前窗口的起止年份，如 `2009–2024`。 */
  label: string;
  hasOlder: boolean;
  hasNewer: boolean;
};

/** 取最近 `size` 年为第 0 页，往前一页一页翻；页码超出范围时收回到有效范围。 */
export function yearWindow(years: YearCount[], page: number, size: number = YEAR_WINDOW): YearWindow {
  const all = fillYearGaps(years);
  const pageCount = Math.max(1, Math.ceil(all.length / size));
  const current = Math.min(Math.max(0, Math.floor(page) || 0), pageCount - 1);
  const end = all.length - current * size;
  const slice = all.slice(Math.max(0, end - size), end);
  const first = slice[0]?.year;
  const last = slice[slice.length - 1]?.year;
  return {
    years: slice,
    page: current,
    pageCount,
    label: first && last && first !== last ? `${first}–${last}` : (first ?? ""),
    hasOlder: current < pageCount - 1,
    hasNewer: current > 0,
  };
}

/** 至少有一年填了票价，花费图才有东西可画。 */
export function hasYearSpend(years: YearCount[]): boolean {
  return years.some((item) => item.spend != null);
}

/** 纵轴刻度：一万以上用「万」，避免 5 位数挤占宽度。 */
export function formatSpendAxis(value: number): string {
  return value >= 10_000 ? `${Number((value / 10_000).toFixed(1))}万` : String(value);
}

/** 花费卡片标题旁的一句话：累计金额。没有任何票价时为空。 */
export function spendSummary(totalTicketPrice: number, pricedTripCount: number): string | undefined {
  return pricedTripCount > 0 ? `累计 ${formatTicketPrice(totalTicketPrice)}` : undefined;
}

/** 两张图共用同样的绘图区边距，年份上下对齐。 */
function baseOption(years: YearCount[]): EChartsOption {
  return {
    backgroundColor: "transparent",
    textStyle: { color: "#9aa6b5" },
    grid: { left: 40, right: 10, top: 20, bottom: 24 },
    xAxis: {
      type: "category",
      data: years.map((item) => item.year),
      axisLine: { lineStyle: { color: AXIS } },
      // 年份多时缩成「’09」，保证每一年都有标签。
      ...(years.length > 10
        ? { axisLabel: { interval: 0, formatter: (value: string) => `\u2019${value.slice(2)}` } }
        : {}),
    },
  };
}

function tooltipFor(years: YearCount[], describe: (item: YearCount) => string) {
  return (raw: unknown): string => {
    const items = Array.isArray(raw) ? raw : [raw];
    const index = (items[0] as { dataIndex?: number } | undefined)?.dataIndex ?? 0;
    const item = years[index];
    return item ? `${item.year} 年<br/>${describe(item)}` : "";
  };
}

/** 年度出行次数：蓝色柱。 */
export function buildYearCountOption(years: YearCount[]): EChartsOption {
  return {
    ...baseOption(years),
    tooltip: { trigger: "axis", formatter: tooltipFor(years, (item) => `${item.count} 次`) as never },
    yAxis: { type: "value", minInterval: 1, splitLine: { lineStyle: { color: AXIS } } },
    series: [
      {
        type: "bar",
        data: years.map((item) => item.count),
        itemStyle: { color: COUNT_COLOR, borderRadius: [6, 6, 0, 0] },
        barMaxWidth: 36,
      },
    ],
  };
}

/** 年度花费：橙色柱，年份与次数图对齐；一条票价都没填的年份不画柱，而不是画成 0。 */
export function buildYearSpendOption(years: YearCount[]): EChartsOption {
  const describe = (item: YearCount): string =>
    item.count === 0 ? "没有出行" : item.spend == null ? "未填票价" : `花费 ${formatTicketPrice(item.spend)}`;
  return {
    ...baseOption(years),
    tooltip: { trigger: "axis", formatter: tooltipFor(years, describe) as never },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: AXIS } },
      axisLabel: { formatter: (value: number) => formatSpendAxis(value) },
    },
    series: [
      {
        type: "bar",
        data: years.map((item) => item.spend ?? null),
        itemStyle: { color: SPEND_COLOR, borderRadius: [6, 6, 0, 0] },
        barMaxWidth: 36,
      },
    ],
  };
}
