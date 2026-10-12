import { describe, expect, it } from "vitest";
import { compareTripsRecentFirst } from "./sortTrips";

function row(date: string, departureTime?: string) {
  return { date, departureTime };
}

describe("compareTripsRecentFirst", () => {
  it("puts later dates first, and later departures first on the same day", () => {
    const trips = [
      row("2024-08-18", "08:10"),
      row("2024-08-18", "20:04"),
      row("2024-08-19", "07:30"),
      row("2024-08-18", "15:00"),
    ];
    expect([...trips].sort(compareTripsRecentFirst).map((trip) => `${trip.date} ${trip.departureTime}`)).toEqual([
      "2024-08-19 07:30",
      "2024-08-18 20:04",
      "2024-08-18 15:00",
      "2024-08-18 08:10",
    ]);
  });

  it("puts trips without a departure time after timed trips that day", () => {
    const trips = [row("2024-08-18"), row("2024-08-18", "09:00"), row("2024-08-18", "9:05")];
    expect([...trips].sort(compareTripsRecentFirst).map((trip) => trip.departureTime ?? "—")).toEqual([
      "9:05",
      "09:00",
      "—",
    ]);
  });
});
