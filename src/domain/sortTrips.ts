import type { Trip } from "./types";

/** 日期新的在前；同一天最晚出发在前。没有合法出发时刻的排在当天后面。 */
export function compareTripsRecentFirst(
  a: Pick<Trip, "date" | "departureTime">,
  b: Pick<Trip, "date" | "departureTime">,
): number {
  const byDate = b.date.localeCompare(a.date);
  if (byDate !== 0) return byDate;
  return departureMinutes(b.departureTime) - departureMinutes(a.departureTime);
}

function departureMinutes(time?: string): number {
  const match = time ? /^(\d{1,2}):(\d{2})$/.exec(time.trim()) : null;
  if (!match) return -1;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return -1;
  return hours * 60 + minutes;
}
