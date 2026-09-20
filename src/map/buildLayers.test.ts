import { describe, expect, it } from "vitest";
import {
  lineCountBreaks,
  lineTier,
  mapLineVisual,
  stationCounts,
  tripLines,
  uniqueTripStations,
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
    const lines = tripLines(trips, bundledStations);
    expect(lines).toHaveLength(2);
    expect(lines.find((line) => line.fromId === "AOH")?.count).toBe(3);
    expect(lines.find((line) => line.fromId === "NJH")?.count).toBe(1);
    expect(lines[0].fromName).toBe("上海虹桥");
  });

  it("builds lines for every demo trip", () => {
    const archive = demoArchive(bundledStations);
    expect(tripLines(archive.trips, bundledStations)).toHaveLength(archive.trips.length);
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

describe("stationCounts / uniqueTripStations", () => {
  it("counts both ends and drops stations without coordinates", () => {
    const trips = [
      trip({ fromStationId: "AOH", toStationId: "NJH" }),
      trip({ fromStationId: "NJH", toStationId: "custom:无坐标" }),
    ];
    const counts = stationCounts(trips);
    expect(counts.get("NJH")).toBe(2);
    expect(counts.get("AOH")).toBe(1);
    const stations = uniqueTripStations(trips, [
      ...bundledStations,
      { id: "custom:无坐标", name: "无坐标" },
    ]);
    expect(stations.map((station) => station.id).sort()).toEqual(["AOH", "NJH"]);
  });
});
