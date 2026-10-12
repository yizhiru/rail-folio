import { useCallback, useMemo, useState } from "react";
import { arrivalDayOffset } from "../../domain/duration";
import { formatTicketPrice } from "../../domain/price";
import { TRAIN_CATEGORIES, TRAIN_CATEGORY_LABEL } from "../../domain/types";
import type { Station, TrainCategory, Trip, TripInput } from "../../domain/types";
import { compareTripsRecentFirst } from "../../domain/sortTrips";
import { formValuesToTripInput, TripForm, tripToFormValues } from "./TripForm";

const SOURCE_LABEL: Record<Trip["source"], string> = {
  ocr: "OCR",
  "12306-screenshot": "12306 截图",
  "12306": "12306",
  manual: "手录",
  "json-import": "JSON",
  demo: "示例",
};

type Props = {
  trips: Trip[];
  stations: Station[];
  onDelete: (id: string) => void;
  onUpdate: (input: TripInput) => Promise<boolean>;
  onEnsureStation: (name: string) => Station;
};

export function TripsPage({ trips, stations, onDelete, onUpdate, onEnsureStation }: Props) {
  const [year, setYear] = useState("all");
  const [category, setCategory] = useState<TrainCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Trip | null>(null);

  const stationMap = useMemo(
    () => new Map(stations.map((station) => [station.id, station])),
    [stations],
  );
  const stationName = useCallback(
    (id: string) => stationMap.get(id)?.name ?? id,
    [stationMap],
  );

  const years = useMemo(
    () => [...new Set(trips.map((trip) => trip.date.slice(0, 4)))].sort().reverse(),
    [trips],
  );

  const filtered = useMemo(() => {
    const needle = query.trim();
    return trips
      .filter((trip) => (year === "all" ? true : trip.date.startsWith(year)))
      .filter((trip) => (category === "all" ? true : trip.category === category))
      .filter((trip) => {
        if (!needle) return true;
        const blob = `${trip.trainNo}${stationName(trip.fromStationId)}${stationName(trip.toStationId)}`;
        return blob.includes(needle);
      })
      .sort(compareTripsRecentFirst);
  }, [trips, year, category, query, stationName]);

  return (
    <section className="page">
      <div className="toolbar">
        <select value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="all">全部年份</option>
          {years.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as TrainCategory | "all")}
        >
          <option value="all">全部车型</option>
          {TRAIN_CATEGORIES.map((item) => (
            <option key={item} value={item}>
              {TRAIN_CATEGORY_LABEL[item]}
            </option>
          ))}
        </select>
        <input
          placeholder="搜索车次 / 车站"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="muted">{filtered.length} 条</span>
      </div>

      {filtered.length === 0 ? (
        <div className="card empty">没有匹配的行程。</div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>日期</th>
                <th>车次</th>
                <th>区间</th>
                <th>出发时刻</th>
                <th>到达时刻</th>
                <th>席别</th>
                <th>票价</th>
                <th>来源</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((trip) => (
                <tr key={trip.id}>
                  <td>{trip.date}</td>
                  <td>
                    <span className="badge">{trip.trainNo}</span>
                  </td>
                  <td>
                    {stationName(trip.fromStationId)} → {stationName(trip.toStationId)}
                  </td>
                  <td>{trip.departureTime ?? "—"}</td>
                  <td>
                    {trip.arrivalTime ?? "—"}
                    {arrivalDayOffset(trip) > 0 ? (
                      <span className="day-offset" title={`${arrivalDayOffset(trip)} 天后到达`}>
                        +{arrivalDayOffset(trip)}
                      </span>
                    ) : null}
                  </td>
                  <td>{trip.seatClass ?? "—"}</td>
                  <td>{trip.ticketPrice != null ? formatTicketPrice(trip.ticketPrice) : "—"}</td>
                  <td className="muted">{SOURCE_LABEL[trip.source]}</td>
                  <td>
                    <div className="toolbar" style={{ flexWrap: "nowrap" }}>
                      <button className="btn secondary" type="button" onClick={() => setEditing(trip)}>
                        编辑
                      </button>
                      <button className="btn danger" type="button" onClick={() => onDelete(trip.id)}>
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing ? (
        <div className="viewer-backdrop" onClick={() => setEditing(null)} role="presentation">
          <div
            className="edit-panel"
            role="dialog"
            aria-modal="true"
            aria-label="编辑行程"
            onClick={(event) => event.stopPropagation()}
          >
            <TripForm
              key={editing.id}
              mode="edit"
              initial={tripToFormValues(editing, stationName)}
              onCancel={() => setEditing(null)}
              onSubmit={async (values) => {
                const ok = await onUpdate(
                  formValuesToTripInput(values, onEnsureStation, {
                    id: editing.id,
                    source: editing.source,
                  }),
                );
                if (ok) setEditing(null);
                return ok;
              }}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
