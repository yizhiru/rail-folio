import { describe, expect, it } from "vitest";
import type { YearCount } from "../../stats/summarize";
import {
  buildYearCountOption,
  buildYearSpendOption,
  fillYearGaps,
  formatSpendAxis,
  hasYearSpend,
  spendSummary,
  YEAR_WINDOW,
  yearWindow,
} from "./yearChart";

const years: YearCount[] = [
  { year: "2023", count: 3, spend: 300.3, pricedCount: 2 },
  { year: "2024", count: 1, spend: undefined, pricedCount: 0 },
  { year: "2025", count: 2, spend: 1200, pricedCount: 2 },
];

type Series = Array<{ type: string; data: Array<number | null> }>;
type Option = { tooltip: { formatter: (raw: unknown) => string }; xAxis: { data: string[] } };

describe("year charts", () => {
  it("draws counts and spend as two bar charts on the same years", () => {
    const counts = buildYearCountOption(years);
    const spend = buildYearSpendOption(years);
    expect((counts.series as Series).map((item) => item.type)).toEqual(["bar"]);
    expect((spend.series as Series).map((item) => item.type)).toEqual(["bar"]);
    expect((counts.series as Series)[0].data).toEqual([3, 1, 2]);
    expect((spend.series as Series)[0].data).toEqual([300.3, null, 1200]);
    expect((counts as unknown as Option).xAxis.data).toEqual((spend as unknown as Option).xAxis.data);
  });

  it("leaves a year without any fare empty and says why in the tooltip", () => {
    const tip = (buildYearSpendOption(years) as unknown as Option).tooltip.formatter;
    expect(tip([{ dataIndex: 1 }])).toContain("未填票价");
  });

  it("keeps the spend tooltip short, without coverage details", () => {
    const tip = (buildYearSpendOption(years) as unknown as Option).tooltip.formatter;
    expect(tip([{ dataIndex: 0 }])).toBe("2023 年<br/>花费 300.3 元");
    expect(tip([{ dataIndex: 2 }])).toBe("2025 年<br/>花费 1200 元");
  });

  it("shows the count in the count tooltip", () => {
    const tip = (buildYearCountOption(years) as unknown as Option).tooltip.formatter;
    expect(tip([{ dataIndex: 0 }])).toBe("2023 年<br/>3 次");
  });
});

describe("hasYearSpend / spendSummary", () => {
  it("detects whether any year has a fare", () => {
    expect(hasYearSpend(years)).toBe(true);
    expect(hasYearSpend(years.map((item) => ({ ...item, spend: undefined, pricedCount: 0 })))).toBe(false);
  });

  it("writes just the total, and nothing when no fare was filled in", () => {
    expect(spendSummary(2542.5, 5)).toBe("累计 2542.5 元");
    expect(spendSummary(0, 0)).toBeUndefined();
  });
});

describe("formatSpendAxis", () => {
  it("shortens ten-thousands", () => {
    expect(formatSpendAxis(800)).toBe("800");
    expect(formatSpendAxis(12_000)).toBe("1.2万");
    expect(formatSpendAxis(20_000)).toBe("2万");
  });
});

const span = (from: number, to: number): YearCount[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ({
    year: String(from + i),
    count: 1,
    spend: 10,
    pricedCount: 1,
  }));

describe("fillYearGaps", () => {
  it("fills years without trips so the axis stays continuous", () => {
    const filled = fillYearGaps([
      { year: "2018", count: 2, spend: 50, pricedCount: 1 },
      { year: "2021", count: 1, spend: undefined, pricedCount: 0 },
    ]);
    expect(filled.map((item) => item.year)).toEqual(["2018", "2019", "2020", "2021"]);
    expect(filled[1]).toEqual({ year: "2019", count: 0, spend: undefined, pricedCount: 0 });
    expect(filled[0].count).toBe(2);
  });

  it("leaves a single year alone, and says there was no trip in an empty year", () => {
    expect(fillYearGaps([{ year: "2024", count: 1, spend: 1, pricedCount: 1 }])).toHaveLength(1);
    const gap = fillYearGaps([
      { year: "2018", count: 1, spend: 1, pricedCount: 1 },
      { year: "2020", count: 1, spend: 1, pricedCount: 1 },
    ]);
    const tip = (buildYearSpendOption(gap) as unknown as Option).tooltip.formatter;
    expect(tip([{ dataIndex: 1 }])).toBe("2019 年<br/>没有出行");
  });
});

describe("yearWindow", () => {
  it("defaults to a window of 16 years", () => {
    expect(YEAR_WINDOW).toBe(16);
  });

  it("shows everything, without a pager, when the years fit", () => {
    const view = yearWindow(span(2015, 2024), 0);
    expect(view.years).toHaveLength(10);
    expect(view.pageCount).toBe(1);
    expect(view.hasOlder || view.hasNewer).toBe(false);
    expect(view.label).toBe("2015–2024");
  });

  it("starts at the latest years and pages back, keeping every year exactly once", () => {
    const all = span(2000, 2024); // 25 年
    const latest = yearWindow(all, 0);
    expect(latest.years.map((item) => item.year)).toEqual(span(2009, 2024).map((item) => item.year));
    expect(latest).toMatchObject({ pageCount: 2, hasOlder: true, hasNewer: false, label: "2009–2024" });

    const older = yearWindow(all, 1);
    expect(older.years.map((item) => item.year)).toEqual(span(2000, 2008).map((item) => item.year));
    expect(older).toMatchObject({ hasOlder: false, hasNewer: true, label: "2000–2008" });

    const total = [...older.years, ...latest.years].reduce((sum, item) => sum + item.count, 0);
    expect(total).toBe(all.length);
  });

  it("clamps a page that is out of range", () => {
    expect(yearWindow(span(2000, 2024), 9).page).toBe(1);
    expect(yearWindow(span(2000, 2024), -3).page).toBe(0);
    expect(yearWindow([], 0).years).toEqual([]);
  });
});
