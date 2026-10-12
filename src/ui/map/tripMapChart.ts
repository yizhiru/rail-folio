import { TRAIN_CATEGORIES, TRAIN_CATEGORY_LABEL } from "../../domain/types";
import type { Station, Trip } from "../../domain/types";
import {
  buildMapGraph,
  formatLegendRange,
  legendLineStyle,
  lineCountBreaks,
  lineCurveness,
  lineLegendTiers,
  mapLineVisual,
  type LegendTier,
  type LineTier,
  type MapGranularity,
  type MapGraph,
  type MapNode,
  type TripLine,
} from "../../map/buildLayers";
import {
  echarts,
  type EChartsOption,
  type GeoComponentOption,
  type SeriesOption,
} from "../charts/echarts";

export const MAP_NAME = "china";
export const DEFAULT_ZOOM = 1.15;
export const ZOOM_RANGE = { min: 0.8, max: 12 };

let mapReady: Promise<void> | undefined;

/** 地图边界 540 KB，只在真正画图时再加载一次。 */
export function ensureChinaMap(): Promise<void> {
  mapReady ??= import("../../assets/china.geo.json").then((mod) => {
    echarts.registerMap(MAP_NAME, mod.default as Parameters<typeof echarts.registerMap>[1]);
  });
  return mapReady.catch((error) => { mapReady = undefined; throw error; });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

type LineDatum = {
  coords: [number, number][];
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  count: number;
  firstDate: string;
  lastDate: string;
  categories: TripLine["categories"];
  fromStations: string[];
  toStations: string[];
  lineStyle: { color: string; width: number; opacity: number; curveness: number };
  emphasis?: { lineStyle: { width: number; opacity: number } };
};

type PointDatum = {
  name: string;
  value: [number, number, number];
  departures: number;
  arrivals: number;
  /** 该点下到访过的车站，次数多的在前；车站粒度时只有它自己。 */
  stations: MapNode["stations"];
  /** 与该点相连的线在线系列里的下标，悬停时用来高亮。 */
  lineIndices: number[];
};

type DrawableLine = TripLine & { coords: [number, number][]; curveness: number };

/** 起讫节点都有坐标、能画出来的线。 */
function drawableLines(graph: MapGraph): DrawableLine[] {
  return graph.lines.flatMap((line) => {
    const from = graph.nodes.get(line.fromId);
    const to = graph.nodes.get(line.toId);
    if (from?.lng == null || from.lat == null || to?.lng == null || to.lat == null) {
      return [];
    }
    return [
      {
        ...line,
        coords: [
          [from.lng, from.lat],
          [to.lng, to.lat],
        ] as [number, number][],
        // 往返都沿「前进方向」同侧弯曲；若再按 id 取反号，会和坐标对调叠成一条弧。
        curveness: lineCurveness({ lng: from.lng, lat: from.lat }, { lng: to.lng, lat: to.lat }),
      },
    ];
  });
}

function dateRange(first: string, last: string): string {
  return first === last ? first : `首次 ${first} · 最近 ${last}`;
}

function categoryBreakdown(categories: TripLine["categories"]): string {
  return TRAIN_CATEGORIES.flatMap((category) => {
    const count = categories[category];
    return count ? [`${TRAIN_CATEGORY_LABEL[category]} ${count}`] : [];
  }).join(" · ");
}

function lineTooltip(data: LineDatum): string {
  const rows = [
    `${escapeHtml(data.fromName)} → ${escapeHtml(data.toName)}`,
    `${data.count} 次 · ${escapeHtml(dateRange(data.firstDate, data.lastDate))}`,
  ];
  const breakdown = categoryBreakdown(data.categories);
  if (breakdown) rows.push(escapeHtml(breakdown));
  // 城市粒度下，补一行实际走过的车站；与节点同名时不重复。
  const from = data.fromStations.join("、");
  const to = data.toStations.join("、");
  if (from !== data.fromName || to !== data.toName) {
    rows.push(`车站：${escapeHtml(from)} → ${escapeHtml(to)}`);
  }
  return rows.join("<br/>");
}

const TOOLTIP_STATION_LIMIT = 5;

function pointTooltip(data: PointDatum): string {
  const rows = [
    escapeHtml(data.name),
    `出发 ${data.departures} 次 · 到达 ${data.arrivals} 次`,
  ];
  const only = data.stations.length === 1 ? data.stations[0] : undefined;
  if (data.stations.length > 1 || (only && only.name !== data.name)) {
    const shown = data.stations
      .slice(0, TOOLTIP_STATION_LIMIT)
      .map((station) => `${station.name} ${station.count}`)
      .join("、");
    const more =
      data.stations.length > TOOLTIP_STATION_LIMIT ? ` 等 ${data.stations.length} 站` : "";
    rows.push(`车站：${escapeHtml(shown)}${more}`);
  }
  return rows.join("<br/>");
}

export type MapSeriesOptions = {
  /** 地图聚合粒度：按城市合并同城车站，或逐站显示。 */
  granularity: MapGranularity;
  share?: boolean;
  /** 随缩放的大小系数（1 为默认视野），分享图固定为 1。 */
  scale?: number;
};

export function buildMapSeries(
  trips: Trip[],
  stations: Station[],
  options: MapSeriesOptions,
  graph = buildMapGraph(trips, stations, options.granularity),
): SeriesOption[] {
  const share = options.share ?? false;
  const widthBoost = share ? 2.1 : 1;
  const sizeScale = share ? 1 : (options.scale ?? 1);
  const drawable = drawableLines(graph);
  const breaks = lineCountBreaks(drawable.map((line) => line.count));
  const lines: LineDatum[] = drawable
    .map(({ coords, curveness, ...line }) => {
      const visual = mapLineVisual(line.count, breaks);
      const width = visual.width * widthBoost * sizeScale;
      const opacity = share ? Math.min(0.92, visual.opacity + 0.08) : visual.opacity;
      return {
        ...line,
        coords,
        lineStyle: { color: visual.color, width, opacity, curveness },
        emphasis: { lineStyle: { width: width + 1.2, opacity: 1 } },
      };
    })
    .sort((a, b) => a.count - b.count);

  const linesByStation = new Map<string, number[]>();
  lines.forEach((line, index) => {
    for (const id of [line.fromId, line.toId]) {
      const bucket = linesByStation.get(id);
      if (bucket) bucket.push(index);
      else linesByStation.set(id, [index]);
    }
  });

  const points: PointDatum[] = [...graph.nodes.values()].flatMap((node) => {
    if (node.lng == null || node.lat == null) return [];
    return [
      {
        name: node.name,
        value: [node.lng, node.lat, node.departures + node.arrivals || 1] as [number, number, number],
        departures: node.departures,
        arrivals: node.arrivals,
        stations: node.stations,
        lineIndices: linesByStation.get(node.id) ?? [],
      },
    ];
  });

  return [
    {
      type: "lines",
      coordinateSystem: "geo",
      zlevel: 2,
      polyline: false,
      data: lines,
      silent: share,
      emphasis: share ? undefined : { lineStyle: { opacity: 1 } },
      tooltip: share
        ? { show: false }
        : {
            formatter: (params) => lineTooltip((params as unknown as { data: LineDatum }).data),
          },
    },
    {
      type: "scatter",
      coordinateSystem: "geo",
      zlevel: 3,
      data: points,
      silent: share,
      symbolSize: (value: number[]) =>
        share
          ? Math.min(22, 10 + value[2] * 0.7)
          : Math.min(8, 3.5 + value[2] * 0.4) * sizeScale,
      itemStyle: {
        color: "rgba(210, 198, 176, 0.82)",
        borderColor: "rgba(154, 142, 122, 0.65)",
        borderWidth: share ? 1.6 : 0.7,
      },
      // 悬停时放大并提亮，补偿小圆点难以命中的问题。
      emphasis: share
        ? undefined
        : { scale: 1.9, itemStyle: { color: "#fff3d6", borderColor: "#fff3d6" } },
      label: { show: false },
      tooltip: share
        ? { show: false }
        : {
            formatter: (params) => pointTooltip((params as unknown as { data: PointDatum }).data),
          },
    },
  ];
}

export type MapLegend = {
  tiers: Array<{ tier: LineTier; label: string; width: number; opacity: number; color: string }>;
  /** 因起点或终点缺坐标而画不出来的行程数。 */
  unplotted: number;
};

/** 图例：当前图上各档线的次数区间，以及没画出来的行程数。 */
export function buildMapLegend(
  trips: Trip[],
  stations: Station[],
  granularity: MapGranularity,
  graph = buildMapGraph(trips, stations, granularity),
): MapLegend {
  const counts = drawableLines(graph).map((line) => line.count);
  const tiers = lineLegendTiers(counts, lineCountBreaks(counts));
  return {
    tiers: tiers.map((item: LegendTier) => ({
      tier: item.tier,
      label: formatLegendRange(item),
      ...legendLineStyle(item.tier),
    })),
    unplotted: graph.unplotted,
  };
}

export function geoOption(overrides: Partial<GeoComponentOption> = {}): GeoComponentOption {
  const option: GeoComponentOption = {
    map: MAP_NAME,
    roam: true,
    zoom: DEFAULT_ZOOM,
    scaleLimit: ZOOM_RANGE,
    boundingCoords: [
      [73.2, 18.05],
      [135.15, 53.6],
    ],
    silent: true,
    itemStyle: {
      areaColor: "#243449",
      borderColor: "#5b7694",
      borderWidth: 0.7,
    },
    emphasis: {
      disabled: true,
    },
    ...overrides,
  };
  if (option.boundingCoords == null) {
    delete option.boundingCoords;
  }
  return option;
}

/** 页面内地图与分享图共用的底图、背景和提示框设置。 */
export function mapFrame(share = false, geoOverrides: Partial<GeoComponentOption> = {}) {
  return {
    backgroundColor: "#0b1018",
    tooltip: share
      ? { show: false }
      : {
          trigger: "item" as const,
          backgroundColor: "#f4efe4",
          borderColor: "#d6cbb8",
          textStyle: { color: "#1a120c" },
        },
    geo: geoOption(geoOverrides),
  };
}

export function buildTripMapOption(
  trips: Trip[],
  stations: Station[],
  options: { granularity: MapGranularity; roam?: boolean; share?: boolean },
): EChartsOption {
  const share = options.share ?? false;
  const frame = mapFrame(share, {
    roam: options.roam ?? !share,
    zoom: share ? 1 : DEFAULT_ZOOM,
    ...(share
      ? {
          // 按像素拉满宽度，避免 3:4 画布把中国轮廓缩在正中、上下大片留白。
          layoutCenter: ["50%", "50%"] as [string, string],
          layoutSize: 2040,
          boundingCoords: undefined,
        }
      : {}),
  });
  return {
    ...frame,
    animation: !share,
    animationDuration: share ? 0 : 400,
    series: buildMapSeries(trips, stations, { granularity: options.granularity, share }),
  };
}
