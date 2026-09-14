import { cityFromStationName } from "../domain/city";
import type { Station } from "../domain/types";

export function stationKey(name: string): string {
  return name.trim().replace(/(火车站|站)$/, "").trim();
}

export function lookupStation(name: string, stations: Station[]): Station | undefined {
  const key = stationKey(name);
  if (!key) return undefined;
  return (
    stations.find((station) => stationKey(station.name) === key) ??
    stations.find((station) => station.name === name)
  );
}

export function ensureStation(name: string, stations: Station[]): Station {
  const existing = lookupStation(name, stations);
  if (existing) return existing;
  const key = stationKey(name);
  return {
    id: `custom:${key}`,
    name: key,
    city: cityFromStationName(key),
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type StationHit = { station: Station; index: number; length: number };

/** 同一位置先试更长的站名；若它会把后面另一个站吃掉，再退回较短的（合肥西安 ≠ 合肥西）。 */
function pickStationPair(hits: StationHit[]): { from?: Station; to?: Station } {
  const ranked = [...hits].sort((a, b) => a.index - b.index || b.length - a.length);
  let i = 0;
  while (i < ranked.length) {
    const start = ranked[i].index;
    let j = i;
    while (j < ranked.length && ranked[j].index === start) j += 1;
    for (const from of ranked.slice(i, j)) {
      const to = ranked.find((hit) => hit.index >= from.index + from.length);
      if (to) return { from: from.station, to: to.station };
    }
    i = j;
  }
  return { from: ranked[0]?.station, to: undefined };
}

export function extractStationPair(
  text: string,
  stations: Station[],
): { from?: Station; to?: Station; fromName?: string; toName?: string } {
  const normalized = text.replace(/\s+/g, "");
  const ranked = [...stations].sort((a, b) => b.name.length - a.name.length);
  const hits: StationHit[] = [];

  for (const station of ranked) {
    const key = stationKey(station.name);
    if (key.length < 2) continue;
    const pattern = new RegExp(escapeRegExp(key) + "站?");
    const match = pattern.exec(normalized);
    if (!match || match.index < 0) continue;
    hits.push({ station, index: match.index, length: match[0].length });
  }

  const { from, to } = pickStationPair(hits);
  return {
    from,
    to,
    fromName: from?.name,
    toName: to?.name,
  };
}
