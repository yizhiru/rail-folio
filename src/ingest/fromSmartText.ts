import { findDuplicate, tripFingerprint } from "../domain/fingerprint";
import { annotateDuplicateDraft, tripNeedsFill } from "../domain/tripFill";
import type { Station, Trip, TripDraft, TripInput } from "../domain/types";
import { findTrainNoMatches, parseTicketText } from "./parseTicket";

const DATE_HINT = /(?:\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日)|(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/;
const NUMERIC_TRAIN = /(?<![A-Za-z0-9])(\d{3,5})(?!\d)/;
const DATE_STRIP = /\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?/g;

function looksLikeTripLine(line: string): boolean {
  return findTrainNoMatches(line).length > 0 || DATE_HINT.test(line);
}

function looksLikeHeader(line: string): boolean {
  return /车次/.test(line) && /出发/.test(line) && findTrainNoMatches(line).length === 0;
}

function fallbackNumericTrain(text: string): string | undefined {
  const stripped = text.replace(DATE_STRIP, " ");
  return NUMERIC_TRAIN.exec(stripped)?.[1];
}

function splitAtTrainNumbers(text: string): string[] {
  const hits = findTrainNoMatches(text);
  if (hits.length < 2) return [text.trim()].filter(Boolean);
  return hits.map((hit, index) => {
    const end = hits[index + 1]?.index ?? text.length;
    const body = text.slice(hit.index, end).trim();
    if (index > 0) return body;
    const prefix = text.slice(0, hit.index).trim();
    return [prefix, body].filter(Boolean).join(" ");
  }).filter(Boolean);
}

/** 把粘贴文本拆成「一条行程一段」。一行一条优先；否则按车次切开；再否则整段当一条。 */
export function splitSmartTripText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !looksLikeHeader(line));

  if (lines.length === 0) return [];

  const tripLines = lines.filter(looksLikeTripLine);
  // 每一行都像一条完整记录（都带日期或车次）才按行拆，避免把一张票的多行拆散。
  if (lines.length >= 2 && tripLines.length === lines.length) {
    return tripLines.flatMap((line) =>
      findTrainNoMatches(line).length >= 2 ? splitAtTrainNumbers(line) : [line],
    );
  }

  if (findTrainNoMatches(normalized).length >= 2) {
    return splitAtTrainNumbers(normalized);
  }

  return lines.length === 1 ? lines : [normalized];
}

/** 把用户粘贴的多条行程收成导入草稿，站名用中文即可。 */
export function draftsFromSmartText(
  text: string,
  stations: Station[],
  existing: Trip[] = [],
): TripDraft[] {
  const drafts: TripDraft[] = [];
  const seen = new Set<string>();

  for (const chunk of splitSmartTripText(text)) {
    const draft = parseTicketText(chunk, stations, "manual");
    if (!draft.parsed.trainNo) {
      const numeric = fallbackNumericTrain(chunk);
      if (numeric) {
        draft.parsed.trainNo = numeric;
        draft.needsReview = !draft.parsed.date || !draft.parsed.fromName || !draft.parsed.toName;
        draft.selected = !draft.needsReview;
        draft.confidence = draft.needsReview ? 0.45 : 0.78;
      }
    }
    const empty =
      !draft.parsed.date &&
      !draft.parsed.trainNo &&
      !draft.parsed.fromName &&
      !draft.parsed.toName;
    if (empty) continue;

    const { date, trainNo, fromStationId, toStationId } = draft.parsed;
    if (date && trainNo && fromStationId && toStationId) {
      const key = tripFingerprint(date, trainNo, fromStationId, toStationId);
      if (seen.has(key)) continue;
      seen.add(key);
    }
    drafts.push(annotateDuplicateDraft(draft, existing));
  }

  return drafts;
}

export function tripInputsFromDrafts(
  drafts: TripDraft[],
  ensureStation: (name: string) => Station,
  existing: Trip[],
): { inputs: TripInput[]; importedIds: string[]; skippedDup: number; skippedIncomplete: number } {
  let skippedDup = 0;
  let skippedIncomplete = 0;
  const inputs: TripInput[] = [];
  const importedIds: string[] = [];
  const seen = new Set<string>();

  for (const draft of drafts.filter((item) => item.selected)) {
    const fromName = draft.parsed.fromName?.trim();
    const toName = draft.parsed.toName?.trim();
    const date = draft.parsed.date?.trim();
    const trainNo = draft.parsed.trainNo?.trim();
    if (!date || !trainNo || !fromName || !toName) {
      skippedIncomplete += 1;
      continue;
    }
    const from = ensureStation(fromName);
    const to = ensureStation(toName);
    const fingerprint = tripFingerprint(date, trainNo, from.id, to.id);
    if (seen.has(fingerprint)) {
      skippedDup += 1;
      continue;
    }
    const existingTrip = findDuplicate({ fingerprint }, existing);
    if (existingTrip && !tripNeedsFill(existingTrip, draft.parsed)) {
      skippedDup += 1;
      continue;
    }
    seen.add(fingerprint);
    importedIds.push(draft.id);
    inputs.push({
      date,
      trainNo,
      fromStationId: from.id,
      toStationId: to.id,
      departureTime: draft.parsed.departureTime,
      arrivalTime: draft.parsed.arrivalTime,
      arrivalDayOffset: draft.parsed.arrivalDayOffset,
      seatClass: draft.parsed.seatClass,
      ticketPrice: draft.parsed.ticketPrice,
      notes: draft.parsed.notes,
      source: "manual",
    });
  }

  return { inputs, importedIds, skippedDup, skippedIncomplete };
}
