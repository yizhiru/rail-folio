import bundled from "./stations.json";
import type { Archive, Station } from "../domain/types";

export const bundledStations: Station[] = bundled as Station[];

export function allStations(archive: Archive): Station[] {
  const map = new Map<string, Station>();
  for (const station of bundledStations) {
    map.set(station.id, station);
  }
  for (const station of archive.customStations) {
    map.set(station.id, station);
  }
  return [...map.values()];
}
