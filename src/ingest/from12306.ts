import { dateDayOffset, isValidDate } from "../domain/tripValidation";
import { categoryFromTrainNo, findDuplicate, normalizeTrainNo, tripFingerprint } from "../domain/fingerprint";
import { tripNeedsFill } from "../domain/tripFill";
import { parseTicketPrice } from "../domain/price";
import { SEAT_CLASSES, type Station, type Trip, type TripDraft } from "../domain/types";
import { lookupStation } from "./matchStation";

export type Rail12306Ticket = {
  trainNo?: string;
  date?: string;
  fromName?: string;
  toName?: string;
  fromTelecode?: string;
  toTelecode?: string;
  departureTime?: string;
  arrivalTime?: string;
  arrivalDayOffset?: number;
  seatClass?: string;
  coachNo?: string;
  seatNo?: string;
  sequenceNo?: string;
  status?: string;
  ticketPrice?: number;
  /** 乘车人姓名；同一订单里可以有多位乘车人。 */
  passengerName?: string;
};

const SKIP_STATUS = /退票|取消|已改签/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function text(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

/** 票价优先用订单页展示的字符串；纯数字 0 不当作有效票价。 */
function firstPrice(...values: unknown[]): unknown {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  }
  return undefined;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function parse12306Date(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const iso = /(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/.exec(value);
  if (iso) {
    const date = `${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))}`;
    return isValidDate(date) ? date : undefined;
  }
  const compact = /^(\d{4})(\d{2})(\d{2})/.exec(value.trim());
  if (compact) {
    const date = `${compact[1]}-${compact[2]}-${compact[3]}`;
    return isValidDate(date) ? date : undefined;
  }
  return undefined;
}

export function parse12306Clock(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = /(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return undefined;
  return `${pad(hour)}:${pad(minute)}`;
}

function matchSeat(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const hit = SEAT_CLASSES.find((seat) => value.includes(seat));
  return hit ?? value;
}

function lookupByTelecode(code: string | undefined, stations: Station[]): Station | undefined {
  if (!code) return undefined;
  return stations.find((station) => station.id === code || station.telegraphCode === code);
}

/** 把 12306 订单里一张票的多种字段名收成统一结构。 */
export function normalize12306Ticket(raw: unknown): Rail12306Ticket | undefined {
  if (!isRecord(raw)) return undefined;
  const train = asRecord(raw.stationTrainDTO);
  const passenger = asRecord(raw.passengerDTO);
  const trainNo = text(
    raw.stationTrainCode,
    raw.station_train_code,
    raw.board_train_code,
    raw.train_code,
    raw.trainCode,
    train.station_train_code,
    train.stationTrainCode,
  );
  const fromName = text(raw.from_station_name, raw.fromStationName, train.from_station_name);
  const toName = text(raw.to_station_name, raw.toStationName, train.to_station_name);
  if (!trainNo && !fromName && !toName) return undefined;

  const startTime = text(raw.start_time, raw.startTime, train.start_time, train.startTime);
  const arriveTime = text(raw.arrive_time, raw.arriveTime, train.arrive_time, train.arriveTime);
  const date = parse12306Date(raw.train_date) ??
      parse12306Date(raw.start_train_date_page) ??
      parse12306Date(raw.train_date_local) ??
      parse12306Date(raw.start_date) ??
      parse12306Date(startTime);
  return {
    trainNo: trainNo ? normalizeTrainNo(trainNo) : undefined,
    date,
    fromName,
    toName,
    fromTelecode: text(raw.from_station_telecode, train.from_station_telecode),
    toTelecode: text(raw.to_station_telecode, train.to_station_telecode),
    departureTime: parse12306Clock(startTime),
    arrivalTime: parse12306Clock(arriveTime),
    arrivalDayOffset: dateDayOffset(date, parse12306Date(raw.arrive_date) ?? parse12306Date(raw.arrival_date) ?? parse12306Date(arriveTime)),
    seatClass: matchSeat(text(raw.seat_type_name, raw.seat_type_code)),
    coachNo: text(raw.coach_no, raw.coachNo, raw.coach_name),
    seatNo: text(raw.seat_name, raw.seat_no),
    sequenceNo: text(raw.sequence_no, raw.sequenceNo),
    status: text(raw.ticket_status_name, raw.status_name, raw.ticket_status),
    passengerName: text(
      passenger.passenger_name,
      passenger.passengerName,
      raw.passenger_name,
      raw.passengerName,
    ),
    ticketPrice: parseTicketPrice(
      firstPrice(
        raw.str_ticket_price_page,
        raw.ticket_price_page,
        raw.ticket_price,
        raw.ticketPrice,
      ),
    ),
  };
}

function isActiveTicket(ticket: Rail12306Ticket): boolean {
  return !ticket.status || !SKIP_STATUS.test(ticket.status);
}

function resolveStation(
  name: string | undefined,
  telecode: string | undefined,
  stations: Station[],
): Station | undefined {
  return lookupByTelecode(telecode, stations) ?? (name ? lookupStation(name, stations) : undefined);
}

function draftKey(ticket: Rail12306Ticket, fromId: string, toId: string): string | undefined {
  if (!ticket.date || !ticket.trainNo) return undefined;
  return tripFingerprint(ticket.date, ticket.trainNo, fromId, toId);
}

export type From12306Result = {
  drafts: TripDraft[];
  /** 指纹相同且没有可补的空字段，直接丢弃不再进入核对列表。 */
  skippedExisting: number;
  /** 订单里出现过的乘车人（去重，按出现顺序），用于对不上名字时提示。 */
  passengers: string[];
  /** 乘车人不是指定的人，被略过的车票数。 */
  skippedOtherPassengers: number;
};

function nameKey(value: string | undefined): string {
  return (value ?? "").replace(/[\s\u3000·•]/g, "");
}

export function draftsFrom12306(
  rawTickets: unknown[],
  stations: Station[],
  existing: Trip[],
  /** 只收这位乘车人的车票；同一订单里其他乘车人的票会被略过。 */
  passengerName?: string,
): From12306Result {
  const seen = new Set<string>();
  const drafts: TripDraft[] = [];
  const passengers: string[] = [];
  const wanted = nameKey(passengerName);
  let skippedExisting = 0;
  let skippedOtherPassengers = 0;

  for (const raw of rawTickets) {
    const ticket = normalize12306Ticket(raw);
    if (!ticket || !isActiveTicket(ticket)) continue;
    if (ticket.passengerName && !passengers.includes(ticket.passengerName)) {
      passengers.push(ticket.passengerName);
    }
    if (wanted && nameKey(ticket.passengerName) !== wanted) {
      skippedOtherPassengers += 1;
      continue;
    }
    const from = resolveStation(ticket.fromName, ticket.fromTelecode, stations);
    const to = resolveStation(ticket.toName, ticket.toTelecode, stations);
    const fromId = from?.id;
    const toId = to?.id;
    const fingerprint = fromId && toId ? draftKey(ticket, fromId, toId) : undefined;
    let existingTrip: Trip | undefined;
    if (fingerprint) {
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      existingTrip = findDuplicate({ fingerprint }, existing);
      if (existingTrip && !tripNeedsFill(existingTrip, ticket)) {
        skippedExisting += 1;
        continue;
      }
    }

    const needsReview = !ticket.date || !ticket.trainNo || !from || !to;
    const details = [
      ticket.sequenceNo ? `订单 ${ticket.sequenceNo}` : "12306 订单",
      ticket.passengerName,
      ticket.coachNo && ticket.seatNo ? `${ticket.coachNo}车${ticket.seatNo}` : ticket.seatNo,
      ticket.ticketPrice != null ? `${ticket.ticketPrice}元` : undefined,
      ticket.status,
    ]
      .filter(Boolean)
      .join(" · ");

    drafts.push({
      id: crypto.randomUUID(),
      rawText: details,
      confidence: needsReview ? 0.55 : 0.95,
      parsed: {
        date: ticket.date,
        trainNo: ticket.trainNo,
        category: ticket.trainNo ? categoryFromTrainNo(ticket.trainNo) : undefined,
        fromStationId: fromId,
        toStationId: toId,
        fromName: from?.name ?? ticket.fromName,
        toName: to?.name ?? ticket.toName,
        departureTime: ticket.departureTime,
        arrivalTime: ticket.arrivalTime,
        arrivalDayOffset: ticket.arrivalDayOffset,
        seatClass: ticket.seatClass,
        ticketPrice: ticket.ticketPrice,
        notes: ticket.sequenceNo ? `12306 ${ticket.sequenceNo}` : "12306 同步",
        source: "12306",
      },
      needsReview: existingTrip ? false : needsReview,
      selected: existingTrip ? true : !needsReview,
      duplicateOf: existingTrip?.id,
    });
  }

  return { drafts, skippedExisting, passengers, skippedOtherPassengers };
}
