import type { Trip } from "./types";

function timeToMinutes(value: string): number | undefined {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return undefined;
  return hours * 60 + minutes;
}

/**
 * 档案只存 HH:mm。到达钟点不晚于出发时视为次日到达。
 * 跨两天及以上无法从时刻本身区分，仍按跨一天计。
 */
export function isNextDayArrival(departureTime?: string, arrivalTime?: string): boolean {
  const departure = departureTime ? timeToMinutes(departureTime) : undefined;
  const arrival = arrivalTime ? timeToMinutes(arrivalTime) : undefined;
  if (departure == null || arrival == null) return false;
  return arrival <= departure;
}

/** 只按开车与到达时刻计算。缺任一时刻则不计入总时长。 */
export function tripDurationMin(trip: Trip): { minutes: number } | undefined {
  const departure = trip.departureTime ? timeToMinutes(trip.departureTime) : undefined;
  const arrival = trip.arrivalTime ? timeToMinutes(trip.arrivalTime) : undefined;
  if (departure == null || arrival == null) return undefined;
  let minutes = arrival - departure;
  if (isNextDayArrival(trip.departureTime, trip.arrivalTime)) minutes += 24 * 60;
  return { minutes };
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
