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

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 && hours < 8 ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

/** 分享图底部用的紧凑时长，避免把一列撑爆。 */
export function compactDuration(minutes: number): string {
  if (minutes <= 0) return "0分钟";
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 10 && rest > 0) return `${hours}小时${rest}分`;
  return `${hours}小时`;
}
