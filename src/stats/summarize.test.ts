import { describe, expect, it } from "vitest";
import { summarizeTrips } from "./summarize";
import { demoArchive } from "../data/seed";
import { bundledStations } from "../assets/stations";
import type { Trip } from "../domain/types";

describe("summarizeTrips", () => {
  it("counts demo trips", () => {
    const archive = demoArchive(bundledStations);
    const stats = summarizeTrips(archive.trips, bundledStations);
    expect(stats.tripCount).toBeGreaterThan(0);
    expect(stats.stationCount).toBeGreaterThan(1);
    expect(stats.cityCount).toBeGreaterThan(1);
    expect(stats.totalMinutes).toBeGreaterThan(0);
  });

  it("groups different stations in the same city", () => {
    const shanghaiHongqiao = bundledStations.find((s) => s.name === "上海虹桥");
    const shanghai = bundledStations.find((s) => s.name === "上海");
    const nanjingSouth = bundledStations.find((s) => s.name === "南京南");
    expect(shanghaiHongqiao && shanghai && nanjingSouth).toBeTruthy();
    const trips: Trip[] = [
      {
        id: "1",
        date: "2024-01-01",
        trainNo: "G1",
        category: "G",
        fromStationId: shanghaiHongqiao!.id,
        toStationId: nanjingSouth!.id,
        source: "manual",
        fingerprint: "a",
      },
      {
        id: "2",
        date: "2024-01-02",
        trainNo: "G2",
        category: "G",
        fromStationId: shanghai!.id,
        toStationId: nanjingSouth!.id,
        source: "manual",
        fingerprint: "b",
      },
    ];
    const stats = summarizeTrips(trips, bundledStations);
    expect(stats.stationCount).toBe(3);
    expect(stats.topStation).toEqual({ name: "南京南", count: 2 });
    const shanghaiStat = stats.topCities.find((item) => item.city === "上海");
    expect(shanghaiStat?.count).toBe(2);
    expect(shanghaiStat?.stations.sort()).toEqual(["上海", "上海虹桥"]);
    expect(stats.topCities.find((item) => item.city === "南京")?.count).toBe(2);
  });

  it("treats 汉口 and 武昌 as Wuhan even without a city field", () => {
    const stations = [
      { id: "h", name: "汉口" },
      { id: "w", name: "武昌" },
      { id: "b", name: "北京南" },
    ];
    const trips: Trip[] = [
      {
        id: "1",
        date: "2024-01-01",
        trainNo: "G1",
        category: "G",
        fromStationId: "h",
        toStationId: "b",
        source: "manual",
        fingerprint: "a",
      },
      {
        id: "2",
        date: "2024-01-02",
        trainNo: "G2",
        category: "G",
        fromStationId: "w",
        toStationId: "b",
        source: "manual",
        fingerprint: "b",
      },
    ];
    const stats = summarizeTrips(trips, stations);
    expect(stats.cityCount).toBe(2);
    expect(stats.topCities.find((item) => item.city === "武汉")?.stations.sort()).toEqual([
      "武昌",
      "汉口",
    ]);
    expect(stats.topCities.find((item) => item.city === "北京")?.count).toBe(2);
  });

  it("keeps count first, then ranks same-count cities by most recent visit", () => {
    const shanghaiHongqiao = bundledStations.find((s) => s.name === "上海虹桥");
    const nanjingSouth = bundledStations.find((s) => s.name === "南京南");
    const hangzhouEast = bundledStations.find((s) => s.name === "杭州东");
    expect(shanghaiHongqiao && nanjingSouth && hangzhouEast).toBeTruthy();
    const trips: Trip[] = [
      {
        id: "1",
        date: "2024-01-01",
        trainNo: "G1",
        category: "G",
        fromStationId: shanghaiHongqiao!.id,
        toStationId: nanjingSouth!.id,
        departureTime: "09:00",
        arrivalTime: "10:02",
        source: "manual",
        fingerprint: "a",
      },
      {
        id: "2",
        date: "2025-06-01",
        trainNo: "G2",
        category: "G",
        fromStationId: shanghaiHongqiao!.id,
        toStationId: hangzhouEast!.id,
        departureTime: "08:00",
        arrivalTime: "09:00",
        source: "manual",
        fingerprint: "b",
      },
    ];
    const stats = summarizeTrips(trips, bundledStations);
    expect(stats.topCities.map((item) => item.city)).toEqual(["上海", "杭州", "南京"]);
  });

  it("excludes trips without arrival time from total duration", () => {
    const shanghaiHongqiao = bundledStations.find((s) => s.name === "上海虹桥")!;
    const nanjingSouth = bundledStations.find((s) => s.name === "南京南")!;
    const trips: Trip[] = [
      {
        id: "1",
        date: "2024-01-01",
        trainNo: "G1",
        category: "G",
        fromStationId: shanghaiHongqiao.id,
        toStationId: nanjingSouth.id,
        departureTime: "09:00",
        arrivalTime: "10:02",
        source: "manual",
        fingerprint: "a",
      },
      {
        id: "2",
        date: "2024-01-02",
        trainNo: "G2",
        category: "G",
        fromStationId: shanghaiHongqiao.id,
        toStationId: nanjingSouth.id,
        departureTime: "09:00",
        source: "manual",
        fingerprint: "b",
      },
    ];
    const stats = summarizeTrips(trips, bundledStations);
    expect(stats.totalMinutes).toBe(62);
  });

  it("sums ticket prices only when they are present", () => {
    const shanghaiHongqiao = bundledStations.find((s) => s.name === "上海虹桥")!;
    const nanjingSouth = bundledStations.find((s) => s.name === "南京南")!;
    const trips: Trip[] = [
      {
        id: "1",
        date: "2024-01-01",
        trainNo: "G1",
        category: "G",
        fromStationId: shanghaiHongqiao.id,
        toStationId: nanjingSouth.id,
        ticketPrice: 144.5,
        source: "manual",
        fingerprint: "a",
      },
      {
        id: "2",
        date: "2024-01-02",
        trainNo: "G2",
        category: "G",
        fromStationId: shanghaiHongqiao.id,
        toStationId: nanjingSouth.id,
        source: "manual",
        fingerprint: "b",
      },
    ];
    const stats = summarizeTrips(trips, bundledStations);
    expect(stats.totalTicketPrice).toBe(144.5);
    expect(stats.pricedTripCount).toBe(1);
    expect(stats.ticketPriceLabel).toBe("144.5 元");
  });
});
