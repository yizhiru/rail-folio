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
    expect(stats.durationLabel).toBe("1 h 2 min");
  });

  it("keeps leftover minutes on long totals", () => {
    const shanghaiHongqiao = bundledStations.find((s) => s.name === "上海虹桥")!;
    const nanjingSouth = bundledStations.find((s) => s.name === "南京南")!;
    const trips: Trip[] = [
      {
        id: "1",
        date: "2024-01-01",
        trainNo: "Z1",
        category: "Z",
        fromStationId: shanghaiHongqiao.id,
        toStationId: nanjingSouth.id,
        departureTime: "21:50",
        arrivalTime: "17:39",
        source: "manual",
        fingerprint: "overnight",
      },
    ];
    const stats = summarizeTrips(trips, bundledStations);
    expect(stats.totalMinutes).toBe(19 * 60 + 49);
    expect(stats.durationLabel).toBe("19 h 49 min");
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

  it("ranks directed routes and keeps A→B and B→A apart", () => {
    const shanghaiHongqiao = bundledStations.find((s) => s.name === "上海虹桥")!;
    const nanjingSouth = bundledStations.find((s) => s.name === "南京南")!;
    const trips: Trip[] = [
      {
        id: "1",
        date: "2024-02-10",
        trainNo: "G123",
        category: "G",
        fromStationId: shanghaiHongqiao.id,
        toStationId: nanjingSouth.id,
        ticketPrice: 144.5,
        source: "manual",
        fingerprint: "a",
      },
      {
        id: "2",
        date: "2024-08-18",
        trainNo: "G80",
        category: "G",
        fromStationId: shanghaiHongqiao.id,
        toStationId: nanjingSouth.id,
        ticketPrice: 553,
        source: "manual",
        fingerprint: "b",
      },
      {
        id: "3",
        date: "2024-01-02",
        trainNo: "G2",
        category: "G",
        fromStationId: nanjingSouth.id,
        toStationId: shanghaiHongqiao.id,
        source: "manual",
        fingerprint: "c",
      },
    ];
    const stats = summarizeTrips(trips, bundledStations);
    expect(stats.topRoutes[0]).toMatchObject({
      fromName: "上海虹桥",
      toName: "南京南",
      tripCount: 2,
    });
    expect(stats.topRoutes).toHaveLength(2);
  });

  it("picks the highest priced trip and ignores trips without a fare", () => {
    const shanghaiHongqiao = bundledStations.find((s) => s.name === "上海虹桥")!;
    const nanjingSouth = bundledStations.find((s) => s.name === "南京南")!;
    const hangzhouEast = bundledStations.find((s) => s.name === "杭州东")!;
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
        date: "2024-08-18",
        trainNo: "G80",
        category: "G",
        fromStationId: shanghaiHongqiao.id,
        toStationId: hangzhouEast.id,
        ticketPrice: 553,
        source: "manual",
        fingerprint: "b",
      },
      {
        id: "3",
        date: "2025-01-01",
        trainNo: "G2",
        category: "G",
        fromStationId: nanjingSouth.id,
        toStationId: shanghaiHongqiao.id,
        source: "manual",
        fingerprint: "c",
      },
    ];
    const stats = summarizeTrips(trips, bundledStations);
    expect(stats.maxPriceTrip).toEqual({
      date: "2024-08-18",
      trainNo: "G80",
      ticketPrice: 553,
      fromName: "上海虹桥",
      toName: "杭州东",
    });
  });

  it("breaks same-price ties by more recent departure", () => {
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
        departureTime: "18:00",
        ticketPrice: 200,
        source: "manual",
        fingerprint: "a",
      },
      {
        id: "2",
        date: "2024-01-01",
        trainNo: "G2",
        category: "G",
        fromStationId: nanjingSouth.id,
        toStationId: shanghaiHongqiao.id,
        departureTime: "09:00",
        ticketPrice: 200,
        source: "manual",
        fingerprint: "b",
      },
    ];
    const stats = summarizeTrips(trips, bundledStations);
    expect(stats.maxPriceTrip).toMatchObject({ date: "2024-01-01", trainNo: "G1" });
  });

  it("picks the longest timed trip and skips trips missing a clock", () => {
    const shanghaiHongqiao = bundledStations.find((s) => s.name === "上海虹桥")!;
    const nanjingSouth = bundledStations.find((s) => s.name === "南京南")!;
    const hangzhouEast = bundledStations.find((s) => s.name === "杭州东")!;
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
        date: "2024-05-01",
        trainNo: "D2282",
        category: "D",
        fromStationId: hangzhouEast.id,
        toStationId: shanghaiHongqiao.id,
        departureTime: "08:10",
        arrivalTime: "13:46",
        source: "manual",
        fingerprint: "b",
      },
      {
        id: "3",
        date: "2023-10-01",
        trainNo: "Z176",
        category: "Z",
        fromStationId: shanghaiHongqiao.id,
        toStationId: nanjingSouth.id,
        departureTime: "20:04",
        source: "manual",
        fingerprint: "c",
      },
    ];
    const stats = summarizeTrips(trips, bundledStations);
    expect(stats.longestTrip).toEqual({
      date: "2024-05-01",
      trainNo: "D2282",
      minutes: 5 * 60 + 36,
      fromName: "杭州东",
      toName: "上海虹桥",
    });
  });

  it("omits highlights when no fare or duration can be counted", () => {
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
        source: "manual",
        fingerprint: "a",
      },
    ];
    const stats = summarizeTrips(trips, bundledStations);
    expect(stats.maxPriceTrip).toBeUndefined();
    expect(stats.longestTrip).toBeUndefined();
  });

  it("sums spend per year over priced trips only, and leaves unpriced years empty", () => {
    const base = {
      category: "G" as const,
      fromStationId: "AOH",
      toStationId: "NJH",
      source: "manual" as const,
    };
    const trips: Trip[] = [
      { ...base, id: "1", date: "2023-02-01", trainNo: "G1", fingerprint: "a", ticketPrice: 100.1 },
      { ...base, id: "2", date: "2023-06-01", trainNo: "G2", fingerprint: "b", ticketPrice: 200.2 },
      { ...base, id: "3", date: "2023-07-01", trainNo: "G3", fingerprint: "c" },
      { ...base, id: "4", date: "2024-03-01", trainNo: "G4", fingerprint: "d" },
      { ...base, id: "5", date: "2025-03-01", trainNo: "G5", fingerprint: "e", ticketPrice: 80 },
    ];
    const stats = summarizeTrips(trips, bundledStations);
    expect(stats.byYear).toEqual([
      { year: "2023", count: 3, spend: 300.3, pricedCount: 2 },
      { year: "2024", count: 1, spend: undefined, pricedCount: 0 },
      { year: "2025", count: 1, spend: 80, pricedCount: 1 },
    ]);
    const spent = stats.byYear.reduce((sum, item) => sum + (item.spend ?? 0), 0);
    expect(Math.round(spent * 100) / 100).toBe(stats.totalTicketPrice);
  });
});
