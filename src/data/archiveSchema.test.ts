import { describe, expect, it } from "vitest";
import { tripFingerprint } from "../domain/fingerprint";
import { ARCHIVE_VERSION } from "../domain/types";
import {
  ArchiveParseError,
  normalizeArchive,
  parseArchiveText,
  sanitizeTrip,
} from "./archiveSchema";

describe("parseArchiveText", () => {
  it("treats empty input as a fresh archive", () => {
    expect(parseArchiveText("")).toEqual({ version: ARCHIVE_VERSION, trips: [], customStations: [] });
    expect(parseArchiveText(null).trips).toEqual([]);
  });

  it("throws ArchiveParseError on broken JSON instead of returning an empty archive", () => {
    expect(() => parseArchiveText('{"version":2,"trips":[')).toThrow(ArchiveParseError);
  });

  it("throws when the shape is not an archive", () => {
    expect(() => parseArchiveText("[]")).toThrow(ArchiveParseError);
    expect(() => parseArchiveText('{"version":2}')).toThrow(/trips/);
    expect(() => parseArchiveText('{"version":99,"trips":[]}')).toThrow(/版本/);
  });

  it("drops malformed trips but keeps the valid ones", () => {
    const archive = parseArchiveText(
      JSON.stringify({
        version: 2,
        trips: [
          { id: "ok", date: "2024-01-01", trainNo: "G1", fromStationId: "AOH", toStationId: "NJH", source: "manual", category: "G", fingerprint: "f" },
          { id: "missing-date", trainNo: "G1", fromStationId: "AOH", toStationId: "NJH" },
          "not an object",
        ],
        customStations: [{ id: "custom:x", name: "x" }, { name: "no id" }],
      }),
    );
    expect(archive.trips.map((trip) => trip.id)).toEqual(["ok"]);
    expect(archive.customStations).toHaveLength(1);
  });
});

describe("sanitizeTrip", () => {
  it("fills category, fingerprint, id and source when they are missing or invalid", () => {
    const trip = sanitizeTrip(
      { date: "2024-01-01", trainNo: "d2282", fromStationId: "HGH", toStationId: "XKS", source: "bogus", category: "nope" },
      "json-import",
    );
    expect(trip).toBeDefined();
    expect(trip?.id).toMatch(/[0-9a-f-]{36}/);
    expect(trip?.category).toBe("D");
    expect(trip?.source).toBe("json-import");
    expect(trip?.fingerprint).toBe(tripFingerprint("2024-01-01", "d2282", "HGH", "XKS"));
  });

  it("ignores non-positive or non-numeric distances", () => {
    expect(sanitizeTrip({ date: "d", trainNo: "G1", fromStationId: "a", toStationId: "b", distanceKm: -5 }, "manual")?.distanceKm).toBeUndefined();
    expect(sanitizeTrip({ date: "d", trainNo: "G1", fromStationId: "a", toStationId: "b", distanceKm: "300" }, "manual")?.distanceKm).toBeUndefined();
    expect(sanitizeTrip({ date: "d", trainNo: "G1", fromStationId: "a", toStationId: "b", distanceKm: 300 }, "manual")?.distanceKm).toBe(300);
  });

  it("keeps a positive ticket price and drops invalid ones", () => {
    const base = { date: "d", trainNo: "G1", fromStationId: "a", toStationId: "b" };
    expect(sanitizeTrip({ ...base, ticketPrice: 553.5 }, "manual")?.ticketPrice).toBe(553.5);
    expect(sanitizeTrip({ ...base, ticketPrice: "144.50元" }, "manual")?.ticketPrice).toBe(144.5);
    expect(sanitizeTrip({ ...base, ticketPrice: 0 }, "manual")?.ticketPrice).toBeUndefined();
    expect(sanitizeTrip({ ...base, ticketPrice: -9 }, "manual")?.ticketPrice).toBeUndefined();
  });
});

describe("v1 → v2 migration", () => {
  it("remaps renamed station ids, recomputes fingerprints and drops derived distances", () => {
    const archive = normalizeArchive(
      {
        version: 1,
        trips: [
          {
            id: "t1",
            date: "2024-05-01",
            trainNo: "D2282",
            category: "D",
            fromStationId: "HGH",
            toStationId: "XKS2",
            distanceKm: 742,
            source: "demo",
            fingerprint: tripFingerprint("2024-05-01", "D2282", "HGH", "XKS2"),
          },
          {
            id: "t2",
            date: "2024-06-01",
            trainNo: "G1",
            category: "G",
            fromStationId: "FYS",
            toStationId: "CUW",
            source: "manual",
            fingerprint: "old",
          },
        ],
        customStations: [],
      },
      "json-import",
    );
    expect(archive.version).toBe(ARCHIVE_VERSION);
    const [t1, t2] = archive.trips;
    expect(t1.toStationId).toBe("XKS");
    expect(t1.distanceKm).toBeUndefined();
    expect(t1.fingerprint).toBe(tripFingerprint("2024-05-01", "D2282", "HGH", "XKS"));
    expect(t2.fromStationId).toBe("FZS");
    expect(t2.toStationId).toBe("CQW");
    expect(t2.fingerprint).toBe(tripFingerprint("2024-06-01", "G1", "FZS", "CQW"));
  });

  it("v2 → v3 fixes telecodes and folds custom stations into the built-in table", () => {
    const archive = normalizeArchive(
      {
        version: 2,
        trips: [
          {
            id: "t1",
            date: "2024-01-01",
            trainNo: "G1",
            category: "G",
            fromStationId: "NJH", // v2 里是南京南
            toStationId: "NKH", // v2 里是南京
            source: "manual",
            fingerprint: "old",
          },
          {
            id: "t2",
            date: "2024-02-01",
            trainNo: "K1",
            category: "K",
            fromStationId: "custom:丹东",
            toStationId: "custom:不存在东",
            source: "ocr",
            fingerprint: "old2",
          },
        ],
        customStations: [
          { id: "custom:丹东", name: "丹东", city: "丹东" },
          { id: "custom:不存在东", name: "不存在东", city: "不存在" },
        ],
      },
      "json-import",
    );
    const [t1, t2] = archive.trips;
    expect(t1).toMatchObject({ fromStationId: "NKH", toStationId: "NJH" });
    expect(t1.fingerprint).toBe(tripFingerprint("2024-01-01", "G1", "NKH", "NJH"));
    expect(t2).toMatchObject({ fromStationId: "DUT", toStationId: "custom:不存在东" });
    expect(archive.customStations.map((s) => s.id)).toEqual(["custom:不存在东"]);
  });

  it("leaves unaffected v2 trips untouched", () => {
    const trip = {
      id: "t",
      date: "2024-01-01",
      trainNo: "G1",
      category: "G",
      fromStationId: "FYS",
      toStationId: "CUW",
      distanceKm: 1000,
      source: "manual",
      fingerprint: "keep",
    };
    const archive = normalizeArchive({ version: 2, trips: [trip], customStations: [] }, "json-import");
    expect(archive.trips[0]).toMatchObject({ fromStationId: "FYS", toStationId: "CUW", distanceKm: 1000, fingerprint: "keep" });
  });
});
