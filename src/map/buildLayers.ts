import type { Station, TrainCategory, Trip } from "../domain/types";

export const CATEGORY_COLORS: Record<TrainCategory, string> = {
  G: "#7dffb3",
  D: "#7ad4ff",
  C: "#c4b5fd",
  Z: "#fb7185",
  P: "#e8c48a",
};

const MAP_LINE_COLOR = "#6fe6d2";

export type TripLine = {
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  count: number;
};

export type MapLineVisual = {
  color: string;
  width: number;
  opacity: number;
};

export type LineTier = "low" | "mid" | "high";

/** 中档 / 高档的次数下限；达不到的方向归入更低一档。 */
export type LineCountBreaks = {
  midMin: number;
  highMin: number;
};

const LINE_BY_TIER: Record<LineTier, { width: number; opacity: number }> = {
  low: { width: 1, opacity: 0.55 },
  mid: { width: 1.65, opacity: 0.74 },
  high: { width: 2.4, opacity: 0.92 },
};

const NO_BREAKS: LineCountBreaks = {
  midMin: Number.POSITIVE_INFINITY,
  highMin: Number.POSITIVE_INFINITY,
};

/**
 * 按各方向次数的分布做最多三档自然断点（Jenks）：低 / 中 / 高。
 * 同一次数总在同一档；次数种类不足三档时少分。
 */
export function lineCountBreaks(counts: number[]): LineCountBreaks {
  const values = counts.filter((count) => count > 0);
  if (values.length === 0) return NO_BREAKS;

  const unique = [...new Set(values)].sort((a, b) => a - b);
  const classMaxes = naturalClassMaxes(values, Math.min(3, unique.length));
  if (classMaxes.length <= 1) return NO_BREAKS;

  const nextAfter = (max: number) => unique.find((count) => count > max) ?? Number.POSITIVE_INFINITY;
  if (classMaxes.length === 2) {
    return { midMin: Number.POSITIVE_INFINITY, highMin: nextAfter(classMaxes[0]) };
  }
  return { midMin: nextAfter(classMaxes[0]), highMin: nextAfter(classMaxes[1]) };
}

export function lineTier(count: number, breaks: LineCountBreaks): LineTier {
  if (count >= breaks.highMin) return "high";
  if (count >= breaks.midMin) return "mid";
  return "low";
}

/** 当前图上各方向次数分成低 / 中 / 高，线条粗细与不透明度递增。不分车型。 */
export function mapLineVisual(count: number, breaks: LineCountBreaks): MapLineVisual {
  const { width, opacity } = LINE_BY_TIER[lineTier(count, breaks)];
  return { color: MAP_LINE_COLOR, width, opacity };
}

/** 1D Jenks：返回每一档的最大值，长度 = classCount。 */
function naturalClassMaxes(values: number[], classCount: number): number[] {
  const data = [...values].sort((a, b) => a - b);
  const n = data.length;
  const k = Math.min(classCount, new Set(data).size);
  if (k <= 0) return [];
  if (k === 1) return [data[n - 1]];

  const prefix = new Array<number>(n + 1).fill(0);
  const prefixSq = new Array<number>(n + 1).fill(0);
  for (let i = 0; i < n; i++) {
    prefix[i + 1] = prefix[i] + data[i];
    prefixSq[i + 1] = prefixSq[i] + data[i] * data[i];
  }
  const ssd = (from: number, to: number) => {
    const width = to - from;
    const sum = prefix[to] - prefix[from];
    return prefixSq[to] - prefixSq[from] - (sum * sum) / width;
  };

  const inf = Number.POSITIVE_INFINITY;
  const cost = Array.from({ length: n + 1 }, () => Array<number>(k + 1).fill(inf));
  const prev = Array.from({ length: n + 1 }, () => Array<number>(k + 1).fill(0));
  cost[0][0] = 0;
  for (let classes = 1; classes <= k; classes++) {
    for (let end = classes; end <= n; end++) {
      for (let split = classes - 1; split < end; split++) {
        const candidate = cost[split][classes - 1] + ssd(split, end);
        if (candidate < cost[end][classes]) {
          cost[end][classes] = candidate;
          prev[end][classes] = split;
        }
      }
    }
  }

  const maxes: number[] = [];
  let end = n;
  for (let classes = k; classes >= 1; classes--) {
    maxes.push(data[end - 1]);
    end = prev[end][classes];
  }
  maxes.reverse();
  return maxes;
}

/** 每个车站作为起点或终点出现的次数。 */
export function stationCounts(trips: Trip[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const trip of trips) {
    counts.set(trip.fromStationId, (counts.get(trip.fromStationId) ?? 0) + 1);
    counts.set(trip.toStationId, (counts.get(trip.toStationId) ?? 0) + 1);
  }
  return counts;
}

/** 行程涉及且有坐标的车站。 */
export function uniqueTripStations(trips: Trip[], stations: Station[]): Station[] {
  const wanted = stationCounts(trips);
  return stations.filter(
    (station) => wanted.has(station.id) && station.lng != null && station.lat != null,
  );
}

/** 按「起点 → 终点」聚合的 OD 线段，车型合并进次数。 */
export function tripLines(trips: Trip[], stations: Station[]): TripLine[] {
  const stationMap = new Map(stations.map((station) => [station.id, station]));
  const map = new Map<string, TripLine>();
  for (const trip of trips) {
    const key = `${trip.fromStationId}|${trip.toStationId}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(key, {
        fromId: trip.fromStationId,
        toId: trip.toStationId,
        fromName: stationMap.get(trip.fromStationId)?.name ?? trip.fromStationId,
        toName: stationMap.get(trip.toStationId)?.name ?? trip.toStationId,
        count: 1,
      });
    }
  }
  return [...map.values()];
}
