import { cityOfStation } from "../domain/city";
import { formatDuration, tripDurationMin } from "../domain/duration";
import { formatTicketPrice } from "../domain/price";
import { TRAIN_CATEGORIES, type Station, type TrainCategory, type Trip } from "../domain/types";
import { summarizeTrips, type CityCount } from "./summarize";

export type SliceStats = {
  tripCount: number;
  cityCount: number;
  stationCount: number;
  totalMinutes: number;
  durationLabel: string;
  totalTicketPrice: number;
  pricedTripCount: number;
  ticketPriceLabel: string;
};

export type YearSlice = SliceStats & { year: string };
export type CategorySlice = SliceStats & { category: TrainCategory };

export type AnalyzeStats = {
  years: string[];
  byYear: YearSlice[];
  byCategory: CategorySlice[];
};

export type MonthCount = { month: number; label: string; count: number };

export type YearView = {
  year: string;
  slice: SliceStats;
  byMonth: MonthCount[];
  byCategory: CategorySlice[];
  topCities: CityCount[];
};

function stationCity(stationId: string, stations: Map<string, Station>): string {
  const station = stations.get(stationId);
  return station ? cityOfStation(station) : cityOfStation({ name: stationId });
}

function roundPrice(value: number): number {
  return Math.round(value * 100) / 100;
}

export function sliceStats(trips: Trip[], stations: Station[]): SliceStats {
  const stationMap = new Map(stations.map((station) => [station.id, station]));
  const cities = new Set<string>();
  const stationIds = new Set<string>();
  let totalMinutes = 0;
  let totalTicketPrice = 0;
  let pricedTripCount = 0;

  for (const trip of trips) {
    stationIds.add(trip.fromStationId);
    stationIds.add(trip.toStationId);
    cities.add(stationCity(trip.fromStationId, stationMap));
    cities.add(stationCity(trip.toStationId, stationMap));
    const duration = tripDurationMin(trip);
    if (duration) totalMinutes += duration.minutes;
    if (trip.ticketPrice != null) {
      totalTicketPrice += trip.ticketPrice;
      pricedTripCount += 1;
    }
  }

  const price = roundPrice(totalTicketPrice);
  return {
    tripCount: trips.length,
    cityCount: cities.size,
    stationCount: stationIds.size,
    totalMinutes,
    durationLabel: totalMinutes > 0 ? formatDuration(totalMinutes) : "—",
    totalTicketPrice: price,
    pricedTripCount,
    ticketPriceLabel: pricedTripCount > 0 ? formatTicketPrice(price) : "—",
  };
}

function groupBy<K>(trips: Trip[], keyOf: (trip: Trip) => K): Map<K, Trip[]> {
  const groups = new Map<K, Trip[]>();
  for (const trip of trips) {
    const key = keyOf(trip);
    const bucket = groups.get(key);
    if (bucket) bucket.push(trip);
    else groups.set(key, [trip]);
  }
  return groups;
}

function slicesFrom<K, T>(
  groups: Map<K, Trip[]>,
  stations: Station[],
  order: K[],
  toRow: (key: K, stats: SliceStats) => T,
): T[] {
  return order.flatMap((key) => {
    const trips = groups.get(key);
    if (!trips) return [];
    return [toRow(key, sliceStats(trips, stations))];
  });
}

function categorySlices(trips: Trip[], stations: Station[]): CategorySlice[] {
  const categories = groupBy(trips, (trip) => trip.category);
  const categoryKeys = [...TRAIN_CATEGORIES].sort(
    (a, b) => (categories.get(b)?.length ?? 0) - (categories.get(a)?.length ?? 0),
  );
  return slicesFrom(categories, stations, categoryKeys, (category, stats) => ({
    category,
    ...stats,
  }));
}

export function listYears(trips: Trip[]): string[] {
  return [...new Set(trips.map((trip) => trip.date.slice(0, 4)))].sort((a, b) => b.localeCompare(a));
}

export function monthCounts(trips: Trip[]): MonthCount[] {
  const counts = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    label: `${index + 1}月`,
    count: 0,
  }));
  for (const trip of trips) {
    const month = Number(trip.date.slice(5, 7));
    if (month >= 1 && month <= 12) counts[month - 1].count += 1;
  }
  return counts;
}

export function analyzeTrips(trips: Trip[], stations: Station[]): AnalyzeStats {
  const years = groupBy(trips, (trip) => trip.date.slice(0, 4));
  const yearKeys = [...years.keys()].sort((a, b) => b.localeCompare(a));
  return {
    years: yearKeys,
    byYear: slicesFrom(years, stations, yearKeys, (year, stats) => ({ year, ...stats })),
    byCategory: categorySlices(trips, stations),
  };
}

export function analyzeYear(trips: Trip[], stations: Station[], year: string): YearView {
  const yearTrips = trips.filter((trip) => trip.date.slice(0, 4) === year);
  return {
    year,
    slice: sliceStats(yearTrips, stations),
    byMonth: monthCounts(yearTrips),
    byCategory: categorySlices(yearTrips, stations),
    topCities: summarizeTrips(yearTrips, stations).topCities,
  };
}
