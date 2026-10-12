export const TRAIN_CATEGORIES = ["G", "D", "C", "Z", "P"] as const;

export type TrainCategory = (typeof TRAIN_CATEGORIES)[number];

export const TRAIN_CATEGORY_LABEL: Record<TrainCategory, string> = {
  G: "高铁",
  D: "动车",
  C: "城际 C",
  Z: "直达 Z",
  P: "普速",
};

export const SEAT_CLASSES = [
  "商务座",
  "特等座",
  "优选一等座",
  "一等座",
  "二等座",
  "一等卧",
  "二等卧",
  "动卧",
  "高级软卧",
  "软卧",
  "硬卧",
  "软座",
  "硬座",
  "无座",
] as const;

export type SeatClass = (typeof SEAT_CLASSES)[number];

export const TRIP_SOURCES = [
  "ocr",
  "12306-screenshot",
  "12306",
  "manual",
  "json-import",
  "demo",
] as const;

export type TripSource = (typeof TRIP_SOURCES)[number];

export type Station = {
  id: string;
  name: string;
  telegraphCode?: string;
  city?: string;
  province?: string;
  lng?: number;
  lat?: number;
};

export type Trip = {
  id: string;
  date: string;
  trainNo: string;
  category: TrainCategory;
  fromStationId: string;
  toStationId: string;
  departureTime?: string;
  arrivalTime?: string;
  /** 到达日期相对出发日期的天数；缺省沿用旧档案的时刻推断。 */
  arrivalDayOffset?: number;
  seatClass?: string;
  /** 实付票价，单位元；未填则不计入总览合计。 */
  ticketPrice?: number;
  /** 用户手填的实际里程；为空时统计层按大圆距离估算。 */
  distanceKm?: number;
  notes?: string;
  source: TripSource;
  fingerprint: string;
};

export type TripDraft = {
  id: string;
  imagePath?: string;
  rawText: string;
  confidence: number;
  parsed: Partial<Trip> & {
    fromName?: string;
    toName?: string;
  };
  needsReview: boolean;
  selected: boolean;
  duplicateOf?: string;
};

export const ARCHIVE_VERSION = 4;

export type Archive = {
  version: typeof ARCHIVE_VERSION;
  trips: Trip[];
  customStations: Station[];
};

/** 供录入/编辑表单提交的行程字段；id 存在时表示更新。 */
export type TripInput = Omit<Trip, "id" | "fingerprint" | "category"> & { id?: string };

export type OcrItem = {
  path: string;
  text: string;
  error?: string | null;
};
