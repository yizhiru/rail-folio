import { describe, expect, it } from "vitest";
import { tripFingerprint } from "../domain/fingerprint";
import { ARCHIVE_VERSION, type Archive, type Trip } from "../domain/types";
import { ArchiveParseError } from "./archiveSchema";
import { archiveFromCsv, exportArchiveCsv, parseCsvRows, parseImportText } from "./tripsCsv";

function trip(partial: Partial<Trip>): Trip {
  const base = {
    id: "internal-id",
    date: "2024-03-02",
    trainNo: "G7301",
    category: "G" as const,
    fromStationId: "AOH",
    toStationId: "HGH",
    source: "ocr" as const,
    ...partial,
  };
  return {
    ...base,
    fingerprint: tripFingerprint(base.date, base.trainNo, base.fromStationId, base.toStationId),
  };
}

const archive = (trips: Trip[], customStations: Archive["customStations"] = []): Archive => ({
  version: ARCHIVE_VERSION,
  trips,
  customStations,
});

describe("exportArchiveCsv", () => {
  it("writes a BOM, a Chinese header and station names only", () => {
    const csv = exportArchiveCsv(
      archive([
        trip({
          departureTime: "08:00",
          arrivalTime: "09:00",
          seatClass: "二等座",
          ticketPrice: 73.5,
          notes: "出差",
        }),
      ]),
    );
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.split("\r\n")).toEqual([
      "\uFEFF日期,车次,出发站,到达站,出发时间,到达时间,席别,票价,里程,备注",
      "2024-03-02,G7301,上海虹桥,杭州东,08:00,09:00,二等座,73.5,,出差",
      "",
    ]);
    for (const noisy of ["internal-id", "fingerprint", "AOH", "HGH", "ocr"]) {
      expect(csv).not.toContain(noisy);
    }
  });

  it("leaves unset cells empty and quotes cells with commas, quotes or newlines", () => {
    const csv = exportArchiveCsv(archive([trip({ notes: '带"引号",和逗号\n换行' })]));
    expect(csv).toContain('"带""引号"",和逗号\n换行"');
    expect(csv).toContain("2024-03-02,G7301,上海虹桥,杭州东,,,,,,");
  });

  it("writes the name of a custom station", () => {
    const csv = exportArchiveCsv(
      archive([trip({ toStationId: "custom:某小镇" })], [{ id: "custom:某小镇", name: "某小镇" }]),
    );
    expect(csv).toContain(",上海虹桥,某小镇,");
  });
});

describe("export order", () => {
  it("matches the trips page: newest first, later departure first on the same day", () => {
    const csv = exportArchiveCsv(
      archive([
        trip({ date: "2024-01-05", trainNo: "G1", departureTime: "08:00" }),
        trip({ date: "2024-03-02", trainNo: "G2", departureTime: "07:00" }),
        trip({ date: "2024-03-02", trainNo: "G3", departureTime: "18:30" }),
        trip({ date: "2023-12-31", trainNo: "G4" }),
        trip({ date: "2024-03-02", trainNo: "G5" }),
      ]),
    );
    const trains = csv.trim().split("\r\n").slice(1).map((line) => line.split(",")[1]);
    expect(trains).toEqual(["G3", "G2", "G5", "G1", "G4"]);
  });

  it("does not reorder the archive it was given", () => {
    const trips = [trip({ date: "2024-01-01", trainNo: "G1" }), trip({ date: "2024-02-01", trainNo: "G2" })];
    exportArchiveCsv(archive(trips));
    expect(trips.map((item) => item.trainNo)).toEqual(["G1", "G2"]);
  });
});

describe("parseCsvRows", () => {
  it("handles quotes, embedded separators, CRLF and blank lines", () => {
    expect(parseCsvRows('a,"b,1","c""d"\r\n\r\ne,f,\n"x\ny",z')).toEqual([
      ["a", "b,1", 'c"d'],
      ["e", "f", ""],
      ["x\ny", "z"],
    ]);
  });
});

describe("parseImportText", () => {
  it("reads an export back into the same trips", () => {
    const original = archive([
      trip({ ticketPrice: 73.5, departureTime: "08:00", arrivalTime: "09:00", seatClass: "二等座", distanceKm: 169 }),
      trip({
        date: "2024-05-01",
        trainNo: "D1",
        category: "D",
        fromStationId: "HGH",
        toStationId: "custom:某小镇",
        notes: "带,逗号",
      }),
    ]);
    const restored = parseImportText(exportArchiveCsv(original));
    expect(restored.trips.map((item) => item.fingerprint).sort()).toEqual(
      original.trips.map((item) => item.fingerprint).sort(),
    );
    const byTrain = (trainNo: string) => restored.trips.find((item) => item.trainNo === trainNo);
    expect(byTrain("G7301")).toMatchObject({
      category: "G",
      source: "json-import",
      ticketPrice: 73.5,
      distanceKm: 169,
      departureTime: "08:00",
      seatClass: "二等座",
    });
    expect(byTrain("D1")).toMatchObject({ category: "D", notes: "带,逗号" });
    expect(restored.customStations.map((station) => station.id)).toEqual(["custom:某小镇"]);
  });

  it("matches station names and reports unusable rows", () => {
    const header = "日期,车次,出发站,到达站";
    const restored = archiveFromCsv(`${header}\n2024-01-01,G1,上海虹桥站,杭州东`);
    expect(restored.trips[0]).toMatchObject({ fromStationId: "AOH", toStationId: "HGH" });
    expect(() => archiveFromCsv(`${header}\n2024-01-02,G2,,杭州东\n,G3,上海虹桥,杭州东`)).toThrow(/2 行记录无效/);
  });

  it("works with columns in another order and extra columns", () => {
    const restored = archiveFromCsv("车次,备注,到达站,日期,出发站,其他\nG1,x,杭州东,2024-01-01,上海虹桥,?");
    expect(restored.trips[0]).toMatchObject({ trainNo: "G1", notes: "x", fromStationId: "AOH" });
  });

  it("still reads the old JSON archive", () => {
    const old = {
      version: 3,
      trips: [{ id: "x", date: "2024-01-01", trainNo: "G1", fromStationId: "AOH", toStationId: "NJH" }],
      customStations: [],
    };
    expect(parseImportText(JSON.stringify(old)).trips[0]).toMatchObject({ id: "x", fromStationId: "AOH" });
  });

  it("rejects empty files and tables without the required columns", () => {
    expect(() => parseImportText("")).toThrow(ArchiveParseError);
    expect(() => parseImportText("日期,车次\n2024-01-01,G1")).toThrow(/出发站/);
  });
});

it("round-trips explicit arrival days without adding CSV columns", () => {
  const imported = archiveFromCsv("日期,车次,出发站,到达站,出发时间,到达时间\n2024-01-01,Z1,上海虹桥,杭州东,09:00,12:00 (+2天)");
  expect(imported.trips[0].arrivalDayOffset).toBe(2);
  const csv = exportArchiveCsv(imported);
  expect(csv).toContain("12:00 (+2天)");
  expect(csv).not.toContain("跨日天数,");
  expect(archiveFromCsv(csv).trips[0]).toMatchObject({ arrivalTime: "12:00", arrivalDayOffset: 2 });
});
