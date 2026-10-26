import { describe, expect, it } from "vitest";
import type { Station, Trip } from "../domain/types";
import { yearlyNewPlaces } from "./footprints";
import { summarizeTrips } from "./summarize";

const stations: Station[] = [
  { id: "sh", name: "上海", city: "上海" },
  { id: "hq", name: "上海虹桥", city: "上海" },
  { id: "nj", name: "南京南", city: "南京" },
  { id: "wh", name: "汉口" },
  { id: "wc", name: "武昌" },
];

function trip(date: string, fromStationId: string, toStationId: string, extra: Partial<Trip> = {}): Trip {
  return {
    id: `${date}|${fromStationId}|${toStationId}`,
    fingerprint: "test",
    date, fromStationId, toStationId,
    trainNo: "G1", category: "G", source: "manual",
    ...extra,
  };
}

describe("yearlyNewPlaces", () => {
  it("deduplicates cities and stations across years regardless of input order", () => {
    const trips = [
      trip("2025-01-01", "hq", "nj"),
      trip("2026-01-01", "nj", "hq"),
      trip("2024-03-01", "sh", "nj"),
      trip("2024-03-02", "nj", "sh"),
    ];
    const expected = [
      { year: "2024", newCityCount: 2, newStationCount: 2 },
      { year: "2025", newCityCount: 0, newStationCount: 1 },
      { year: "2026", newCityCount: 0, newStationCount: 0 },
    ];
    expect(yearlyNewPlaces(trips, stations)).toEqual(expected);
    expect(yearlyNewPlaces([...trips].reverse(), stations)).toEqual(expected);
    const stats = summarizeTrips(trips, stations);
    expect(stats.byYear.reduce((sum, year) => sum + year.newCityCount, 0)).toBe(stats.cityCount);
    expect(stats.byYear.reduce((sum, year) => sum + year.newStationCount, 0)).toBe(stats.stationCount);
  });

  it("reassigns first visits when an earlier trip is added", () => {
    const recent = trip("2025-02-01", "sh", "nj");
    expect(yearlyNewPlaces([recent], stations)[0].newCityCount).toBe(2);
    expect(yearlyNewPlaces([recent, trip("2023-01-01", "sh", "nj")], stations)).toEqual([
      { year: "2023", newCityCount: 2, newStationCount: 2 },
      { year: "2025", newCityCount: 0, newStationCount: 0 },
    ]);
  });

  it("uses city aliases and station-name fallback for custom or missing stations", () => {
    expect(yearlyNewPlaces([
      trip("2024-01-01", "wh", "wc"),
      trip("2025-01-01", "杭州东", "杭州"),
    ], stations)).toEqual([
      { year: "2024", newCityCount: 1, newStationCount: 2 },
      { year: "2025", newCityCount: 1, newStationCount: 2 },
    ]);
    expect(yearlyNewPlaces([trip("2024-01-01", "sh", "sh")], stations)).toEqual([
      { year: "2024", newCityCount: 1, newStationCount: 1 },
    ]);
  });

  it("assigns cross-year arrivals to the arrival year, including inferred and explicit offsets", () => {
    for (const extra of [
      { departureTime: "23:00", arrivalTime: "01:00" },
      { arrivalDayOffset: 2 },
    ]) {
      const trips = [trip("2024-12-31", "sh", "nj", extra)];
      expect(yearlyNewPlaces(trips, stations)).toEqual([
        { year: "2024", newCityCount: 1, newStationCount: 1 },
        { year: "2025", newCityCount: 1, newStationCount: 1 },
      ]);
      expect(summarizeTrips(trips, stations).byYear[1]).toMatchObject({
        year: "2025", count: 0, pricedCount: 0, spend: undefined, newCityCount: 1, newStationCount: 1,
      });
    }
    expect(yearlyNewPlaces([trip("2024-12-31", "sh", "nj", {
      departureTime: "23:00", arrivalTime: "23:00", arrivalDayOffset: 0,
    })], stations)).toEqual([{ year: "2024", newCityCount: 2, newStationCount: 2 }]);
  });

  it("handles an empty archive", () => {
    expect(yearlyNewPlaces([], stations)).toEqual([]);
  });
});
