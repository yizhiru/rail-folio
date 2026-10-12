import { cityOfStation } from "../domain/city";
import type { Station, TrainCategory, Trip } from "../domain/types";

const MAP_LINE_COLOR = "#6fe6d2";

export type TripLine = {
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  count: number;
  /** 这个方向上最早 / 最近一次的乘车日期（YYYY-MM-DD）。 */
  firstDate: string;
  lastDate: string;
  /** 各车型的次数，只含出现过的车型。 */
  categories: Partial<Record<TrainCategory, number>>;
  /** 这条线实际涉及的出发 / 到达车站名；城市粒度下可能不止一个。 */
  fromStations: string[];
  toStations: string[];
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

export type StationVisits = { departures: number; arrivals: number };

/** 每个车站作为出发站、到达站各出现的次数。 */
export function stationVisits(trips: Trip[]): Map<string, StationVisits> {
  const visits = new Map<string, StationVisits>();
  const entry = (id: string) => {
    let item = visits.get(id);
    if (!item) {
      item = { departures: 0, arrivals: 0 };
      visits.set(id, item);
    }
    return item;
  };
  for (const trip of trips) {
    entry(trip.fromStationId).departures += 1;
    entry(trip.toStationId).arrivals += 1;
  }
  return visits;
}

/** 地图的聚合粒度：按城市合并同城车站，或逐站显示。 */
export type MapGranularity = "city" | "station";

export const DEFAULT_MAP_GRANULARITY: MapGranularity = "city";

/** 读本机保存的粒度；无法识别时回到默认（城市）。 */
export function parseMapGranularity(raw: string | null | undefined): MapGranularity {
  return raw === "station" || raw === "city" ? raw : DEFAULT_MAP_GRANULARITY;
}

type PlottedStation = Station & { lng: number; lat: number };

function hasCoords(station: Station | undefined): station is PlottedStation {
  return station?.lng != null && station.lat != null;
}

export type MapNode = {
  id: string;
  name: string;
  lng?: number;
  lat?: number;
  departures: number;
  arrivals: number;
  /** 该节点下到访过的车站，次数多的在前；车站粒度时只有它自己。 */
  stations: Array<{ name: string; count: number }>;
};

export type MapGraph = {
  nodes: Map<string, MapNode>;
  /** 按「起点节点 → 终点节点」聚合的线，车型合并进次数。 */
  lines: TripLine[];
  /** 起点或终点所在节点没有坐标、画不到地图上的行程数。 */
  unplotted: number;
  /** 起讫落在同一节点上、因此没有线的行程数（城市粒度下的同城往返）。 */
  internal: number;
};

/**
 * 把行程聚合成地图上的点和线。
 * 城市粒度：城市取 `cityOfStation`，与总览统计同一口径；城市点的位置是其到访车站坐标按次数加权的平均。
 * 车站粒度：逐站，一站一个点。
 */
export function buildMapGraph(
  trips: Trip[],
  stations: Station[],
  granularity: MapGranularity,
): MapGraph {
  const stationMap = new Map(stations.map((station) => [station.id, station]));
  const visits = stationVisits(trips);
  const nodes = new Map<string, MapNode>();
  const nodeOfStation = new Map<string, string>();
  const sums = new Map<string, { lng: number; lat: number; weight: number }>();

  for (const [stationId, visit] of visits) {
    const station = stationMap.get(stationId);
    const byCity = granularity === "city" && station != null;
    const city = byCity ? cityOfStation(station) : "";
    const nodeId = byCity ? `city:${city}` : stationId;
    const name = byCity ? city : (station?.name ?? stationId);
    nodeOfStation.set(stationId, nodeId);

    let node = nodes.get(nodeId);
    if (!node) {
      node = { id: nodeId, name, departures: 0, arrivals: 0, stations: [] };
      nodes.set(nodeId, node);
    }
    const count = visit.departures + visit.arrivals;
    node.departures += visit.departures;
    node.arrivals += visit.arrivals;
    node.stations.push({ name: station?.name ?? stationId, count });

    if (hasCoords(station)) {
      if (granularity === "station") {
        node.lng = station.lng;
        node.lat = station.lat;
      } else {
        const sum = sums.get(nodeId) ?? { lng: 0, lat: 0, weight: 0 };
        sum.lng += station.lng * count;
        sum.lat += station.lat * count;
        sum.weight += count;
        sums.set(nodeId, sum);
      }
    }
  }
  for (const [nodeId, sum] of sums) {
    const node = nodes.get(nodeId);
    if (node && sum.weight > 0) {
      node.lng = sum.lng / sum.weight;
      node.lat = sum.lat / sum.weight;
    }
  }
  for (const node of nodes.values()) {
    node.stations.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh"));
  }

  const lines = new Map<string, TripLine>();
  let unplotted = 0;
  let internal = 0;
  for (const trip of trips) {
    const fromId = nodeOfStation.get(trip.fromStationId) ?? trip.fromStationId;
    const toId = nodeOfStation.get(trip.toStationId) ?? trip.toStationId;
    const from = nodes.get(fromId);
    const to = nodes.get(toId);
    if (from?.lng == null || to?.lng == null) unplotted += 1;
    if (fromId === toId) {
      internal += 1;
      continue;
    }
    const fromStation = stationMap.get(trip.fromStationId)?.name ?? trip.fromStationId;
    const toStation = stationMap.get(trip.toStationId)?.name ?? trip.toStationId;
    const key = `${fromId}|${toId}`;
    const existing = lines.get(key);
    if (existing) {
      existing.count += 1;
      if (trip.date < existing.firstDate) existing.firstDate = trip.date;
      if (trip.date > existing.lastDate) existing.lastDate = trip.date;
      existing.categories[trip.category] = (existing.categories[trip.category] ?? 0) + 1;
      if (!existing.fromStations.includes(fromStation)) existing.fromStations.push(fromStation);
      if (!existing.toStations.includes(toStation)) existing.toStations.push(toStation);
    } else {
      lines.set(key, {
        fromId,
        toId,
        fromName: from?.name ?? fromId,
        toName: to?.name ?? toId,
        count: 1,
        firstDate: trip.date,
        lastDate: trip.date,
        categories: { [trip.category]: 1 },
        fromStations: [fromStation],
        toStations: [toStation],
      });
    }
  }
  return { nodes, lines: [...lines.values()], unplotted, internal };
}

/** 按「起点 → 终点」聚合的线段，车型合并进次数。 */
export function tripLines(
  trips: Trip[],
  stations: Station[],
  granularity: MapGranularity,
): TripLine[] {
  return buildMapGraph(trips, stations, granularity).lines;
}

/** 起点或终点缺坐标、因此画不到地图上的行程数。 */
export function countUnplottedTrips(
  trips: Trip[],
  stations: Station[],
  granularity: MapGranularity,
): number {
  return buildMapGraph(trips, stations, granularity).unplotted;
}

type Coord = { lng: number; lat: number };

/** 两点间的粗略距离（度），只用来决定弧度，不参与里程统计。 */
function degreeSpan(from: Coord, to: Coord): number {
  const midLat = ((from.lat + to.lat) / 2) * (Math.PI / 180);
  return Math.hypot((to.lng - from.lng) * Math.cos(midLat), to.lat - from.lat);
}

/**
 * 弧度随距离收小：短途弧稍鼓一点，往返两条才分得开；
 * 跨大半个中国的长线放平，避免一条弧盖住大片底图。
 * 往返仍同取正号，由方向自然分到两侧。
 */
export function lineCurveness(from: Coord, to: Coord): number {
  const span = degreeSpan(from, to);
  return Math.min(0.3, Math.max(0.14, 0.32 - span * 0.003));
}

/** 随缩放略微放大点和线，缩小时收一点；不做线性放大，免得放大后糊成一片。 */
export function zoomScale(zoom: number, baseZoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0 || baseZoom <= 0) return 1;
  const scale = Math.pow(zoom / baseZoom, 0.4);
  return Math.round(Math.min(1.7, Math.max(0.8, scale)) * 10) / 10;
}

export type LegendTier = {
  tier: LineTier;
  /** 这一档里实际出现的最小 / 最大次数。 */
  min: number;
  max: number;
};

/** 当前图上实际出现的各档次数区间，供图例标注；空档不列出。 */
export function lineLegendTiers(counts: number[], breaks: LineCountBreaks): LegendTier[] {
  const byTier = new Map<LineTier, LegendTier>();
  for (const count of counts) {
    if (count <= 0) continue;
    const tier = lineTier(count, breaks);
    const entry = byTier.get(tier);
    if (entry) {
      entry.min = Math.min(entry.min, count);
      entry.max = Math.max(entry.max, count);
    } else {
      byTier.set(tier, { tier, min: count, max: count });
    }
  }
  const order: LineTier[] = ["low", "mid", "high"];
  return order.flatMap((tier) => byTier.get(tier) ?? []);
}

export function formatLegendRange(tier: LegendTier): string {
  return tier.min === tier.max ? `${tier.min} 次` : `${tier.min}–${tier.max} 次`;
}

/** 供图例画样线：与地图上同一档的粗细和不透明度。 */
export function legendLineStyle(tier: LineTier): { width: number; opacity: number; color: string } {
  return { ...LINE_BY_TIER[tier], color: MAP_LINE_COLOR };
}
