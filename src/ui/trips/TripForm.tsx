import { isValidDate, isValidTime, isValidDayOffset } from "../../domain/tripValidation";
import { useRef, useState } from "react";
import { arrivalDayOffset } from "../../domain/duration";
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
  arrivalDayOffset: string;
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
  arrivalDayOffset: "",
  seatClass: "",
  ticketPrice: "",
  distanceKm: "",
  notes: "",
};



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
    arrivalDayOffset: trip.arrivalDayOffset == null ? "" : String(trip.arrivalDayOffset),
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
    arrivalDayOffset: values.arrivalDayOffset === "" ? undefined : Number(values.arrivalDayOffset),
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
  if (!isValidDate(values.date)) return "日期无效";
  if (values.arrivalDayOffset !== "" && !isValidDayOffset(Number(values.arrivalDayOffset))) return "跨日天数应为 0–30 的整数";
  if (values.arrivalDayOffset === "0" && values.departureTime && values.arrivalTime) {
    const minutes = (time: string) => time.split(":").reduce((h, m) => h * 60 + Number(m), 0);
    if (minutes(values.arrivalTime) < minutes(values.departureTime)) return "当天到达时，到达时刻不能早于出发时刻";
  }
  if (values.departureTime && !isValidTime(values.departureTime.trim())) {
    return "出发时刻格式应为 HH:mm";
  }
  if (values.arrivalTime && !isValidTime(values.arrivalTime.trim())) {
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
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof TripFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((current) => ({ ...current, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (savingRef.current) return;
    const problem = validateTripForm(values);
    if (problem) {
      setMessage(problem);
      return;
    }
    savingRef.current = true;
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
          arrivalDayOffset: "",
          ticketPrice: "",
          distanceKm: "",
          notes: "",
        }));
        setMessage("已保存");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const days = arrivalDayOffset({ ...values, arrivalDayOffset: values.arrivalDayOffset === "" ? undefined : Number(values.arrivalDayOffset) });
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
          {days > 0 ? (
            <span className="day-offset" title={`${days} 天后到达`}>
              +{days}
            </span>
          ) : null}
        </span>
        <input value={values.arrivalTime} onChange={set("arrivalTime")} placeholder="12:00" />
      </label>
      <label>
        跨日天数（选填）
        <input type="number" min={0} max={30} step={1} value={values.arrivalDayOffset} onChange={set("arrivalDayOffset")} placeholder="留空按时刻推断；当天填 0" />
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
