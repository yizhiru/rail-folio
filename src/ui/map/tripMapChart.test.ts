import { describe, expect, it } from "vitest";
import { bundledStations } from "../../assets/stations";
import type { Trip } from "../../domain/types";
import { buildMapLegend, buildMapSeries } from "./tripMapChart";

function trip(partial: Partial<Trip>): Trip {
  return {
    id: crypto.randomUUID(),
    date: "2024-01-01",
    trainNo: "G1",
    category: "G",
    fromStationId: "HGH",
    toStationId: "UUH",
    source: "manual",
    fingerprint: crypto.randomUUID(),
    ...partial,
  };
}

describe("buildMapSeries", () => {
  it("keeps reverse OD pairs as two arcs", () => {
    const series = buildMapSeries(
      [
        trip({ fromStationId: "HGH", toStationId: "UUH" }),
        trip({ fromStationId: "UUH", toStationId: "HGH" }),
      ],
      bundledStations,
      { granularity: "station" },
    );
    const lines = (
      series[0] as { data: Array<{ fromName: string; toName: string; lineStyle: { curveness: number } }> }
    ).data;
    expect(lines).toHaveLength(2);
    expect(lines[0].lineStyle.curveness).toBe(lines[1].lineStyle.curveness);
  });

  it("thickens lines by adaptive frequency tiers", () => {
    const series = buildMapSeries(
      [
        trip({ fromStationId: "HGH", toStationId: "UUH" }),
        trip({ fromStationId: "HGH", toStationId: "AOH" }),
        trip({ fromStationId: "HGH", toStationId: "AOH" }),
        ...Array.from({ length: 8 }, () => trip({ fromStationId: "HGH", toStationId: "VNP" })),
      ],
      bundledStations,
      { granularity: "station" },
    );
    const lines = (series[0] as { data: Array<{ count: number; lineStyle: { width: number } }> }).data;
    const widthByCount = new Map(lines.map((line) => [line.count, line.lineStyle.width]));
    expect(widthByCount.get(1)).toBeLessThan(widthByCount.get(2) ?? 0);
    expect(widthByCount.get(2)).toBeLessThan(widthByCount.get(8) ?? 0);
  });

  it("merges categories on the same directed pair", () => {
    const series = buildMapSeries(
      [
        trip({ fromStationId: "HGH", toStationId: "UUH", category: "G" }),
        trip({ fromStationId: "HGH", toStationId: "UUH", category: "D", trainNo: "D1" }),
      ],
      bundledStations,
      { granularity: "station" },
    );
    const lines = (series[0] as { data: Array<{ count: number }> }).data;
    expect(lines).toHaveLength(1);
    expect(lines[0].count).toBe(2);
  });

  it("lets a station highlight exactly the lines that touch it", () => {
    const series = buildMapSeries(
      [
        trip({ fromStationId: "HGH", toStationId: "UUH" }),
        trip({ fromStationId: "HGH", toStationId: "AOH" }),
        trip({ fromStationId: "AOH", toStationId: "UUH" }),
      ],
      bundledStations,
      { granularity: "station" },
    );
    const lines = (series[0] as { data: Array<{ fromId: string; toId: string }> }).data;
    const points = (
      series[1] as { data: Array<{ name: string; lineIndices: number[] }> }
    ).data;
    expect(points).toHaveLength(3);
    for (const point of points) {
      expect(point.lineIndices).toHaveLength(2);
      for (const index of point.lineIndices) {
        const line = lines[index];
        const station = bundledStations.find((item) => item.name === point.name);
        expect([line.fromId, line.toId]).toContain(station?.id);
      }
    }
  });

  it("reports departures and arrivals on a station", () => {
    const series = buildMapSeries(
      [
        trip({ fromStationId: "HGH", toStationId: "UUH" }),
        trip({ fromStationId: "HGH", toStationId: "UUH" }),
        trip({ fromStationId: "UUH", toStationId: "HGH" }),
      ],
      bundledStations,
      { granularity: "station" },
    );
    const points = (
      series[1] as { data: Array<{ name: string; departures: number; arrivals: number }> }
    ).data;
    const hgh = bundledStations.find((station) => station.id === "HGH");
    const point = points.find((item) => item.name === hgh?.name);
    expect(point).toMatchObject({ departures: 2, arrivals: 1 });
  });

  it("grows marks with the zoom scale but keeps the share image fixed", () => {
    const trips = [
      trip({ fromStationId: "HGH", toStationId: "UUH" }),
      trip({ fromStationId: "HGH", toStationId: "UUH" }),
    ];
    const widthOf = (scale: number, share = false) =>
      (buildMapSeries(trips, bundledStations, { granularity: "station", share, scale })[0] as {
        data: Array<{ lineStyle: { width: number } }>;
      }).data[0].lineStyle.width;
    expect(widthOf(1.5)).toBeGreaterThan(widthOf(1));
    expect(widthOf(0.8)).toBeLessThan(widthOf(1));
    expect(widthOf(1.5, true)).toBe(widthOf(1, true));
  });

  it("shortens long arcs and keeps the pair on the same side", () => {
    const series = buildMapSeries(
      [
        trip({ fromStationId: "HGH", toStationId: "UUH" }),
        trip({ fromStationId: "UUH", toStationId: "HGH" }),
      ],
      bundledStations,
      { granularity: "station" },
    );
    const lines = (series[0] as { data: Array<{ lineStyle: { curveness: number } }> }).data;
    for (const line of lines) {
      expect(line.lineStyle.curveness).toBeGreaterThanOrEqual(0.14);
      expect(line.lineStyle.curveness).toBeLessThanOrEqual(0.3);
    }
  });
});

describe("buildMapLegend", () => {
  it("lists tiers and counts trips that cannot be drawn", () => {
    const stations = [...bundledStations, { id: "custom:无坐标", name: "无坐标" }];
    const legend = buildMapLegend(
      [
        trip({ fromStationId: "HGH", toStationId: "UUH" }),
        trip({ fromStationId: "HGH", toStationId: "UUH" }),
        trip({ fromStationId: "HGH", toStationId: "custom:无坐标" }),
      ],
      stations,
      "station",
    );
    expect(legend.tiers).toHaveLength(1);
    expect(legend.tiers[0].label).toBe("2 次");
    expect(legend.unplotted).toBe(1);
  });

  it("is empty when there are no trips", () => {
    expect(buildMapLegend([], bundledStations, "station")).toEqual({ tiers: [], unplotted: 0 });
  });
});

describe("city granularity", () => {
  // AOH 上海虹桥 / SNH 上海南 同属上海；HGH 杭州东 / HZH 杭州 同属杭州。
  const trips = [
    trip({ fromStationId: "AOH", toStationId: "HGH" }),
    trip({ fromStationId: "SNH", toStationId: "HZH" }),
    trip({ fromStationId: "HGH", toStationId: "AOH" }),
  ];

  type Series = Array<{ data: unknown[] }>;

  it("draws one arc per city pair and direction, and one point per city", () => {
    const series = buildMapSeries(trips, bundledStations, { granularity: "city" }) as unknown as Series;
    expect(series[0].data).toHaveLength(2);
    const points = series[1].data as Array<{ name: string; stations: Array<{ name: string }> }>;
    expect(points.map((point) => point.name).sort()).toEqual(["上海", "杭州"]);
    expect(points.find((point) => point.name === "上海")?.stations).toHaveLength(2);
  });

  it("highlights every line of a city, and the same data drives station mode unchanged", () => {
    const series = buildMapSeries(trips, bundledStations, { granularity: "city" }) as unknown as Series;
    const points = series[1].data as Array<{ lineIndices: number[] }>;
    for (const point of points) expect(point.lineIndices).toHaveLength(2);
    const station = buildMapSeries(trips, bundledStations, { granularity: "station" }) as unknown as Series;
    expect(station[0].data).toHaveLength(3);
    expect(station[1].data).toHaveLength(4);
  });

  it("lists the actual stations in the tooltips only when they add information", () => {
    const series = buildMapSeries(trips, bundledStations, { granularity: "city" }) as unknown as Array<{
      data: unknown[];
      tooltip: { formatter: (params: { data: unknown }) => string };
    }>;
    const line = series[0].data[0];
    const lineTip = series[0].tooltip.formatter({ data: line });
    expect(lineTip).toContain("车站：");
    const point = (series[1].data as Array<{ name: string }>).find((item) => item.name === "上海");
    expect(series[1].tooltip.formatter({ data: point })).toContain("车站：上海虹桥 2、上海南 1");

    const stationSeries = buildMapSeries(trips, bundledStations, {
      granularity: "station",
    }) as unknown as typeof series;
    expect(stationSeries[0].tooltip.formatter({ data: stationSeries[0].data[0] })).not.toContain("车站：");
    expect(stationSeries[1].tooltip.formatter({ data: stationSeries[1].data[0] })).not.toContain("车站：");
  });

  it("builds the legend from city-level lines", () => {
    // 城市：上海 → 杭州 合并成 2 次，反向 1 次；车站：三条线各 1 次。
    expect(buildMapLegend(trips, bundledStations, "city").tiers.map((tier) => tier.label)).toEqual([
      "1 次",
      "2 次",
    ]);
    expect(buildMapLegend(trips, bundledStations, "station").tiers.map((tier) => tier.label)).toEqual([
      "1 次",
    ]);
  });
});

describe("map labels", () => {
  it("uses distinct city and station symbols while keeping every visit interactive", () => {
    const trips = [trip({ fromStationId: "HGH", toStationId: "AOH" })];
    for (const granularity of ["city", "station"] as const) {
      const series = buildMapSeries(trips, bundledStations, { granularity });
      const points = series[1] as {
        symbol: string; data: Array<{ id: string; lineIndices: number[] }>;
        itemStyle: { color: string }; symbolSize: (value: number[]) => number;
      };
      expect(points.symbol).toBe(granularity === "city" ? "circle" : "roundRect");
      expect(points.itemStyle.color).toBe("#82c9c2");
      expect(points.data).toHaveLength(2);
      expect(new Set(points.data.map((point) => point.id)).size).toBe(2);
      for (const point of points.data) expect(point.lineIndices).toEqual([0]);
      expect(points.symbolSize([0, 0, 100])).toBeLessThanOrEqual(10);
      expect((series[2] as { data: unknown[] }).data).toEqual([]);
    }
  });

  it("adds noninteractive halos only to the top three above-median places", () => {
    const stations = Array.from({ length: 12 }, (_, i) => ({
      id: `s${i}`, name: `站${i}`, city: `城${i}`, lng: 90 + i, lat: 30 + i / 3,
    }));
    const trips = stations.slice(1).flatMap((station, i) =>
      Array.from({ length: i < 4 ? 14 - i : 1 }, () => trip({ fromStationId: "s0", toStationId: station.id })));
    for (const granularity of ["city", "station"] as const) {
      const series = buildMapSeries(trips, stations, { granularity });
      const points = (series[1] as { data: Array<{ name: string; label: { show: boolean } }> }).data;
      const halos = series[2] as { silent: boolean; data: Array<{ name: string }> };
      expect(points).toHaveLength(12);
      expect(halos.silent).toBe(true);
      expect(halos.data.map((point) => point.name)).toEqual(
        [0, 1, 2].map((i) => `${granularity === "city" ? "城" : "站"}${i}`),
      );
      for (const halo of halos.data) expect(points.some((p) => p.name === halo.name)).toBe(true);
    }
  });

  it("uses projected layout without dropping points or changing share labels", () => {
    const stations = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, name: `站${i}`, city: `城${i}`, lng: 90 + i, lat: 30 + i / 3 }));
    const trips = stations.slice(1).map((station) => trip({ fromStationId: "s0", toStationId: station.id }));
    const viewport = { width: 800, height: 500, zoom: 1.15, project: ([lng]: [number, number]) => [100 + (lng - 90) * 10, 200] };
    const pointsAt = (share = false) => (buildMapSeries(trips, stations, { granularity: "city", labelViewport: viewport, share })[1] as {
      data: Array<{ name: string; label: { show: boolean } }>;
    }).data;
    expect(pointsAt()).toHaveLength(20);
    expect(pointsAt().filter((p) => p.label.show).length).toBeLessThan(20);
    expect(pointsAt().find((p) => p.name === "城0")?.label.show).toBe(true);
    expect(pointsAt(true).filter((p) => p.label.show)).toHaveLength(8);
  });
});
