import type { Station } from "./types";

const ALIAS: Record<string, string> = {
  汉口: "武汉",
  武昌: "武汉",
  滨海西: "天津",
  滨海: "天津",
};

const MULTI_SUFFIXES = ["虹桥", "南站", "北站", "东站", "西站"];
/** 单字方位后缀只在剩余部分至少两个字时才截断，避免把"丹东""启东""海东"这类地名截成单字。 */
const DIRECTION_SUFFIXES = ["东", "西", "南", "北"];

/**
 * 城市归属优先取 `station.city`（内置全量站表来自 12306，口径为地级市 / 直辖市 / 自治州）。
 * 只有 OCR 识别出的、不在站表里的车站才退回到按站名推导。
 */
export function cityOfStation(station: Pick<Station, "name" | "city">): string {
  const named = station.city?.trim();
  if (named) return named;
  return cityFromStationName(station.name);
}

/** 仅作兜底：按"城市名 + 方位"的命名习惯猜城市，遇到"北京丰台""花桥"这类站名会猜错。 */
export function cityFromStationName(name: string): string {
  const trimmed = name.replace(/站$/, "").trim();
  if (ALIAS[trimmed]) return ALIAS[trimmed];
  if (ALIAS[name]) return ALIAS[name];
  for (const suffix of MULTI_SUFFIXES) {
    if (trimmed.length > suffix.length && trimmed.endsWith(suffix)) {
      return trimmed.slice(0, -suffix.length);
    }
  }
  for (const suffix of DIRECTION_SUFFIXES) {
    if (trimmed.length >= 3 && trimmed.endsWith(suffix)) {
      return trimmed.slice(0, -suffix.length);
    }
  }
  return trimmed || name;
}
