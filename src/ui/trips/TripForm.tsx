import { useState } from "react";
import { isNextDayArrival } from "../../domain/duration";
import { parseTicketPrice } from "../../domain/price";
import { SEAT_CLASSES, type Station, type Trip, type TripInput, type TripSource } from "../../domain/types";
import { STATION_DATALIST_ID } from "../StationDatalist";

export type TripFormValues = {
  date: string;
  trainNo: string;
  fromName: string;
  toName: string;
  departureTime: string;
  arrivalTime: string;
  seatClass: string;
  ticketPrice: string;
  distanceKm: string;
  notes: string;
};

export const EMPTY_TRIP_FORM: TripFormValues = {
  date: "",
  trainNo: "",
  fromName: "",
  toName: "",
  departureTime: "",
  arrivalTime: "",
  seatClass: "",
  ticketPrice: "",
  distanceKm: "",
  notes: "",
};

const TIME_PATTERN = /^\d{1,2}:\d{2}$/;

type Props = {
  initial?: Partial<TripFormValues>;
  mode: "create" | "edit";
  /** 返回 true 表示已成功保存。 */
  onSubmit: (values: TripFormValues) => Promise<boolean>;
  onCancel?: () => void;
};

export function tripToFormValues(trip: Trip, stationName: (id: string) => string): TripFormValues {
  return {
    date: trip.date,
    trainNo: trip.trainNo,
    fromName: stationName(trip.fromStationId),
    toName: stationName(trip.toStationId),
    departureTime: trip.departureTime ?? "",
    arrivalTime: trip.arrivalTime ?? "",
    seatClass: trip.seatClass ?? "",
    ticketPrice: trip.ticketPrice != null ? String(trip.ticketPrice) : "",
    distanceKm: trip.distanceKm != null ? String(trip.distanceKm) : "",
    notes: trip.notes ?? "",
  };
}

export function formValuesToTripInput(
  values: TripFormValues,
  ensureStation: (name: string) => Station,
  meta: { id?: string; source: TripSource },
): TripInput {
  const from = ensureStation(values.fromName.trim());
  const to = ensureStation(values.toName.trim());
  const distance = Number(values.distanceKm);
  return {
    id: meta.id,
    date: values.date,
    trainNo: values.trainNo.trim(),
    fromStationId: from.id,
    toStationId: to.id,
    departureTime: values.departureTime.trim() || undefined,
    arrivalTime: values.arrivalTime.trim() || undefined,
    seatClass: values.seatClass || undefined,
    ticketPrice: parseTicketPrice(values.ticketPrice),
    distanceKm: values.distanceKm && distance > 0 ? distance : undefined,
    notes: values.notes.trim() || undefined,
    source: meta.source,
  };
}

export function validateTripForm(values: TripFormValues): string | null {
  if (!values.date || !values.trainNo.trim() || !values.fromName.trim() || !values.toName.trim()) {
    return "日期、车次、出发站、到达站为必填";
  }
  if (values.departureTime && !TIME_PATTERN.test(values.departureTime.trim())) {
    return "出发时刻格式应为 HH:mm";
  }
  if (values.arrivalTime && !TIME_PATTERN.test(values.arrivalTime.trim())) {
    return "到达时刻格式应为 HH:mm";
  }
  if (values.distanceKm && !(Number(values.distanceKm) > 0)) {
    return "里程应为正数";
  }
  if (values.ticketPrice.trim() && parseTicketPrice(values.ticketPrice) == null) {
    return "票价应为正数，单位元";
  }
  return null;
}

export function TripForm({ initial, mode, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<TripFormValues>({ ...EMPTY_TRIP_FORM, ...initial });
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof TripFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((current) => ({ ...current, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateTripForm(values);
    if (problem) {
      setMessage(problem);
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const ok = await onSubmit(values);
      if (!ok) {
        setMessage("保存失败，请查看顶部错误提示");
        return;
      }
      if (mode === "create") {
        setValues((current) => ({
          ...current,
          trainNo: "",
          departureTime: "",
          arrivalTime: "",
          ticketPrice: "",
          distanceKm: "",
          notes: "",
        }));
        setMessage("已保存");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card form-grid" onSubmit={(e) => void submit(e)}>
      <label>
        日期
        <input type="date" value={values.date} onChange={set("date")} />
      </label>
      <label>
        车次
        <input value={values.trainNo} onChange={set("trainNo")} placeholder="G123" />
      </label>
      <label>
        出发站
        <input list={STATION_DATALIST_ID} value={values.fromName} onChange={set("fromName")} />
      </label>
      <label>
        到达站
        <input list={STATION_DATALIST_ID} value={values.toName} onChange={set("toName")} />
      </label>
      <label>
        出发时刻
        <input value={values.departureTime} onChange={set("departureTime")} placeholder="08:00" />
      </label>
      <label>
        <span>
          到达时刻
          {isNextDayArrival(values.departureTime, values.arrivalTime) ? (
            <span className="day-offset" title="次日到达">
              +1
            </span>
          ) : null}
        </span>
        <input value={values.arrivalTime} onChange={set("arrivalTime")} placeholder="12:00" />
      </label>
      <label>
        席别
        <select value={values.seatClass} onChange={set("seatClass")}>
          <option value="">未选择</option>
          {SEAT_CLASSES.map((seat) => (
            <option key={seat} value={seat}>
              {seat}
            </option>
          ))}
        </select>
      </label>
      <label>
        票价（元，选填）
        <input
          type="number"
          min={0}
          step="0.01"
          value={values.ticketPrice}
          onChange={set("ticketPrice")}
          placeholder="如 553.5"
        />
      </label>
      <label>
        里程（公里，选填）
        <input
          type="number"
          min={1}
          value={values.distanceKm}
          onChange={set("distanceKm")}
          placeholder="留空则按直线距离估算"
        />
      </label>
      <label style={{ gridColumn: "1 / -1" }}>
        备注
        <input value={values.notes} onChange={set("notes")} />
      </label>
      <div className="toolbar" style={{ gridColumn: "1 / -1" }}>
        <button className="btn" type="submit" disabled={saving}>
          {saving ? "保存中…" : mode === "create" ? "保存行程" : "保存修改"}
        </button>
        {onCancel ? (
          <button className="btn secondary" type="button" onClick={onCancel} disabled={saving}>
            取消
          </button>
        ) : null}
        {message ? <span className="notice">{message}</span> : null}
      </div>
    </form>
  );
}
