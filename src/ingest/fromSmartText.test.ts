import { describe, expect, it } from "vitest";
import { bundledStations } from "../assets/stations";
import { tripFingerprint } from "../domain/fingerprint";
import type { Trip } from "../domain/types";
import {
  draftsFromSmartText,
  splitSmartTripText,
  tripInputsFromDrafts,
} from "./fromSmartText";

const stations = bundledStations;

describe("splitSmartTripText", () => {
  it("treats each non-empty line as a trip", () => {
    expect(
      splitSmartTripText(`
        2024-05-01 G1 上海虹桥 北京南 08:00 12:30
        D2282 杭州东 厦门北 2024年5月2日 09:00-14:20
      `),
    ).toHaveLength(2);
  });

  it("skips a spreadsheet header", () => {
    const chunks = splitSmartTripText(`日期\t车次\t出发站\t到达站
2024-05-01\tG1\t上海虹桥\t北京南\t08:00\t12:30`);
    expect(chunks).toEqual(["2024-05-01\tG1\t上海虹桥\t北京南\t08:00\t12:30"]);
  });

  it("keeps a multi-line ticket dump as one record", () => {
    const chunks = splitSmartTripText(`G123次
上海虹桥站 南京南站
2024年02月10日 09:00开`);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain("G123");
    expect(chunks[0]).toContain("南京南");
  });

  it("splits two trains written on one line", () => {
    const chunks = splitSmartTripText(
      "G1 2024-05-01 上海虹桥 北京南 08:00 12:30 G2 2024-05-02 北京南 上海虹桥 14:00 18:00",
    );
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toContain("G1");
    expect(chunks[1]).toMatch(/^G2/);
  });
});

describe("draftsFromSmartText", () => {
  it("parses several free-form lines into drafts", () => {
    const drafts = draftsFromSmartText(
      `2024-05-01 G1 上海虹桥 北京南 08:00 12:30
G80 广州南-武汉 2024-08-18 15:00-18:58 商务座 票价1381元`,
      stations,
    );
    expect(drafts).toHaveLength(2);
    expect(drafts[0].parsed).toMatchObject({
      date: "2024-05-01",
      trainNo: "G1",
      fromName: "上海虹桥",
      toName: "北京南",
      departureTime: "08:00",
      arrivalTime: "12:30",
    });
    expect(drafts[0].selected).toBe(true);
    expect(drafts[1].parsed).toMatchObject({
      trainNo: "G80",
      fromName: "广州南",
      toName: "武汉",
      seatClass: "商务座",
      ticketPrice: 1381,
    });
  });

  it("accepts a number-only train code", () => {
    const drafts = draftsFromSmartText("2024-01-01 1461 北京 上海 21:08 09:30", stations);
    expect(drafts[0]?.parsed.trainNo).toBe("1461");
    expect(drafts[0]?.parsed.fromName).toBe("北京");
    expect(drafts[0]?.parsed.toName).toBe("上海");
  });

  it("keeps 合肥 and 西安 apart on a numbered train with a fare", () => {
    const drafts = draftsFromSmartText(
      "2012-04-09 1154次 合肥 西安 19:11 126.00元",
      stations,
    );
    expect(drafts[0]?.parsed).toMatchObject({
      date: "2012-04-09",
      trainNo: "1154",
      fromName: "合肥",
      toName: "西安",
      departureTime: "19:11",
      ticketPrice: 126,
    });
    expect(drafts[0]?.needsReview).toBe(false);
  });

  it("marks complete duplicates unselected, but selects ones that can fill blanks", () => {
    const existing: Trip[] = [
      {
        id: "old",
        date: "2024-05-01",
        trainNo: "G1",
        category: "G",
        fromStationId: "AOH",
        toStationId: "VNP",
        source: "manual",
        fingerprint: tripFingerprint("2024-05-01", "G1", "AOH", "VNP"),
      },
    ];
    const blank = draftsFromSmartText("2024-05-01 G1 上海虹桥 北京南", stations, existing);
    expect(blank[0]?.duplicateOf).toBe("old");
    expect(blank[0]?.selected).toBe(false);
    const priced = draftsFromSmartText(
      "2024-05-01 G1 上海虹桥 北京南 08:00 12:30 二等座 票价144.5元",
      stations,
      existing,
    );
    expect(priced[0]?.duplicateOf).toBe("old");
    expect(priced[0]?.selected).toBe(true);
    expect(priced[0]?.parsed.ticketPrice).toBe(144.5);
  });
});

describe("tripInputsFromDrafts", () => {
  it("skips incomplete and duplicate rows", () => {
    const drafts = draftsFromSmartText(
      `2024-05-01 G1 上海虹桥 北京南
G80 广州南`,
      stations,
    );
    drafts[0].selected = true;
    if (drafts[1]) drafts[1].selected = true;
    const existing: Trip[] = [
      {
        id: "old",
        date: "2024-05-01",
        trainNo: "G1",
        category: "G",
        fromStationId: "AOH",
        toStationId: "VNP",
        source: "manual",
        fingerprint: tripFingerprint("2024-05-01", "G1", "AOH", "VNP"),
      },
    ];
    const result = tripInputsFromDrafts(drafts, (name) => {
      const hit = stations.find((station) => station.name === name);
      if (!hit) throw new Error(name);
      return hit;
    }, existing);
    expect(result.inputs).toEqual([]);
    expect(result.importedIds).toEqual([]);
    expect(result.skippedDup).toBe(1);
    expect(result.skippedIncomplete).toBe(1);
  });

  it("keeps ticket price on complete selected drafts", () => {
    const drafts = draftsFromSmartText(
      "2024-08-18 G80 广州南 武汉 15:00 18:58 商务座 票价1381元",
      stations,
    );
    drafts[0].selected = true;
    const result = tripInputsFromDrafts(drafts, (name) => {
      const hit = stations.find((station) => station.name === name);
      if (!hit) throw new Error(name);
      return hit;
    }, []);
    expect(result.inputs).toHaveLength(1);
    expect(result.importedIds).toEqual([drafts[0].id]);
    expect(result.inputs[0].ticketPrice).toBe(1381);
  });

  it("keeps a duplicate row when it can fill a blank ticket price", () => {
    const drafts = draftsFromSmartText(
      "2024-05-01 G1 上海虹桥 北京南 08:00 12:30 票价144.5元",
      stations,
    );
    drafts[0].selected = true;
    const existing: Trip[] = [
      {
        id: "old",
        date: "2024-05-01",
        trainNo: "G1",
        category: "G",
        fromStationId: "AOH",
        toStationId: "VNP",
        source: "manual",
        fingerprint: tripFingerprint("2024-05-01", "G1", "AOH", "VNP"),
      },
    ];
    const result = tripInputsFromDrafts(drafts, (name) => {
      const hit = stations.find((station) => station.name === name);
      if (!hit) throw new Error(name);
      return hit;
    }, existing);
    expect(result.skippedDup).toBe(0);
    expect(result.inputs).toHaveLength(1);
    expect(result.inputs[0].ticketPrice).toBe(144.5);
  });
});
