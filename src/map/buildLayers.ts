import type { Station, TrainCategory, Trip } from "../domain/types";

export const CATEGORY_COLORS: Record<TrainCategory, string> = {
  G: "#7dffb3",
  D: "#7ad4ff",
  C: "#c4b5fd",
  Z: "#fb7185",
  P: "#e8c48a",
};

const MAP_LINE_COLOR = "#8eb8d4";

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

const LINE_FEW = { width: 1, opacity: 0.38 };
const LINE_MANY = { width: 2.2, opacity: 0.82 };

/** 同一方向乘过 2 次及以上算「多次」。地图线条只分这两档，不分车型。 */
export function mapLineVisual(count: number): MapLineVisual {
  const frequent = count >= 2;
  const { width, opacity } = frequent ? LINE_MANY : LINE_FEW;
  return { color: MAP_LINE_COLOR, width, opacity };
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
