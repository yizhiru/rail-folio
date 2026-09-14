import { findDuplicate, tripFingerprint } from "./fingerprint";
import type { Trip, TripDraft, TripInput } from "./types";

export type TripFillSource = Partial<
  Pick<Trip, "departureTime" | "arrivalTime" | "seatClass" | "ticketPrice" | "distanceKm" | "notes">
>;

const FILL_KEYS = [
  "departureTime",
  "arrivalTime",
  "seatClass",
  "ticketPrice",
  "distanceKm",
  "notes",
] as const;

function isBlank(value: unknown): boolean {
  return value == null || value === "";
}

/** 只补档案里空着的字段，已有值不覆盖。有补上的内容则返回新对象。 */
export function fillMissingTripFields(existing: Trip, incoming: TripFillSource): Trip | undefined {
  const patch: TripFillSource = {};
  for (const key of FILL_KEYS) {
    if (isBlank(existing[key]) && !isBlank(incoming[key])) {
      patch[key] = incoming[key] as never;
    }
  }
  if (Object.keys(patch).length === 0) return undefined;
  return { ...existing, ...patch };
}

export function tripNeedsFill(existing: Trip, incoming: TripFillSource): boolean {
  return fillMissingTripFields(existing, incoming) != null;
}

/** 同一指纹：能补空字段则勾选待入库，否则标成已有、不勾选。 */
export function annotateDuplicateDraft(draft: TripDraft, existing: Trip[]): TripDraft {
  const { date, trainNo, fromStationId, toStationId } = draft.parsed;
  if (!date || !trainNo || !fromStationId || !toStationId) return draft;
  const dup = findDuplicate(
    { fingerprint: tripFingerprint(date, trainNo, fromStationId, toStationId) },
    existing,
  );
  if (!dup) return draft;
  const canFill = tripNeedsFill(dup, draft.parsed);
  return {
    ...draft,
    duplicateOf: dup.id,
    selected: canFill,
    needsReview: !canFill,
  };
}

export function tripInputFillSource(input: TripInput): TripFillSource {
  return {
    departureTime: input.departureTime,
    arrivalTime: input.arrivalTime,
    seatClass: input.seatClass,
    ticketPrice: input.ticketPrice,
    distanceKm: input.distanceKm,
    notes: input.notes,
  };
}
