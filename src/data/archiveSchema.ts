import {
  categoryFromTrainNo,
  createTripId,
  tripFingerprint,
} from "../domain/fingerprint";
import { parseTicketPrice } from "../domain/price";
import { bundledStations } from "../assets/stations";
import { stationKey } from "../ingest/matchStation";
import {
  ARCHIVE_VERSION,
  TRAIN_CATEGORIES,
  TRIP_SOURCES,
  type Archive,
  type Station,
  type Trip,
  type TripSource,
} from "../domain/types";

export class ArchiveParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchiveParseError";
  }
}

export const emptyArchive = (): Archive => ({
  version: ARCHIVE_VERSION,
  trips: [],
  customStations: [],
});

/**
 * v1 车站表里几个电报码写错、ID 靠加 "2" 拼凑，v2 统一修正。
 * 这张表只在迁移 v1 档案时使用。
 */
const STATION_ID_REMAP_V1: Record<string, string> = {
  FYS: "FZS",
  FYS2: "FYS",
  XKS: "XMS",
  XKS2: "XKS",
  CUW: "CQW",
  CUW2: "CUW",
  VUQ: "ZWQ",
  VUQ2: "VUQ",
  AEQ: "HMQ",
};

/**
 * v2 内置站表（112 站）里 8 个电报码与 12306 不符，v3 换成 12306 全量站表后按官方码修正。
 * 注意南京 / 南京南在 v2 里是对调的。
 */
const STATION_ID_REMAP_V2: Record<string, string> = {
  NKH: "NJH", // 南京
  NJH: "NKH", // 南京南
  NNH: "NYH", // 黄山北
  WGQ: "DNA", // 东莞南
  KNQ: "KNA", // 惠州南
  KEW: "KQW", // 贵阳北
  GBZ: "GEZ", // 桂林西
  LVO: "LZO", // 林芝
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * 把外部数据（磁盘档案、导入的 JSON）里的一条记录整理成合法 Trip。
 * 缺少日期 / 车次 / 起讫站的记录无法使用，返回 undefined；其余字段能补的自动补齐。
 */
export function sanitizeTrip(raw: unknown, fallbackSource: TripSource): Trip | undefined {
  if (!isRecord(raw)) return undefined;
  const date = optionalString(raw.date);
  const trainNo = optionalString(raw.trainNo);
  const fromStationId = optionalString(raw.fromStationId);
  const toStationId = optionalString(raw.toStationId);
  if (!date || !trainNo || !fromStationId || !toStationId) return undefined;

  const source = (TRIP_SOURCES as readonly string[]).includes(String(raw.source))
    ? (raw.source as TripSource)
    : fallbackSource;
  const category = (TRAIN_CATEGORIES as readonly string[]).includes(String(raw.category))
    ? (raw.category as Trip["category"])
    : categoryFromTrainNo(trainNo);

  return {
    id: optionalString(raw.id) ?? createTripId(),
    date,
    trainNo,
    category,
    fromStationId,
    toStationId,
    departureTime: optionalString(raw.departureTime),
    arrivalTime: optionalString(raw.arrivalTime),
    seatClass: optionalString(raw.seatClass),
    ticketPrice: parseTicketPrice(raw.ticketPrice),
    distanceKm: optionalNumber(raw.distanceKm),
    notes: optionalString(raw.notes),
    source,
    fingerprint:
      optionalString(raw.fingerprint) ??
      tripFingerprint(date, trainNo, fromStationId, toStationId),
  };
}

export function sanitizeStation(raw: unknown): Station | undefined {
  if (!isRecord(raw)) return undefined;
  const id = optionalString(raw.id);
  const name = optionalString(raw.name);
  if (!id || !name) return undefined;
  const lng = typeof raw.lng === "number" && Number.isFinite(raw.lng) ? raw.lng : undefined;
  const lat = typeof raw.lat === "number" && Number.isFinite(raw.lat) ? raw.lat : undefined;
  return {
    id,
    name,
    telegraphCode: optionalString(raw.telegraphCode),
    city: optionalString(raw.city),
    province: optionalString(raw.province),
    lng,
    lat,
  };
}

function migrateV1Trip(trip: Trip): Trip {
  const fromStationId = STATION_ID_REMAP_V1[trip.fromStationId] ?? trip.fromStationId;
  const toStationId = STATION_ID_REMAP_V1[trip.toStationId] ?? trip.toStationId;
  // v1 在入库时把大圆距离写进了 distanceKm，并没有用户手填的来源，统一清掉改为估算。
  const { distanceKm: _dropped, ...rest } = trip;
  return {
    ...rest,
    fromStationId,
    toStationId,
    fingerprint: tripFingerprint(trip.date, trip.trainNo, fromStationId, toStationId),
  };
}

/**
 * v2 → v3：修正电报码；OCR 时新建的 custom 车站如今已在内置全量表里的，改指向内置站并删掉副本。
 */
function migrateV2(trips: Trip[], customStations: Station[]): { trips: Trip[]; customStations: Station[] } {
  const builtinByKey = new Map(bundledStations.map((station) => [stationKey(station.name), station.id]));
  const remap = new Map<string, string>(Object.entries(STATION_ID_REMAP_V2));
  const keptCustom: Station[] = [];
  for (const station of customStations) {
    const builtinId = builtinByKey.get(stationKey(station.name));
    if (builtinId) {
      remap.set(station.id, builtinId);
    } else {
      keptCustom.push(station);
    }
  }
  const migrated = trips.map((trip) => {
    const fromStationId = remap.get(trip.fromStationId) ?? trip.fromStationId;
    const toStationId = remap.get(trip.toStationId) ?? trip.toStationId;
    if (fromStationId === trip.fromStationId && toStationId === trip.toStationId) return trip;
    return {
      ...trip,
      fromStationId,
      toStationId,
      fingerprint: tripFingerprint(trip.date, trip.trainNo, fromStationId, toStationId),
    };
  });
  return { trips: migrated, customStations: keptCustom };
}

/**
 * 校验并迁移任意来源的档案对象。结构不对时抛出 ArchiveParseError，
 * 单条记录不合法时丢弃该条而不是整份失败。
 */
export function normalizeArchive(parsed: unknown, fallbackSource: TripSource): Archive {
  if (!isRecord(parsed)) {
    throw new ArchiveParseError("档案不是 JSON 对象");
  }
  if (!Array.isArray(parsed.trips)) {
    throw new ArchiveParseError("档案里没有 trips 数组");
  }
  const version = typeof parsed.version === "number" ? parsed.version : 1;
  if (version > ARCHIVE_VERSION) {
    throw new ArchiveParseError(`档案版本 ${version} 高于当前程序支持的 ${ARCHIVE_VERSION}`);
  }

  let trips = parsed.trips
    .map((item) => sanitizeTrip(item, fallbackSource))
    .filter((item): item is Trip => item != null);
  if (version < 2) {
    trips = trips.map(migrateV1Trip);
  }

  let customStations = Array.isArray(parsed.customStations)
    ? parsed.customStations
        .map(sanitizeStation)
        .filter((item): item is Station => item != null)
    : [];
  if (version < 3) {
    ({ trips, customStations } = migrateV2(trips, customStations));
  }

  return { version: ARCHIVE_VERSION, trips, customStations };
}

/** 解析磁盘 / localStorage 里的档案文本。空文本视为全新档案。 */
export function parseArchiveText(raw: string | null | undefined): Archive {
  if (!raw || !raw.trim()) return emptyArchive();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ArchiveParseError(
      `档案不是合法 JSON：${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return normalizeArchive(parsed, "json-import");
}
