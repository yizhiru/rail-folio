import type { TrainCategory, Trip } from "./types";

export function tripFingerprint(
  date: string,
  trainNo: string,
  fromStationId: string,
  toStationId: string,
): string {
  return `${date}|${normalizeTrainNo(trainNo)}|${fromStationId}|${toStationId}`;
}

export function normalizeTrainNo(trainNo: string): string {
  return trainNo.replace(/\s+/g, "").toUpperCase();
}

export function categoryFromTrainNo(trainNo: string): TrainCategory {
  const prefix = normalizeTrainNo(trainNo)[0];
  switch (prefix) {
    case "G":
    case "D":
    case "C":
    case "Z":
      return prefix;
    default:
      return "P";
  }
}

export function createTripId(): string {
  return crypto.randomUUID();
}

export function findDuplicate(trip: Pick<Trip, "fingerprint">, trips: Trip[]): Trip | undefined {
  return trips.find((item) => item.fingerprint === trip.fingerprint);
}
