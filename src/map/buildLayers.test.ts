import { describe, expect, it } from "vitest";
import { mapLineVisual, stationCounts, tripLines, uniqueTripStations } from "./buildLayers";
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

describe("mapLineVisual", () => {
  it("uses only two weights: one trip vs repeated route", () => {
    const once = mapLineVisual(1);
    const twice = mapLineVisual(2);
    const many = mapLineVisual(9);
    expect(once.color).toBe(twice.color);
    expect(once.width).toBeLessThan(twice.width);
    expect(once.opacity).toBeLessThan(twice.opacity);
    expect(twice).toEqual(many);
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
