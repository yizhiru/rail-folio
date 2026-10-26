import { cityOfStation } from "../domain/city";
import { addCalendarDays } from "../domain/dateLabel";
import { arrivalDayOffset } from "../domain/duration";
import type { Station, Trip } from "../domain/types";

export type YearFootprint = {
  year: string;
  newCityCount: number;
  newStationCount: number;
};

/** 只计行程起讫地点；首次出现以整份档案为准，与录入顺序无关。 */
export function yearlyNewPlaces(trips: Trip[], stations: Station[]): YearFootprint[] {
  const stationMap = new Map(stations.map((station) => [station.id, station]));
  const firstCities = new Map<string, string>();
  const firstStations = new Map<string, string>();
  const years = new Map<string, YearFootprint>();
  const yearRow = (year: string): YearFootprint => {
    let row = years.get(year);
    if (!row) {
      row = { year, newCityCount: 0, newStationCount: 0 };
      years.set(year, row);
    }
    return row;
  };
  const touch = (stationId: string, date: string) => {
    const station = stationMap.get(stationId) ?? { name: stationId };
    const city = cityOfStation(station);
    const cityDate = firstCities.get(city);
    const stationDate = firstStations.get(stationId);
    if (!cityDate || date < cityDate) firstCities.set(city, date);
    if (!stationDate || date < stationDate) firstStations.set(stationId, date);
  };

  for (const trip of trips) {
    yearRow(trip.date.slice(0, 4));
    touch(trip.fromStationId, trip.date);
    touch(trip.toStationId, addCalendarDays(trip.date, arrivalDayOffset(trip)));
  }
  for (const date of firstCities.values()) yearRow(date.slice(0, 4)).newCityCount += 1;
  for (const date of firstStations.values()) yearRow(date.slice(0, 4)).newStationCount += 1;
  return [...years.values()].sort((a, b) => a.year.localeCompare(b.year));
}
