import { describe, expect, it } from "vitest";
import { bundledStations } from "../assets/stations";
import type { Trip } from "../domain/types";
import { analyzeTrips, analyzeYear, sliceStats } from "./analyze";

function trip(partial: Partial<Trip> & Pick<Trip, "id" | "date" | "trainNo" | "fromStationId" | "toStationId">): Trip {
  return {
    category: "G",
    source: "manual",
    fingerprint: partial.id,
    ...partial,
  };
}

const aoh = bundledStations.find((station) => station.name === "上海虹桥")!;
const vnp = bundledStations.find((station) => station.name === "北京南")!;
const njh = bundledStations.find((station) => station.name === "南京南")!;

describe("sliceStats", () => {
  it("counts unique cities and only filled prices / clocked durations", () => {
    const trips = [
      trip({
        id: "1",
        date: "2024-01-01",
        trainNo: "G1",
        fromStationId: aoh.id,
        toStationId: vnp.id,
        departureTime: "08:00",
        arrivalTime: "12:30",
        ticketPrice: 144.5,
      }),
      trip({
        id: "2",
        date: "2024-01-02",
        trainNo: "G2",
        fromStationId: aoh.id,
        toStationId: njh.id,
      }),
    ];
    const stats = sliceStats(trips, bundledStations);
    expect(stats.tripCount).toBe(2);
    expect(stats.cityCount).toBe(3);
    expect(stats.stationCount).toBe(3);
    expect(stats.totalMinutes).toBe(270);
    expect(stats.durationLabel).toBe("4 h 30 min");
    expect(stats.totalTicketPrice).toBe(144.5);
    expect(stats.pricedTripCount).toBe(1);
    expect(stats.ticketPriceLabel).toBe("144.5 元");
  });

  it("counts a same-city ride as one city", () => {
    const shanghai = bundledStations.find((station) => station.name === "上海")!;
    const stats = sliceStats(
      [
        trip({
          id: "1",
          date: "2024-01-01",
          trainNo: "G1",
          fromStationId: aoh.id,
          toStationId: shanghai.id,
        }),
      ],
      bundledStations,
    );
    expect(stats.cityCount).toBe(1);
    expect(stats.stationCount).toBe(2);
  });
});

describe("analyzeTrips", () => {
  it("breaks down year and category", () => {
    const trips = [
      trip({
        id: "1",
        date: "2024-02-10",
        trainNo: "G123",
        fromStationId: aoh.id,
        toStationId: njh.id,
        ticketPrice: 144.5,
      }),
      trip({
        id: "2",
        date: "2025-01-20",
        trainNo: "C2002",
        category: "C",
        fromStationId: vnp.id,
        toStationId: bundledStations.find((station) => station.name === "天津")!.id,
        ticketPrice: 54.5,
      }),
      trip({
        id: "3",
        date: "2024-08-18",
        trainNo: "G80",
        fromStationId: aoh.id,
        toStationId: njh.id,
        ticketPrice: 553,
      }),
    ];
    const stats = analyzeTrips(trips, bundledStations);
    expect(stats.years).toEqual(["2025", "2024"]);
    expect(stats.byYear[1]).toMatchObject({ tripCount: 2, cityCount: 2, totalTicketPrice: 697.5 });
    expect(stats.byCategory.map((item) => item.category)).toEqual(["G", "C"]);
  });
});

describe("analyzeYear", () => {
  it("limits charts to the selected year", () => {
    const trips = [
      trip({
        id: "1",
        date: "2024-02-10",
        trainNo: "G123",
        fromStationId: aoh.id,
        toStationId: njh.id,
        departureTime: "09:00",
        arrivalTime: "10:02",
        ticketPrice: 144.5,
      }),
      trip({
        id: "2",
        date: "2025-01-20",
        trainNo: "C2002",
        category: "C",
        fromStationId: vnp.id,
        toStationId: bundledStations.find((station) => station.name === "天津")!.id,
        ticketPrice: 54.5,
      }),
    ];
    const view = analyzeYear(trips, bundledStations, "2024");
    expect(view.slice.tripCount).toBe(1);
    expect(view.slice.cityCount).toBe(2);
    expect(view.slice.durationLabel).toBe("1 h 2 min");
    expect(view.byCategory.map((item) => item.category)).toEqual(["G"]);
    expect(view.topCities.map((item) => item.city).sort()).toEqual(["上海", "南京"]);
    expect(view.byMonth).toHaveLength(12);
    expect(view.byMonth[1]).toEqual({ month: 2, label: "2月", count: 1 });
    expect(view.byMonth.filter((item) => item.count > 0).map((item) => item.month)).toEqual([2]);
  });

  it("counts every month of the selected year", () => {
    const trips = [
      trip({
        id: "1",
        date: "2024-02-10",
        trainNo: "G123",
        fromStationId: aoh.id,
        toStationId: njh.id,
      }),
      trip({
        id: "2",
        date: "2024-02-18",
        trainNo: "G124",
        fromStationId: njh.id,
        toStationId: aoh.id,
      }),
      trip({
        id: "3",
        date: "2024-08-18",
        trainNo: "G80",
        fromStationId: aoh.id,
        toStationId: njh.id,
      }),
      trip({
        id: "4",
        date: "2025-01-20",
        trainNo: "C2002",
        category: "C",
        fromStationId: vnp.id,
        toStationId: bundledStations.find((station) => station.name === "天津")!.id,
      }),
    ];
    const view = analyzeYear(trips, bundledStations, "2024");
    expect(view.byMonth.map((item) => item.count)).toEqual([0, 2, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0]);
  });
});
