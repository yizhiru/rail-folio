import { describe, expect, it } from "vitest";
import { bundledStations } from "../assets/stations";
import { ensureStation, extractStationPair, lookupStation, stationKey } from "./matchStation";

describe("stationKey", () => {
  it("strips 站 / 火车站 suffix and whitespace", () => {
    expect(stationKey("北京南站")).toBe("北京南");
    expect(stationKey("北京南 ")).toBe("北京南");
    expect(stationKey("北京火车站")).toBe("北京");
  });
});

describe("lookupStation", () => {
  it("matches with or without the 站 suffix", () => {
    expect(lookupStation("北京南站", bundledStations)?.id).toBe("VNP");
    expect(lookupStation("北京南", bundledStations)?.id).toBe("VNP");
  });

  it("does not confuse a station with its longer siblings", () => {
    expect(lookupStation("北京", bundledStations)?.name).toBe("北京");
    expect(lookupStation("上海", bundledStations)?.name).toBe("上海");
  });

  it("returns undefined for unknown or empty names", () => {
    expect(lookupStation("不存在的站", bundledStations)).toBeUndefined();
    expect(lookupStation("站", bundledStations)).toBeUndefined();
  });
});

describe("ensureStation", () => {
  it("reuses an existing station", () => {
    expect(ensureStation("杭州东站", bundledStations).id).toBe("HGH");
  });

  it("resolves stations outside the old 112-station table to their 12306 code", () => {
    expect(ensureStation("丹东站", bundledStations)).toMatchObject({ id: "DUT", city: "丹东" });
    expect(ensureStation("昆山南", bundledStations)).toMatchObject({ id: "KNH", city: "苏州" });
  });

  it("creates a stable custom station with a derived city", () => {
    const created = ensureStation("不存在东站", bundledStations);
    expect(created).toEqual({ id: "custom:不存在东", name: "不存在东", city: "不存在" });
    expect(ensureStation("不存在东", [...bundledStations, created])).toBe(created);
  });
});

describe("extractStationPair", () => {
  it("prefers the longest station name at each position", () => {
    const pair = extractStationPair("上海虹桥站 南京南站", bundledStations);
    expect(pair.fromName).toBe("上海虹桥");
    expect(pair.toName).toBe("南京南");
  });

  it("keeps reading order as from → to even when names are interleaved with text", () => {
    const pair = extractStationPair("G80次 广州南 → 武汉 2024-08-18", bundledStations);
    expect(pair.from?.id).toBe("IZQ");
    expect(pair.to?.id).toBe("WHN");
  });

  it("does not match a plain 北京 inside 北京南", () => {
    const pair = extractStationPair("北京南 天津", bundledStations);
    expect(pair.fromName).toBe("北京南");
    expect(pair.toName).toBe("天津");
  });

  it("ignores whitespace inserted by OCR", () => {
    const pair = extractStationPair("杭 州 东  厦 门 北", bundledStations);
    expect(pair.fromName).toBe("杭州东");
    expect(pair.toName).toBe("厦门北");
  });

  it("returns partial results when only one station is found", () => {
    const pair = extractStationPair("从 成都东 出发去一个未知的地方", bundledStations);
    expect(pair.fromName).toBe("成都东");
    expect(pair.to).toBeUndefined();
  });

  it("does not let 合肥西 swallow 合肥 西安 written next to each other", () => {
    const pair = extractStationPair(
      "2012-04-09 1154次 合肥 西安 19:11 126.00元",
      bundledStations,
    );
    expect(pair.fromName).toBe("合肥");
    expect(pair.toName).toBe("西安");
  });

  it("still prefers 合肥西 when that is the actual origin", () => {
    const pair = extractStationPair("合肥西 西安", bundledStations);
    expect(pair.fromName).toBe("合肥西");
    expect(pair.toName).toBe("西安");
  });

  it("does not let 北京南 swallow 北京 南京", () => {
    const pair = extractStationPair("北京 南京", bundledStations);
    expect(pair.fromName).toBe("北京");
    expect(pair.toName).toBe("南京");
  });
});
