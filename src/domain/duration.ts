import { isValidDayOffset } from "./tripValidation";
import type { Trip } from "./types";

function timeToMinutes(value: string): number | undefined {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return undefined;
  return hours * 60 + minutes;
}

/** 明确天数优先；旧档案缺少天数时按时刻推断。 */
export function arrivalDayOffset(trip: Pick<Trip, "departureTime" | "arrivalTime" | "arrivalDayOffset">): number {
  if (isValidDayOffset(trip.arrivalDayOffset)) return trip.arrivalDayOffset;
  return isNextDayArrival(trip.departureTime, trip.arrivalTime) ? 1 : 0;
}

export function isNextDayArrival(departureTime?: string, arrivalTime?: string): boolean {
  const departure = departureTime ? timeToMinutes(departureTime) : undefined;
  const arrival = arrivalTime ? timeToMinutes(arrivalTime) : undefined;
  return departure != null && arrival != null && arrival <= departure;
}

/** 同时有出发和到达时刻才计入总时长。 */
export function tripDurationMin(trip: Trip): { minutes: number } | undefined {
  const departure = trip.departureTime ? timeToMinutes(trip.departureTime) : undefined;
  const arrival = trip.arrivalTime ? timeToMinutes(trip.arrivalTime) : undefined;
  if (departure == null || arrival == null) return undefined;
  if (trip.arrivalDayOffset != null && !isValidDayOffset(trip.arrivalDayOffset)) return undefined;
  const minutes = arrival - departure + arrivalDayOffset(trip) * 24 * 60;
  return minutes >= 0 ? { minutes } : undefined;
}

/** 展示精确到分钟，不折成天。整小时不写 0 min。 */
export type DurationUnit = "h" | "min";
export type DurationSegment = { amount: number; unit: DurationUnit };

export function durationSegments(minutes: number): DurationSegment[] {
  if (minutes < 60) return [{ amount: Math.max(0, minutes), unit: "min" }];
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest > 0) return [{ amount: hours, unit: "h" }, { amount: rest, unit: "min" }];
  return [{ amount: hours, unit: "h" }];
}

export function formatDuration(minutes: number): string {
  return durationSegments(minutes)
    .map((part) => `${part.amount} ${part.unit}`)
    .join(" ");
}
