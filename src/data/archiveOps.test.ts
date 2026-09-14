import { describe, expect, it } from "vitest";
import { tripFingerprint } from "../domain/fingerprint";
import type { Trip, TripInput } from "../domain/types";
import {
  ensureArchiveStation,
  mergeArchives,
  mergeTrips,
  removeTrip,
  upsertTrips,
} from "./archiveOps";
import { emptyArchive } from "./archiveSchema";

const base: TripInput = {
  date: "2024-02-10",
  trainNo: "G123",
  fromStationId: "AOH",
  toStationId: "NJH",
  source: "manual",
};

describe("upsertTrips", () => {
  it("creates trips with derived id, category and fingerprint, newest first", () => {
    const { archive, saved, duplicates } = upsertTrips(emptyArchive(), [
      base,
      { ...base, trainNo: "d 31", date: "2024-03-01" },
    ]);
    expect(archive.trips).toHaveLength(2);
    expect(archive.trips[0].trainNo).toBe("d 31");
    expect(archive.trips[0].category).toBe("D");
    expect(saved[0].fingerprint).toBe(tripFingerprint("2024-02-10", "G123", "AOH", "NJH"));
    expect(duplicates).toEqual([undefined, undefined]);
  });

  it("does not fill distanceKm automatically", () => {
    const { saved } = upsertTrips(emptyArchive(), [base]);
    expect(saved[0].distanceKm).toBeUndefined();
    const explicit = upsertTrips(emptyArchive(), [{ ...base, distanceKm: 301 }]);
    expect(explicit.saved[0].distanceKm).toBe(301);
  });

  it("keeps an explicit ticket price and does not invent one", () => {
    const { saved } = upsertTrips(emptyArchive(), [base]);
    expect(saved[0].ticketPrice).toBeUndefined();
    const priced = upsertTrips(emptyArchive(), [{ ...base, ticketPrice: 144.5 }]);
    expect(priced.saved[0].ticketPrice).toBe(144.5);
  });

  it("updates in place when an id is provided and keeps ordering", () => {
    const first = upsertTrips(emptyArchive(), [base, { ...base, date: "2024-05-05" }]);
    const target = first.archive.trips[1];
    const second = upsertTrips(first.archive, [{ ...base, id: target.id, seatClass: "商务座", trainNo: "G9" }]);
    expect(second.archive.trips).toHaveLength(2);
    expect(second.archive.trips[1].id).toBe(target.id);
    expect(second.archive.trips[1].seatClass).toBe("商务座");
    expect(second.archive.trips[1].fingerprint).toBe(tripFingerprint("2024-02-10", "G9", "AOH", "NJH"));
  });

  it("reports duplicates by fingerprint, excluding the trip itself on update", () => {
    const first = upsertTrips(emptyArchive(), [base]);
    const existing = first.archive.trips[0];
    const filled = upsertTrips(first.archive, [{ ...base, seatClass: "二等座" }]);
    expect(filled.archive.trips).toHaveLength(1);
    expect(filled.archive.trips[0].seatClass).toBe("二等座");
    expect(filled.duplicates[0]).toBeUndefined();
    const again = upsertTrips(filled.archive, [{ ...base, seatClass: "商务座" }]);
    expect(again.duplicates[0]?.id).toBe(existing.id);
    expect(again.archive.trips).toHaveLength(1);
    expect(again.archive.trips[0].seatClass).toBe("二等座");
    const self = upsertTrips(first.archive, [{ ...base, id: existing.id, notes: "x" }]);
    expect(self.duplicates[0]).toBeUndefined();
  });

  it("detects duplicates within the same batch and can fill the first copy", () => {
    const { duplicates, archive } = upsertTrips(emptyArchive(), [base, { ...base }]);
    expect(archive.trips).toHaveLength(1);
    expect(duplicates[0]).toBeUndefined();
    expect(duplicates[1]?.id).toBe(archive.trips[0].id);
    const priced = upsertTrips(emptyArchive(), [base, { ...base, ticketPrice: 144.5 }]);
    expect(priced.archive.trips).toHaveLength(1);
    expect(priced.archive.trips[0].ticketPrice).toBe(144.5);
  });
});

describe("removeTrip", () => {
  it("removes by id", () => {
    const { archive } = upsertTrips(emptyArchive(), [base]);
    expect(removeTrip(archive, archive.trips[0].id).trips).toEqual([]);
  });
});

describe("ensureArchiveStation", () => {
  it("returns the same archive object when the station already exists", () => {
    const archive = emptyArchive();
    const result = ensureArchiveStation(archive, "北京南站");
    expect(result.station.id).toBe("VNP");
    expect(result.archive).toBe(archive);
  });

  it("adds a custom station once", () => {
    const first = ensureArchiveStation(emptyArchive(), "不存在东");
    expect(first.archive.customStations).toHaveLength(1);
    const second = ensureArchiveStation(first.archive, "不存在东站");
    expect(second.archive).toBe(first.archive);
    expect(second.station.id).toBe("custom:不存在东");
  });
});

describe("mergeTrips / mergeArchives", () => {
  const make = (partial: Partial<Trip>): Trip => ({
    id: partial.id ?? crypto.randomUUID(),
    date: "2024-01-01",
    trainNo: "G1",
    category: "G",
    fromStationId: "AOH",
    toStationId: "NJH",
    source: "manual",
    fingerprint: partial.fingerprint ?? "fp",
    ...partial,
  });

  it("keeps existing identity on fingerprint clash, fills blank fields, and sorts by date desc", () => {
    const current = [make({ id: "a", fingerprint: "x", date: "2024-01-01", seatClass: "mine" })];
    const incoming = [
      make({ id: "b", fingerprint: "x", seatClass: "theirs", ticketPrice: 144.5 }),
      make({ id: "c", fingerprint: "y", date: "2024-06-01" }),
    ];
    const merged = mergeTrips(current, incoming);
    expect(merged.map((trip) => trip.id)).toEqual(["c", "a"]);
    expect(merged[1].seatClass).toBe("mine");
    expect(merged[1].ticketPrice).toBe(144.5);
  });

  it("marks imported trips as json-import and dedupes custom stations", () => {
    const current = { ...emptyArchive(), customStations: [{ id: "custom:甲", name: "甲" }] };
    const incoming = {
      ...emptyArchive(),
      trips: [make({ id: "n", fingerprint: "new", source: "ocr" })],
      customStations: [{ id: "custom:甲", name: "甲" }, { id: "custom:乙", name: "乙" }],
    };
    const merged = mergeArchives(current, incoming);
    expect(merged.trips[0].source).toBe("json-import");
    expect(merged.customStations.map((station) => station.id)).toEqual(["custom:甲", "custom:乙"]);
  });
});
