import { describe, expect, it } from "vitest";
import {
  buildMapGraph,
  countUnplottedTrips,
  DEFAULT_MAP_GRANULARITY,
  parseMapGranularity,
  formatLegendRange,
  lineCountBreaks,
  lineCurveness,
  lineLegendTiers,
  lineTier,
  mapLineVisual,
  stationCounts,
  stationVisits,
  tripLines,
  zoomScale,
  type LineTier,
} from "./buildLayers";
import { demoArchive } from "../data/seed";
import { bundledStations } from "../assets/stations";
import type { Trip } from "../domain/types";

function trip(partial: Partial<Trip>): Trip {
  return {
    id: crypto.randomUUID(),
    date: "2024-01-01",
    trainNo: "G1",
    category: "G",
    fromStationId: "a",
    toStationId: "b",
    source: "manual",
    fingerprint: crypto.randomUUID(),
    ...partial,
  };
}

describe("tripLines", () => {
  it("merges categories on the same directed OD, but keeps the reverse separate", () => {
    const trips = [
      trip({ fromStationId: "AOH", toStationId: "NJH" }),
      trip({ fromStationId: "AOH", toStationId: "NJH" }),
      trip({ fromStationId: "AOH", toStationId: "NJH", category: "D", trainNo: "D1" }),
      trip({ fromStationId: "NJH", toStationId: "AOH" }),
    ];
    const lines = tripLines(trips, bundledStations, "station");
    expect(lines).toHaveLength(2);
    expect(lines.find((line) => line.fromId === "AOH")?.count).toBe(3);
    expect(lines.find((line) => line.fromId === "NJH")?.count).toBe(1);
    expect(lines[0].fromName).toBe("上海虹桥");
  });

  it("builds lines for every demo trip", () => {
    const archive = demoArchive(bundledStations);
    expect(tripLines(archive.trips, bundledStations, "station")).toHaveLength(archive.trips.length);
  });

  it("records first / last date and the category mix per direction", () => {
    const lines = tripLines(
      [
        trip({ fromStationId: "AOH", toStationId: "NJH", date: "2024-03-02" }),
        trip({ fromStationId: "AOH", toStationId: "NJH", date: "2023-11-20", category: "D", trainNo: "D1" }),
        trip({ fromStationId: "AOH", toStationId: "NJH", date: "2025-01-05" }),
      ],
      bundledStations,
      "station",
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].firstDate).toBe("2023-11-20");
    expect(lines[0].lastDate).toBe("2025-01-05");
    expect(lines[0].categories).toEqual({ G: 2, D: 1 });
  });
});

describe("stationVisits / countUnplottedTrips", () => {
  it("splits departures and arrivals per station", () => {
    const visits = stationVisits([
      trip({ fromStationId: "AOH", toStationId: "NJH" }),
      trip({ fromStationId: "NJH", toStationId: "AOH" }),
      trip({ fromStationId: "AOH", toStationId: "NJH" }),
    ]);
    expect(visits.get("AOH")).toEqual({ departures: 2, arrivals: 1 });
    expect(visits.get("NJH")).toEqual({ departures: 1, arrivals: 2 });
  });

  it("counts trips with an endpoint that has no coordinates", () => {
    const stations = [...bundledStations, { id: "custom:无坐标", name: "无坐标" }];
    const trips = [
      trip({ fromStationId: "AOH", toStationId: "NJH" }),
      trip({ fromStationId: "NJH", toStationId: "custom:无坐标" }),
      trip({ fromStationId: "custom:无坐标", toStationId: "AOH" }),
      trip({ fromStationId: "AOH", toStationId: "missing-station" }),
    ];
    expect(countUnplottedTrips(trips, stations, "station")).toBe(3);
  });
});

describe("lineCurveness / zoomScale", () => {
  it("flattens long lines but keeps a visible arc for short ones", () => {
    const shanghai = { lng: 121.3, lat: 31.2 };
    const suzhou = { lng: 120.6, lat: 31.3 };
    const urumqi = { lng: 87.6, lat: 43.8 };
    const short = lineCurveness(shanghai, suzhou);
    const long = lineCurveness(shanghai, urumqi);
    expect(short).toBeGreaterThan(long);
    expect(long).toBeGreaterThanOrEqual(0.14);
    expect(short).toBeLessThanOrEqual(0.3);
    // 往返是同一弧度，由方向自然分到两侧。
    expect(lineCurveness(urumqi, shanghai)).toBe(long);
  });

  it("scales marks gently and stays within bounds", () => {
    expect(zoomScale(1.15, 1.15)).toBe(1);
    expect(zoomScale(6, 1.15)).toBeGreaterThan(1);
    expect(zoomScale(6, 1.15)).toBeLessThanOrEqual(1.7);
    expect(zoomScale(12, 1.15)).toBeLessThanOrEqual(1.7);
    expect(zoomScale(0.8, 1.15)).toBeLessThan(1);
    expect(zoomScale(0.8, 1.15)).toBeGreaterThanOrEqual(0.8);
    expect(zoomScale(Number.NaN, 1.15)).toBe(1);
  });
});

describe("lineLegendTiers", () => {
  it("lists only the tiers present, with the real count ranges", () => {
    const counts = [1, 1, 2, 2, 12];
    const tiers = lineLegendTiers(counts, lineCountBreaks(counts));
    expect(tiers.map((item) => item.tier)).toEqual(["low", "mid", "high"]);
    expect(tiers.map(formatLegendRange)).toEqual(["1 次", "2 次", "12 次"]);
  });

  it("shows a single entry when every direction has the same count", () => {
    const counts = [3, 3];
    const tiers = lineLegendTiers(counts, lineCountBreaks(counts));
    expect(tiers).toHaveLength(1);
    expect(formatLegendRange(tiers[0])).toBe("3 次");
  });

  it("returns nothing for an empty map", () => {
    expect(lineLegendTiers([], lineCountBreaks([]))).toEqual([]);
  });

  it("writes a range when a tier spans several counts", () => {
    const counts = [1, 2, 3, 10, 11, 12, 100];
    const tiers = lineLegendTiers(counts, lineCountBreaks(counts));
    expect(tiers.map(formatLegendRange)).toEqual(["1–3 次", "10–12 次", "100 次"]);
  });
});

describe("lineCountBreaks / mapLineVisual", () => {
  it("keeps a single frequency in the low tier", () => {
    const breaks = lineCountBreaks([1, 1, 1]);
    expect(lineTier(1, breaks)).toBe("low");
    expect(mapLineVisual(1, breaks)).toEqual(mapLineVisual(1, lineCountBreaks([4, 4])));
  });

  it("uses two weights when there are only two frequencies", () => {
    const breaks = lineCountBreaks([1, 1, 5]);
    expect(lineTier(1, breaks)).toBe("low");
    expect(lineTier(5, breaks)).toBe("high");
    const thin = mapLineVisual(1, breaks);
    const thick = mapLineVisual(5, breaks);
    expect(thin.color).toBe(thick.color);
    expect(thin.width).toBeLessThan(thick.width);
    expect(thin.opacity).toBeLessThan(thick.opacity);
  });

  it("splits typical commute vs occasional vs one-off into three tiers", () => {
    const counts = [1, 1, 1, 2, 2, 12];
    const breaks = lineCountBreaks(counts);
    expect(lineTier(1, breaks)).toBe("low");
    expect(lineTier(2, breaks)).toBe("mid");
    expect(lineTier(12, breaks)).toBe("high");
    const low = mapLineVisual(1, breaks);
    const mid = mapLineVisual(2, breaks);
    const high = mapLineVisual(12, breaks);
    expect(low.width).toBeLessThan(mid.width);
    expect(mid.width).toBeLessThan(high.width);
    expect(low.opacity).toBeLessThan(mid.opacity);
    expect(mid.opacity).toBeLessThan(high.opacity);
  });

  it("keeps clustered frequencies together (1–3 vs 10–12 vs 100)", () => {
    const breaks = lineCountBreaks([1, 2, 3, 10, 11, 12, 100]);
    expect([1, 2, 3].map((count) => lineTier(count, breaks))).toEqual(["low", "low", "low"]);
    expect([10, 11, 12].map((count) => lineTier(count, breaks))).toEqual(["mid", "mid", "mid"]);
    expect(lineTier(100, breaks)).toBe("high");
  });

  it("assigns every distinct count to one tier", () => {
    const counts = [1, 1, 1, 3, 3, 8, 8, 8];
    const breaks = lineCountBreaks(counts);
    const byCount = new Map<number, LineTier>();
    for (const count of counts) {
      const tier = lineTier(count, breaks);
      const previous = byCount.get(count);
      if (previous) expect(tier).toBe(previous);
      else byCount.set(count, tier);
    }
    expect(new Set(byCount.values()).size).toBe(3);
  });
});

describe("stationCounts", () => {
  it("counts both ends of every trip", () => {
    const counts = stationCounts([
      trip({ fromStationId: "AOH", toStationId: "NJH" }),
      trip({ fromStationId: "NJH", toStationId: "custom:无坐标" }),
    ]);
    expect(counts.get("NJH")).toBe(2);
    expect(counts.get("AOH")).toBe(1);
  });
});

describe("parseMapGranularity", () => {
  it("defaults to city and accepts only known values", () => {
    expect(DEFAULT_MAP_GRANULARITY).toBe("city");
    expect(parseMapGranularity(null)).toBe("city");
    expect(parseMapGranularity("nonsense")).toBe("city");
    expect(parseMapGranularity("station")).toBe("station");
    expect(parseMapGranularity("city")).toBe("city");
  });
});

describe("buildMapGraph", () => {
  // 上海虹桥 / 上海南 同属上海，杭州东 / 杭州 同属杭州。
  const trips = [
    trip({ fromStationId: "AOH", toStationId: "HGH" }),
    trip({ fromStationId: "AOH", toStationId: "HGH" }),
    trip({ fromStationId: "SNH", toStationId: "HZH", category: "D", trainNo: "D1" }),
    trip({ fromStationId: "HGH", toStationId: "AOH" }),
  ];

  it("keeps one node per station in station mode", () => {
    const graph = buildMapGraph(trips, bundledStations, "station");
    expect([...graph.nodes.keys()].sort()).toEqual(["AOH", "HGH", "HZH", "SNH"]);
    expect(graph.lines).toHaveLength(3);
    expect(graph.nodes.get("AOH")).toMatchObject({ lng: 121.3162, lat: 31.196, name: "上海虹桥" });
  });

  it("merges stations of the same city into one node and one line per direction", () => {
    const graph = buildMapGraph(trips, bundledStations, "city");
    expect([...graph.nodes.keys()].sort()).toEqual(["city:上海", "city:杭州"]);
    const out = graph.lines.find((line) => line.fromId === "city:上海");
    expect(out).toMatchObject({ fromName: "上海", toName: "杭州", count: 3 });
    expect(out?.categories).toEqual({ G: 2, D: 1 });
    expect(out?.fromStations.sort()).toEqual(["上海南", "上海虹桥"]);
    expect(out?.toStations.sort()).toEqual(["杭州", "杭州东"]);
    expect(graph.lines.find((line) => line.fromId === "city:杭州")?.count).toBe(1);
  });

  it("places a city at the visit-weighted centre of its stations", () => {
    const graph = buildMapGraph(trips, bundledStations, "city");
    const shanghai = graph.nodes.get("city:上海");
    // 虹桥 3 次、上海南 1 次。
    expect(shanghai?.lng).toBeCloseTo((121.3162 * 3 + 121.4249) / 4, 6);
    expect(shanghai?.lat).toBeCloseTo((31.196 * 3 + 31.155) / 4, 6);
    expect(shanghai).toMatchObject({ departures: 3, arrivals: 1 });
    expect(shanghai?.stations).toEqual([
      { name: "上海虹桥", count: 3 },
      { name: "上海南", count: 1 },
    ]);
  });

  it("does not draw trips inside one city, but still counts them", () => {
    const inCity = [
      trip({ fromStationId: "AOH", toStationId: "SNH" }),
      trip({ fromStationId: "AOH", toStationId: "NJH" }),
    ];
    const city = buildMapGraph(inCity, bundledStations, "city");
    expect(city.internal).toBe(1);
    expect(city.lines).toHaveLength(1);
    expect(city.unplotted).toBe(0);
    const station = buildMapGraph(inCity, bundledStations, "station");
    expect(station.internal).toBe(0);
    expect(station.lines).toHaveLength(2);
  });

  it("counts trips whose city has no coordinates as unplotted", () => {
    const stations = [...bundledStations, { id: "custom:无坐标", name: "无坐标站" }];
    const graph = buildMapGraph(
      [
        trip({ fromStationId: "AOH", toStationId: "NJH" }),
        trip({ fromStationId: "NJH", toStationId: "custom:无坐标" }),
      ],
      stations,
      "city",
    );
    expect(graph.unplotted).toBe(1);
    expect(graph.nodes.get("city:无坐标站")?.lng).toBeUndefined();
  });

  it("falls back to the station id for unknown stations", () => {
    const graph = buildMapGraph(
      [trip({ fromStationId: "AOH", toStationId: "missing-station" })],
      bundledStations,
      "city",
    );
    expect(graph.nodes.get("missing-station")?.name).toBe("missing-station");
    expect(graph.unplotted).toBe(1);
  });
});
