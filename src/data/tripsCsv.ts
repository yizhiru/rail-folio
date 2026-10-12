import { allStations } from "../assets/stations";
import { ensureStation, lookupStation } from "../ingest/matchStation";
import { compareTripsRecentFirst } from "../domain/sortTrips";
import type { Archive, Station, Trip } from "../domain/types";
import { ArchiveParseError, emptyArchive, parseArchiveText, sanitizeTrip } from "./archiveSchema";

/**
 * 导出文件是一张给人读的行程表（CSV）：车站写站名，没有 id、指纹、车型、来源这类内部字段。
 * 车型由车次推出，指纹由日期 + 车次 + 起讫站重新算，所以读回来不丢信息。
 * 本机档案（`trips.json`）仍按电报码存，两者互不影响。
 */
export const CSV_COLUMNS = [
  "日期",
  "车次",
  "出发站",
  "到达站",
  "出发时间",
  "到达时间",
  "席别",
  "票价",
  "里程",
  "备注",
] as const;

type Column = (typeof CSV_COLUMNS)[number];

/** 带 BOM 的 UTF-8，Excel 直接双击打开不会乱码。 */
const BOM = "\uFEFF";

function csvField(value: string | number | undefined): string {
  if (value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function stationName(id: string, byId: Map<string, Station>): string {
  return byId.get(id)?.name ?? id.replace(/^custom:/, "");
}

/** 把本机档案写成 CSV 文本。 */
export function exportArchiveCsv(archive: Archive): string {
  const byId = new Map(allStations(archive).map((station) => [station.id, station]));
  // 与行程页同一个顺序：日期新的在前，同一天晚出发的在前。
  const rows = [...archive.trips].sort(compareTripsRecentFirst).map((trip): Record<Column, string | number | undefined> => ({
    日期: trip.date,
    车次: trip.trainNo,
    出发站: stationName(trip.fromStationId, byId),
    到达站: stationName(trip.toStationId, byId),
    出发时间: trip.departureTime,
    到达时间: trip.arrivalTime || trip.arrivalDayOffset != null ? `${trip.arrivalTime ?? ""}${trip.arrivalDayOffset != null ? ` (+${trip.arrivalDayOffset}天)` : ""}` : undefined,
    席别: trip.seatClass,
    票价: trip.ticketPrice,
    里程: trip.distanceKm,
    备注: trip.notes,
  }));
  const lines = [
    CSV_COLUMNS.join(","),
    ...rows.map((row) => CSV_COLUMNS.map((column) => csvField(row[column])).join(",")),
  ];
  return BOM + lines.join("\r\n") + "\r\n";
}

/** 按 RFC 4180 切成行与格：支持引号、引号内的逗号与换行、`""` 转义，CRLF / LF 都行。 */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === ",") {
      endField();
    } else if (ch === "\n") {
      endRow();
    } else if (ch === "\r") {
      if (text[i + 1] === "\n") i += 1;
      endRow();
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) endRow();
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

/** 读回 CSV：站名按内置站表匹配（规则同 OCR 导入），匹配不上的新建自定义站。 */
export function archiveFromCsv(text: string): Archive {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ""));
  if (rows.length === 0) throw new ArchiveParseError("文件是空的");
  const header = rows[0].map((cell) => cell.trim());
  const index = new Map<string, number>(header.map((name, i) => [name, i]));
  const missing = (["日期", "车次", "出发站", "到达站"] as const).filter((name) => !index.has(name));
  if (missing.length > 0) {
    throw new ArchiveParseError(`表头缺少：${missing.join("、")}`);
  }

  const known: Station[] = [...allStations(emptyArchive())];
  const customs = new Map<string, Station>();
  const resolve = (name: string): string | undefined => {
    if (!name) return undefined;
    const station = lookupStation(name, known) ?? ensureStation(name, known);
    if (station.id.startsWith("custom:")) customs.set(station.id, station);
    if (!known.some((item) => item.id === station.id)) known.push(station);
    return station.id;
  };

  const trips: Trip[] = [];
  const invalidRows: number[] = [];
  for (const [rowIndex, cells] of rows.slice(1).entries()) {
    const cell = (name: Column) => (cells[index.get(name) ?? -1] ?? "").trim();
    const distance = Number(cell("里程"));
    const arrival = /^(.*?)(?:\s*\(\+(\d+)天\))?$/.exec(cell("到达时间"));
    const trip = sanitizeTrip(
      {
        date: cell("日期"),
        trainNo: cell("车次"),
        fromStationId: resolve(cell("出发站")),
        toStationId: resolve(cell("到达站")),
        departureTime: cell("出发时间"),
        arrivalTime: arrival?.[1]?.trim(),
        arrivalDayOffset: arrival?.[2] == null ? undefined : Number(arrival[2]),
        seatClass: cell("席别"),
        ticketPrice: cell("票价"),
        distanceKm: cell("里程") ? distance : undefined,
        notes: cell("备注"),
        source: "json-import",
      },
      "json-import",
    );
    if (trip) trips.push(trip);
    else invalidRows.push(rowIndex + 2);
  }
  if (invalidRows.length) throw new ArchiveParseError(`${invalidRows.length} 行记录无效（第 ${invalidRows.slice(0, 10).join("、")} 行），请检查日期、时刻和必填字段`);
  return { ...emptyArchive(), trips, customStations: [...customs.values()] };
}

/** 解析要导入的文本：CSV 行程表，或旧版 JSON 档案。 */
export function parseImportText(raw: string): Archive {
  const head = raw.replace(/^\uFEFF/, "").trimStart()[0];
  return head === "{" || head === "[" ? parseArchiveText(raw) : archiveFromCsv(raw);
}
