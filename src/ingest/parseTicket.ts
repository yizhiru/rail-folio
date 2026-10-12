import { categoryFromTrainNo, normalizeTrainNo } from "../domain/fingerprint";
import { parseTicketPriceFromText } from "../domain/price";
import { SEAT_CLASSES, type Station, type TripDraft, type TripSource } from "../domain/types";
import { extractStationPair } from "./matchStation";

const TRAIN_NO_SOURCE = String.raw`(?<![A-Za-z0-9])([GDCZTKYSLNPgdcztkyslnp])\s*(\d{1,4})(?:次)?(?!\d)`;
const TRAIN_NO = new RegExp(TRAIN_NO_SOURCE);

/** 文中所有车次的起止位置，供智能导入按车次拆行。 */
export function findTrainNoMatches(text: string): Array<{ index: number; value: string }> {
  const matches: Array<{ index: number; value: string }> = [];
  const global = new RegExp(TRAIN_NO_SOURCE, "g");
  for (const match of text.matchAll(global)) {
    if (match.index == null) continue;
    matches.push({ index: match.index, value: `${match[1]}${match[2]}` });
  }
  return matches;
}
const DATE_CN = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/;
const DATE_ISO = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/;
const TIME = /(?<!\d)(\d{1,2}):(\d{2})(?!\d)/g;
const TIME_CN = /(?<!\d)(\d{1,2})\s*时\s*(\d{2})\s*分/;
const TIME_RANGE =
  /(?<!\d)(\d{1,2}):(\d{2})\s*[-~～至到]\s*(?:次日\s*)?(\d{1,2}):(\d{2})(?!\d)/;
const DEPART_LABELED =
  /(?:出发|开车|开点|发车)?\s*(?<!\d)(\d{1,2}):(\d{2})(?!\d)\s*(?:开|出发|开车)/;
const ARRIVE_LABELED =
  /(?:到达|到站|抵达)?\s*(?:次日\s*)?(?<!\d)(\d{1,2}):(\d{2})(?!\d)\s*(?:到|到达|到站)/;
const SEAT = new RegExp(
  `(${[...SEAT_CLASSES].sort((a, b) => b.length - a.length).join("|")})`,
);

export function redactSensitive(text: string): string {
  return text
    .replace(/\d{17}[\dXx]/g, "[证件号]")
    .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, "[手机]");
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function parseDate(text: string): string | undefined {
  const cn = DATE_CN.exec(text);
  if (cn) {
    return `${cn[1]}-${pad(Number(cn[2]))}-${pad(Number(cn[3]))}`;
  }
  const iso = DATE_ISO.exec(text);
  if (iso) {
    return `${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))}`;
  }
  return undefined;
}

function normalizeTimes(text: string): string {
  return text
    .replace(/[：﹕]/g, ":")
    .replace(/[．。]/g, (char, offset, source: string) => {
      const prev = source[offset - 1];
      const next = source[offset + 1];
      if (prev && next && /\d/.test(prev) && /\d/.test(next)) return ":";
      return char;
    })
    .replace(/[－—–−～]/g, "-");
}

function formatTime(hour: string, minute: string): string | undefined {
  const h = Number(hour);
  const m = Number(minute);
  if (h > 23 || m > 59) return undefined;
  return `${pad(h)}:${pad(m)}`;
}

function allClockTimes(source: string): string[] {
  const colon = [...source.matchAll(TIME)]
    .map((match) => formatTime(match[1], match[2]))
    .filter((item): item is string => Boolean(item));
  if (colon.length > 0) return colon;
  return [...source.matchAll(new RegExp(TIME_CN, "g"))]
    .map((match) => formatTime(match[1], match[2]))
    .filter((item): item is string => Boolean(item));
}

function parseTimes(text: string): { departureTime?: string; arrivalTime?: string } {
  const source = normalizeTimes(text);

  const range = TIME_RANGE.exec(source);
  if (range) {
    return {
      departureTime: formatTime(range[1], range[2]),
      arrivalTime: formatTime(range[3], range[4]),
    };
  }

  const clocks = allClockTimes(source);
  const departLabeled = DEPART_LABELED.exec(source);
  const arriveLabeled = ARRIVE_LABELED.exec(source);
  let departureTime = departLabeled
    ? formatTime(departLabeled[1], departLabeled[2])
    : undefined;
  let arrivalTime = arriveLabeled
    ? formatTime(arriveLabeled[1], arriveLabeled[2])
    : undefined;

  departureTime ??= clocks[0];
  if (!arrivalTime) {
    arrivalTime = clocks.find((item) => item !== departureTime);
  }

  return { departureTime, arrivalTime };
}

function parseDayOffset(text: string): number | undefined {
  const explicit = /(?:到达|到站|跨日)\s*\+?(\d{1,2})\s*天/.exec(text);
  if (explicit) return Number(explicit[1]);
  if (/第三天|后天/.test(text)) return 2;
  if (/次日|翌日/.test(text)) return 1;
  return undefined;
}

export function parseTicketText(
  rawText: string,
  stations: Station[],
  source: TripSource,
  imagePath?: string,
): TripDraft {
  const redacted = redactSensitive(rawText);
  const compact = normalizeTimes(redacted.replace(/[ \t]+/g, " "));
  const trainMatch = TRAIN_NO.exec(compact);
  const trainNo = trainMatch
    ? normalizeTrainNo(`${trainMatch[1]}${trainMatch[2]}`)
    : undefined;
  const date = parseDate(compact);
  const times = parseTimes(compact);
  const seat = SEAT.exec(compact)?.[1];
  const pair = extractStationPair(compact, stations);

  const parsed = {
    date,
    trainNo,
    category: trainNo ? categoryFromTrainNo(trainNo) : undefined,
    fromStationId: pair.from?.id,
    toStationId: pair.to?.id,
    fromName: pair.fromName,
    toName: pair.toName,
    departureTime: times.departureTime,
    arrivalTime: times.arrivalTime,
    arrivalDayOffset: parseDayOffset(compact),
    seatClass: seat,
    ticketPrice: parseTicketPriceFromText(compact),
    source,
  };

  const needsReview = !date || !trainNo || !pair.from || !pair.to;

  return {
    id: crypto.randomUUID(),
    imagePath,
    rawText: redacted,
    confidence: needsReview ? 0.45 : 0.82,
    parsed,
    needsReview,
    selected: !needsReview,
  };
}
