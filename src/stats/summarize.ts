import { cityOfStation } from "../domain/city";
import { formatDuration, arrivalDayOffset, tripDurationMin } from "../domain/duration";
import { formatTicketPrice } from "../domain/price";
import type { Station, TrainCategory, Trip } from "../domain/types";

export type YearCount = {
  year: string;
  count: number;
  /** 该年已填票价的行程金额合计（元）；一条都没填时为空，图上断开而不是画成 0。 */
  spend?: number;
  /** 该年里填了票价的行程数，用来提示花费只覆盖了一部分。 */
  pricedCount: number;
};
export type CategoryCount = { category: TrainCategory; count: number };
export type CityCount = { city: string; count: number; stations: string[] };
export type StationCount = { name: string; count: number };
export type RouteCount = {
  fromName: string;
  toName: string;
  tripCount: number;
};

type TripHighlightBase = {
  date: string;
  trainNo: string;
  fromName: string;
  toName: string;
};

export type PriceHighlight = TripHighlightBase & { ticketPrice: number };
export type DurationHighlight = TripHighlightBase & { minutes: number };

type CityAgg = { count: number; stations: Set<string>; lastSeen: string };

function visitStamp(date: string, time?: string): string {
  const match = time ? /^(\d{1,2}):(\d{2})$/.exec(time.trim()) : null;
  const hhmm = match ? `${match[1].padStart(2, "0")}:${match[2]}` : "00:00";
  return `${date}T${hhmm}`;
}

function addCalendarDays(isoDate: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const stamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days);
  return new Date(stamp).toISOString().slice(0, 10);
}

function tripRecency(trip: Trip): string {
  return visitStamp(trip.date, trip.departureTime);
}

function tripStations(trip: Trip, stationMap: Map<string, Station>): Pick<TripHighlightBase, "fromName" | "toName"> {
  return {
    fromName: stationMap.get(trip.fromStationId)?.name ?? trip.fromStationId,
    toName: stationMap.get(trip.toStationId)?.name ?? trip.toStationId,
  };
}

/** 指标更高者胜；相同则日期（及开车时刻）更近的在前。 */
function pickHighlight(current: Trip | undefined, candidate: Trip, metric: number, currentMetric: number): Trip {
  if (!current || metric > currentMetric) return candidate;
  if (metric < currentMetric) return current;
  return tripRecency(candidate) > tripRecency(current) ? candidate : current;
}

export type OverviewStats = {
  tripCount: number;
  stationCount: number;
  /** 作为起点或终点出现最多的车站；没有行程时为空。 */
  topStation?: StationCount;
  cityCount: number;
  totalMinutes: number;
  knownMinutes: number;
  durationLabel: string;
  /** 已填写票价的行程金额合计（元）。 */
  totalTicketPrice: number;
  pricedTripCount: number;
  ticketPriceLabel: string;
  /** 已填票价里金额最高的一程；没有已填票价时为空。 */
  maxPriceTrip?: PriceHighlight;
  /** 同时有开车、到达时刻里耗时最长的一程；没有可计时长时为空。 */
  longestTrip?: DurationHighlight;
  byYear: YearCount[];
  byCategory: CategoryCount[];
  topCities: CityCount[];
  topRoutes: RouteCount[];
};

const TOP_CITY_COUNT = 10;
const TOP_ROUTE_COUNT = 6;

function routeCounts(trips: Trip[], stations: Station[]): RouteCount[] {
  const stationMap = new Map(stations.map((station) => [station.id, station]));
  const routes = new Map<string, RouteCount>();
  for (const trip of trips) {
    const key = `${trip.fromStationId}|${trip.toStationId}`;
    const current = routes.get(key);
    if (current) {
      current.tripCount += 1;
      continue;
    }
    routes.set(key, {
      fromName: stationMap.get(trip.fromStationId)?.name ?? trip.fromStationId,
      toName: stationMap.get(trip.toStationId)?.name ?? trip.toStationId,
      tripCount: 1,
    });
  }

  return [...routes.values()]
    .sort(
      (a, b) =>
        b.tripCount - a.tripCount ||
        a.fromName.localeCompare(b.fromName) ||
        a.toName.localeCompare(b.toName),
    )
    .slice(0, TOP_ROUTE_COUNT);
}

export function summarizeTrips(trips: Trip[], stations: Station[]): OverviewStats {
  const stationMap = new Map(stations.map((station) => [station.id, station]));
  const years = new Map<string, { count: number; spend: number; pricedCount: number }>();
  const categories = new Map<TrainCategory, number>();
  const cityCounts = new Map<string, CityAgg>();
  let knownMinutes = 0;
  let totalTicketPrice = 0;
  let pricedTripCount = 0;
  let maxPriceTrip: Trip | undefined;
  let longestTrip: Trip | undefined;
  let longestMinutes = 0;

  const touchCity = (stationId: string, stamp: string): string => {
    const station = stationMap.get(stationId);
    const name = station?.name ?? stationId;
    const city = station ? cityOfStation(station) : cityOfStation({ name });
    const current = cityCounts.get(city) ?? { count: 0, stations: new Set<string>(), lastSeen: "" };
    current.stations.add(name);
    if (stamp > current.lastSeen) current.lastSeen = stamp;
    cityCounts.set(city, current);
    return city;
  };

  for (const trip of trips) {
    const year = trip.date.slice(0, 4);
    const yearAgg = years.get(year) ?? { count: 0, spend: 0, pricedCount: 0 };
    yearAgg.count += 1;
    if (trip.ticketPrice != null) {
      yearAgg.spend += trip.ticketPrice;
      yearAgg.pricedCount += 1;
    }
    years.set(year, yearAgg);
    categories.set(trip.category, (categories.get(trip.category) ?? 0) + 1);
    const fromStamp = visitStamp(trip.date, trip.departureTime);
    const toDate = addCalendarDays(trip.date, arrivalDayOffset(trip));
    const toStamp = visitStamp(toDate, trip.arrivalTime ?? trip.departureTime);
    const fromCity = touchCity(trip.fromStationId, fromStamp);
    const toCity = touchCity(trip.toStationId, toStamp);
    cityCounts.get(fromCity)!.count += 1;
    if (toCity !== fromCity) cityCounts.get(toCity)!.count += 1;

    const duration = tripDurationMin(trip);
    if (duration) {
      knownMinutes += duration.minutes;
      longestTrip = pickHighlight(longestTrip, trip, duration.minutes, longestMinutes);
      if (longestTrip === trip) longestMinutes = duration.minutes;
    }
    if (trip.ticketPrice != null) {
      totalTicketPrice += trip.ticketPrice;
      pricedTripCount += 1;
      maxPriceTrip = pickHighlight(maxPriceTrip, trip, trip.ticketPrice, maxPriceTrip?.ticketPrice ?? 0);
    }
  }

  const stationVisits = new Map<string, number>();
  for (const trip of trips) {
    stationVisits.set(trip.fromStationId, (stationVisits.get(trip.fromStationId) ?? 0) + 1);
    stationVisits.set(trip.toStationId, (stationVisits.get(trip.toStationId) ?? 0) + 1);
  }
  let topStation: StationCount | undefined;
  for (const [stationId, count] of stationVisits) {
    if (!topStation || count > topStation.count) {
      topStation = { name: stationMap.get(stationId)?.name ?? stationId, count };
    }
  }

  const topCities = [...cityCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count || b[1].lastSeen.localeCompare(a[1].lastSeen))
    .slice(0, TOP_CITY_COUNT)
    .map(([city, value]) => ({
      city,
      count: value.count,
      stations: [...value.stations].sort(),
    }));

  return {
    tripCount: trips.length,
    stationCount: stationVisits.size,
    topStation,
    cityCount: cityCounts.size,
    totalMinutes: knownMinutes,
    knownMinutes,
    durationLabel: formatDuration(knownMinutes),
    totalTicketPrice: Math.round(totalTicketPrice * 100) / 100,
    pricedTripCount,
    ticketPriceLabel:
      pricedTripCount > 0 ? formatTicketPrice(Math.round(totalTicketPrice * 100) / 100) : "—",
    maxPriceTrip: maxPriceTrip
      ? {
          date: maxPriceTrip.date,
          trainNo: maxPriceTrip.trainNo,
          ticketPrice: maxPriceTrip.ticketPrice!,
          ...tripStations(maxPriceTrip, stationMap),
        }
      : undefined,
    longestTrip: longestTrip
      ? {
          date: longestTrip.date,
          trainNo: longestTrip.trainNo,
          minutes: longestMinutes,
          ...tripStations(longestTrip, stationMap),
        }
      : undefined,
    byYear: [...years.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([year, agg]) => ({
        year,
        count: agg.count,
        spend: agg.pricedCount > 0 ? Math.round(agg.spend * 100) / 100 : undefined,
        pricedCount: agg.pricedCount,
      })),
    byCategory: [...categories.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => ({ category, count })),
    topCities,
    topRoutes: routeCounts(trips, stations),
  };
}
