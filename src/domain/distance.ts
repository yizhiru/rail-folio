import type { Station } from "./types";

const EARTH_KM = 6371;

export function haversineKm(
  from: Pick<Station, "lat" | "lng">,
  to: Pick<Station, "lat" | "lng">,
): number | undefined {
  if (
    from.lat == null ||
    from.lng == null ||
    to.lat == null ||
    to.lng == null
  ) {
    return undefined;
  }

  const φ1 = toRad(from.lat);
  const φ2 = toRad(to.lat);
  const Δφ = toRad(to.lat - from.lat);
  const Δλ = toRad(to.lng - from.lng);
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_KM * c);
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
