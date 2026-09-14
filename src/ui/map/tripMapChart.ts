import type { Station, Trip } from "../../domain/types";
import { mapLineVisual, stationCounts, tripLines, uniqueTripStations } from "../../map/buildLayers";
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
  return mapReady;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

type LineDatum = {
  coords: [number, number][];
  fromName: string;
  toName: string;
  count: number;
  lineStyle: { color: string; width: number; opacity: number; curveness: number };
};

export function buildMapSeries(trips: Trip[], stations: Station[], share = false): SeriesOption[] {
  const stationMap = new Map(stations.map((station) => [station.id, station]));
  const widthBoost = share ? 2.1 : 1;
  const lines: LineDatum[] = tripLines(trips, stations)
    .flatMap((line) => {
      const from = stationMap.get(line.fromId);
      const to = stationMap.get(line.toId);
      if (from?.lng == null || from.lat == null || to?.lng == null || to.lat == null) {
        return [];
      }
      const visual = mapLineVisual(line.count);
      return [
        {
          coords: [
            [from.lng, from.lat],
            [to.lng, to.lat],
          ] as [number, number][],
          fromName: line.fromName,
          toName: line.toName,
          count: line.count,
          lineStyle: {
            color: visual.color,
            width: visual.width * widthBoost,
            opacity: share ? Math.min(0.92, visual.opacity + 0.08) : visual.opacity,
            // 往返都沿「前进方向」同侧弯曲；若再按 id 取反号，会和坐标对调叠成一条弧。
            curveness: 0.22,
          },
        },
      ];
    })
    .sort((a, b) => a.count - b.count);

  const counts = stationCounts(trips);
  const points = uniqueTripStations(trips, stations).map((station) => ({
    name: station.name,
    value: [station.lng as number, station.lat as number, counts.get(station.id) ?? 1],
  }));

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
            formatter: (params) => {
              const data = (params as unknown as { data: LineDatum }).data;
              return `${escapeHtml(data.fromName)} → ${escapeHtml(data.toName)}<br/>${data.count} 次`;
            },
          },
    },
    {
      type: "scatter",
      coordinateSystem: "geo",
      zlevel: 3,
      data: points,
      silent: share,
      symbolSize: (value: number[]) =>
        share ? Math.min(22, 10 + value[2] * 0.7) : Math.min(8, 3.5 + value[2] * 0.4),
      itemStyle: {
        color: "rgba(210, 198, 176, 0.82)",
        borderColor: "rgba(154, 142, 122, 0.65)",
        borderWidth: share ? 1.6 : 0.7,
      },
      label: { show: false },
      tooltip: share
        ? { show: false }
        : {
            formatter: (params) => escapeHtml(String((params as { name?: string }).name ?? "")),
          },
    },
  ];
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

export function buildTripMapOption(
  trips: Trip[],
  stations: Station[],
  options: { roam?: boolean; share?: boolean } = {},
): EChartsOption {
  const share = options.share ?? false;
  const geo = geoOption({
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
    backgroundColor: "#0b1018",
    animation: !share,
    animationDuration: share ? 0 : 400,
    tooltip: share
      ? { show: false }
      : {
          trigger: "item",
          backgroundColor: "#f4efe4",
          borderColor: "#d6cbb8",
          textStyle: { color: "#1a120c" },
        },
    geo,
    series: buildMapSeries(trips, stations, share),
  };
}
