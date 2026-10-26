import { layoutMapLabels, type LabelPosition, type LabelViewport } from "./mapLabels";
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
  fromStations: string[];
  toStations: string[];
  lineStyle: { color: string; width: number; opacity: number; curveness: number };
  emphasis?: { lineStyle: { width: number; opacity: number } };
};

type PointDatum = {
  id: string;
  name: string;
  value: [number, number, number];
  departures: number;
  arrivals: number;
  /** 该点下到访过的车站，次数多的在前；车站粒度时只有它自己。 */
  stations: MapNode["stations"];
  /** 与该点相连的线在线系列里的下标，悬停时用来高亮。 */
  lineIndices: number[];
  label?: { show: boolean; position?: LabelPosition };
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

/** All text is escaped before entering these presentation wrappers. */
function tooltipRows(rows: string[]): string {
  return rows.map((row, index) => `<div style="${index === 0
    ? "color:#eeeae1;font-weight:600;font-size:13px;margin-bottom:6px"
    : "color:#a7b9c8;font-size:12px;margin-top:4px"}">${row}</div>`).join("");
}

function lineTooltip(data: LineDatum): string {
  const rows = [
    `${escapeHtml(data.fromName)} → ${escapeHtml(data.toName)}`,
    `${data.count} 次 · ${escapeHtml(dateRange(data.firstDate, data.lastDate))}`,
  ];
  // 城市粒度下，补一行实际走过的车站；与节点同名时不重复。
  const from = data.fromStations.join("、");
  const to = data.toStations.join("、");
  if (from !== data.fromName || to !== data.toName) {
    rows.push(`车站：${escapeHtml(from)} → ${escapeHtml(to)}`);
  }
  return tooltipRows(rows);
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
  return tooltipRows(rows);
}

export type MapSeriesOptions = {
  /** 地图聚合粒度：按城市合并同城车站，或逐站显示。 */
  granularity: MapGranularity;
  share?: boolean;
  /** 随缩放的大小系数（1 为默认视野），分享图固定为 1。 */
  scale?: number;
  /** 当前投影和可用空间，用于自适应地名布局。 */
  labelViewport?: LabelViewport;
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
        id: node.id,
        name: node.name,
        value: [node.lng, node.lat, node.departures + node.arrivals || 1] as [number, number, number],
        departures: node.departures,
        arrivals: node.arrivals,
        stations: node.stations,
        lineIndices: linesByStation.get(node.id) ?? [],
      },
    ];
  });

  const ranked = [...points].sort((a, b) =>
    b.value[2] - a.value[2] || a.name.localeCompare(b.name, "zh-CN"));
  // Only a few genuinely frequent places glow; equally visited places stay neutral.
  const medianVisits = ranked.length ? ranked[Math.floor(ranked.length / 2)].value[2] : 0;
  const hubs = ranked.filter((point) => point.value[2] >= 2 && point.value[2] > medianVisits).slice(0, 3);
  const symbol = options.granularity === "city" ? "circle" : "roundRect";
  const pointSize = (value: number[]) => (share
    ? Math.min(20, 8 + Math.sqrt(value[2]) * 1.5)
    : Math.min(10, 5.5 + Math.sqrt(value[2]) * 0.7) * sizeScale);

  if (!share && options.labelViewport) {
    const viewport = options.labelViewport;
    const labels = layoutMapLabels(points.map((point) => {
      const [x, y] = viewport.project([point.value[0], point.value[1]]);
      return { id: point.id, name: point.name, x, y, visits: point.value[2], radius: pointSize(point.value) / 2 };
    }), viewport);
    for (const point of points) {
      point.label = { show: labels.has(point.id), position: labels.get(point.id) ?? "right" };
    }
  } else {
    // 分享图保持精简；交互地图待投影就绪后再计算布局。
    const labelled = new Set(ranked.slice(0, share ? 8 : 0).map((point) => point.id));
    for (const point of points) point.label = { show: labelled.has(point.id) };
  }

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
      symbol,
      symbolSize: pointSize,
      itemStyle: {
        color: "#82c9c2",
        opacity: 0.95,
        borderColor: "#172b38",
        borderWidth: share ? 1 : 0.6,
      },
      emphasis: share ? undefined : {
        scale: 1.35,
        itemStyle: { color: "#fff1d6", borderColor: "#fff1d6", opacity: 1 },
        label: { show: true, color: "#fff1d6" },
      },
      label: {
        show: false,
        formatter: "{b}",
        position: "right",
        distance: share ? 8 : 6,
        color: "#c3cfce",
        fontSize: share ? 23 : 11,
        fontFamily: "PingFang SC, sans-serif",
        textBorderColor: "#13202c",
        textBorderWidth: share ? 4 : 3,
      },
      labelLayout: { hideOverlap: true },
      tooltip: share
        ? { show: false }
        : {
            formatter: (params) => pointTooltip((params as unknown as { data: PointDatum }).data),
          },
    },
    {
      type: "scatter",
      coordinateSystem: "geo",
      zlevel: 2,
      z: 1,
      data: hubs.map((point) => ({ name: point.name, value: point.value })),
      silent: true,
      symbol,
      symbolSize: (value: number[]) => pointSize(value) * 2.6,
      itemStyle: {
        color: "rgba(130, 201, 194, 0.10)",
        shadowBlur: share ? 18 : 10,
        shadowColor: "rgba(130, 201, 194, 0.3)",
      },
      tooltip: { show: false },
      emphasis: { disabled: true },
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
      areaColor: "#1b2b3b",
      borderColor: "#354a5e",
      borderWidth: 0.5,
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
    animationDurationUpdate: 0,
    tooltip: share
      ? { show: false }
      : {
          trigger: "item" as const,
          backgroundColor: "rgba(18, 30, 43, 0.97)",
          borderColor: "#354a5e",
          borderWidth: 1,
          padding: [12, 14],
          confine: true,
          extraCssText: "border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.24);max-width:320px;white-space:normal;line-height:1.6;",
          textStyle: { color: "#c3cfce" },
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
