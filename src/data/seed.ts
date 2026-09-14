import { categoryFromTrainNo, createTripId, tripFingerprint } from "../domain/fingerprint";
import { ARCHIVE_VERSION, type Archive, type Station, type Trip } from "../domain/types";

export { emptyArchive } from "./archiveSchema";

export function demoArchive(stations: Station[]): Archive {
  const byName = (name: string) => stations.find((station) => station.name === name);

  const rows: Array<[string, string, string, string, string?, string?, string?, number?]> = [
    ["2024-02-10", "G123", "上海虹桥", "南京南", "09:00", "10:02", "二等座", 144.5],
    ["2024-05-01", "D2282", "杭州东", "厦门北", "08:10", "13:46", "一等座", 553.5],
    ["2023-10-01", "Z176", "上海", "哈尔滨", "20:04", undefined, "软卧", 409],
    ["2025-01-20", "C2002", "北京南", "天津", "07:30", "08:05", "二等座", 54.5],
    ["2024-08-18", "G80", "广州南", "武汉", "15:00", "18:58", "商务座", 1381],
    ["2022-07-12", "K1316", "成都", "西安", "19:28", undefined, "硬卧"],
  ];

  const trips: Trip[] = [];
  for (const [date, trainNo, fromName, toName, departureTime, arrivalTime, seatClass, ticketPrice] of rows) {
    const from = byName(fromName);
    const to = byName(toName);
    if (!from || !to) continue;
    trips.push({
      id: createTripId(),
      date,
      trainNo,
      category: categoryFromTrainNo(trainNo),
      fromStationId: from.id,
      toStationId: to.id,
      departureTime,
      arrivalTime,
      seatClass,
      ticketPrice,
      notes: "示例行程，可删除",
      source: "demo",
      fingerprint: tripFingerprint(date, trainNo, from.id, to.id),
    });
  }

  return { version: ARCHIVE_VERSION, trips, customStations: [] };
}
