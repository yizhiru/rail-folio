import { describe, expect, it } from "vitest";
import { formatDuration, isNextDayArrival, tripDurationMin } from "./duration";
import type { Trip } from "./types";

function trip(partial: Partial<Trip>): Trip {
  return {
    id: "1",
    date: "2024-01-01",
    trainNo: "G1",
    category: "G",
    fromStationId: "a",
    toStationId: "b",
    source: "manual",
    fingerprint: "x",
    ...partial,
  };
}

describe("tripDurationMin", () => {
  it("uses clock times and rolls overnight to the next day", () => {
    const sameDay = tripDurationMin(trip({ departureTime: "09:00", arrivalTime: "10:02" }));
    expect(sameDay).toEqual({ minutes: 62 });
    const overnight = tripDurationMin(trip({ departureTime: "20:04", arrivalTime: "14:22" }));
    expect(overnight?.minutes).toBe((24 - 20) * 60 - 4 + 14 * 60 + 22);
  });

  it("counts Z8991-style next-day arrivals as overnight", () => {
    const duration = tripDurationMin(trip({ trainNo: "Z8991", departureTime: "21:50", arrivalTime: "17:39" }));
    expect(duration).toEqual({ minutes: 19 * 60 + 49 });
  });

  it("skips trips missing arrival or departure", () => {
    expect(tripDurationMin(trip({ departureTime: "09:00" }))).toBeUndefined();
    expect(tripDurationMin(trip({ arrivalTime: "10:02" }))).toBeUndefined();
    expect(tripDurationMin(trip({}))).toBeUndefined();
  });
});

describe("isNextDayArrival", () => {
  it("marks arrival +1 when the clock goes backwards", () => {
    expect(isNextDayArrival("09:00", "10:02")).toBe(false);
    expect(isNextDayArrival("21:50", "17:39")).toBe(true);
    expect(isNextDayArrival("20:00", "20:00")).toBe(true);
    expect(isNextDayArrival("21:50")).toBe(false);
  });
});

describe("formatDuration", () => {
  it("uses h / min and keeps leftover minutes", () => {
    expect(formatDuration(0)).toBe("0 min");
    expect(formatDuration(50)).toBe("50 min");
    expect(formatDuration(185)).toBe("3 h 5 min");
    expect(formatDuration(8 * 60 + 1)).toBe("8 h 1 min");
    expect(formatDuration(11 * 60 + 11)).toBe("11 h 11 min");
    expect(formatDuration(26 * 60)).toBe("26 h");
  });
});

describe("explicit arrival days", () => {
  it("handles journeys lasting more than 24 or 48 hours", () => {
    expect(tripDurationMin(trip({ departureTime: "09:00", arrivalTime: "12:00", arrivalDayOffset: 1 }))).toEqual({ minutes: 27 * 60 });
    expect(tripDurationMin(trip({ departureTime: "09:00", arrivalTime: "12:00", arrivalDayOffset: 2 }))).toEqual({ minutes: 51 * 60 });
  });
  it("honors zero and rejects inconsistent or invalid offsets", () => {
    expect(tripDurationMin(trip({ departureTime: "09:00", arrivalTime: "09:00", arrivalDayOffset: 0 }))).toEqual({ minutes: 0 });
    expect(tripDurationMin(trip({ departureTime: "20:00", arrivalTime: "09:00", arrivalDayOffset: 0 }))).toBeUndefined();
    expect(tripDurationMin(trip({ departureTime: "09:00", arrivalTime: "12:00", arrivalDayOffset: -1 }))).toBeUndefined();
  });
});
