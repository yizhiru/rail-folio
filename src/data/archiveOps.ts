import { allStations } from "../assets/stations";
import {
  categoryFromTrainNo,
  createTripId,
  findDuplicate,
  tripFingerprint,
} from "../domain/fingerprint";
import { fillMissingTripFields, tripInputFillSource } from "../domain/tripFill";
import type { Archive, Station, Trip, TripInput } from "../domain/types";
import { ensureStation } from "../ingest/matchStation";

export type UpsertResult = {
  archive: Archive;
  saved: Trip[];
  /** 与已有行程指纹相同但 id 不同的记录，按 saved 的顺序对应，可能为 undefined。 */
  duplicates: Array<Trip | undefined>;
};

export function buildTrip(input: TripInput): Trip {
  const { id, ...rest } = input;
  return {
    ...rest,
    id: id ?? createTripId(),
    category: categoryFromTrainNo(input.trainNo),
    fingerprint: tripFingerprint(
      input.date,
      input.trainNo,
      input.fromStationId,
      input.toStationId,
    ),
  };
}

/** 新增或按 id 更新一批行程；无 id 且指纹已存在时，只补空字段。新记录放在最前面。纯函数，不做持久化。 */
export function upsertTrips(archive: Archive, inputs: TripInput[]): UpsertResult {
  let trips = archive.trips;
  const saved: Trip[] = [];
  const duplicates: Array<Trip | undefined> = [];
  for (const input of inputs) {
    const trip = buildTrip(input);
    if (input.id && trips.some((item) => item.id === input.id)) {
      saved.push(trip);
      duplicates.push(findDuplicate(trip, trips.filter((item) => item.id !== trip.id)));
      trips = trips.map((item) => (item.id === trip.id ? trip : item));
      continue;
    }
    const existing = findDuplicate(trip, trips);
    if (existing) {
      const filled = fillMissingTripFields(existing, tripInputFillSource(input));
      if (filled) {
        saved.push(filled);
        duplicates.push(undefined);
        trips = trips.map((item) => (item.id === existing.id ? filled : item));
      } else {
        saved.push(existing);
        duplicates.push(existing);
      }
      continue;
    }
    saved.push(trip);
    duplicates.push(undefined);
    trips = [trip, ...trips];
  }
  return { archive: { ...archive, trips }, saved, duplicates };
}

export function removeTrip(archive: Archive, id: string): Archive {
  return { ...archive, trips: archive.trips.filter((trip) => trip.id !== id) };
}

/** 找到或创建车站；只有真正新增自定义站时才返回新的 archive 对象。 */
export function ensureArchiveStation(
  archive: Archive,
  name: string,
): { archive: Archive; station: Station } {
  const merged = allStations(archive);
  const station = ensureStation(name, merged);
  if (merged.some((item) => item.id === station.id)) {
    return { archive, station };
  }
  return {
    archive: { ...archive, customStations: [...archive.customStations, station] },
    station,
  };
}

/** 按指纹合并两批行程，已有记录优先，空字段用后到的补上；结果按日期倒序。 */
export function mergeTrips(current: Trip[], incoming: Trip[]): Trip[] {
  const map = new Map(current.map((trip) => [trip.fingerprint, trip]));
  for (const trip of incoming) {
    const existing = map.get(trip.fingerprint);
    if (!existing) {
      map.set(trip.fingerprint, trip);
      continue;
    }
    const filled = fillMissingTripFields(existing, trip);
    if (filled) map.set(trip.fingerprint, filled);
  }
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function mergeStations(current: Station[], incoming: Station[]): Station[] {
  const map = new Map(current.map((station) => [station.id, station]));
  for (const station of incoming) {
    if (!map.has(station.id)) map.set(station.id, station);
  }
  return [...map.values()];
}

/** 把导入的档案并入当前档案：行程按指纹去重，来源统一标为 json-import。 */
export function mergeArchives(current: Archive, incoming: Archive): Archive {
  return {
    ...current,
    trips: mergeTrips(
      current.trips,
      incoming.trips.map((trip) => ({ ...trip, source: "json-import" as const })),
    ),
    customStations: mergeStations(current.customStations, incoming.customStations),
  };
}
