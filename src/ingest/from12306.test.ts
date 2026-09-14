import { describe, expect, it } from "vitest";
import { draftsFrom12306, normalize12306Ticket, parse12306Clock, parse12306Date } from "./from12306";
import type { Station, Trip } from "../domain/types";

const stations: Station[] = [
  { id: "AOH", name: "上海虹桥", telegraphCode: "AOH", city: "上海" },
  { id: "NKH", name: "南京南", telegraphCode: "NKH", city: "南京" },
];

describe("parse12306Date / parse12306Clock", () => {
  it("reads ISO, compact and Chinese dates", () => {
    expect(parse12306Date("2024-01-02 09:00:00")).toBe("2024-01-02");
    expect(parse12306Date("20240102")).toBe("2024-01-02");
    expect(parse12306Date("2024年1月2日")).toBe("2024-01-02");
  });

  it("reads clock times out of datetime strings", () => {
    expect(parse12306Clock("2024-01-02 09:08:00")).toBe("09:08");
    expect(parse12306Clock("9:08")).toBe("09:08");
  });
});

describe("normalize12306Ticket", () => {
  it("reads nested stationTrainDTO fields", () => {
    const ticket = normalize12306Ticket({
      stationTrainDTO: {
        station_train_code: "g123",
        from_station_name: "上海虹桥",
        to_station_name: "南京南",
        from_station_telecode: "AOH",
        to_station_telecode: "NKH",
        start_time: "2024-05-01 09:00:00",
        arrive_time: "2024-05-01 10:02:00",
      },
      train_date: "20240501",
      seat_type_name: "二等座",
      coach_no: "05",
      seat_name: "14A",
      ticket_status_name: "已支付",
      sequence_no: "E1",
      ticket_price: "144.50",
    });
    expect(ticket).toMatchObject({
      trainNo: "G123",
      date: "2024-05-01",
      fromName: "上海虹桥",
      toName: "南京南",
      fromTelecode: "AOH",
      departureTime: "09:00",
      arrivalTime: "10:02",
      seatClass: "二等座",
      ticketPrice: 144.5,
    });
  });
});

describe("draftsFrom12306", () => {
  const paid = {
    station_train_code: "G123",
    from_station_name: "上海虹桥",
    to_station_name: "南京南",
    from_station_telecode: "AOH",
    to_station_telecode: "NKH",
    train_date: "2024-05-01",
    start_time: "09:00",
    arrive_time: "10:02",
    ticket_status_name: "已支付",
    sequence_no: "E1",
    ticket_price: "144.5",
  };

  it("turns active tickets into selected drafts", () => {
    const { drafts } = draftsFrom12306([paid], stations, []);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].selected).toBe(true);
    expect(drafts[0].parsed).toMatchObject({
      date: "2024-05-01",
      trainNo: "G123",
      fromStationId: "AOH",
      toStationId: "NKH",
      source: "12306",
      ticketPrice: 144.5,
    });
  });

  it("skips refunded tickets and dedupes the same ride", () => {
    const { drafts } = draftsFrom12306(
      [paid, paid, { ...paid, ticket_status_name: "已退票" }],
      stations,
      [],
    );
    expect(drafts).toHaveLength(1);
  });

  it("does not add tickets that already have the same details", () => {
    const existing: Trip[] = [
      {
        id: "old",
        date: "2024-05-01",
        trainNo: "G123",
        category: "G",
        fromStationId: "AOH",
        toStationId: "NKH",
        departureTime: "09:00",
        arrivalTime: "10:02",
        seatClass: "二等座",
        ticketPrice: 144.5,
        notes: "12306 E1",
        source: "manual",
        fingerprint: "2024-05-01|G123|AOH|NKH",
      },
    ];
    const { drafts, skippedExisting } = draftsFrom12306([paid], stations, existing);
    expect(drafts).toHaveLength(0);
    expect(skippedExisting).toBe(1);
  });

  it("keeps an existing ride in the list when it can fill blank fare or seat", () => {
    const existing: Trip[] = [
      {
        id: "old",
        date: "2024-05-01",
        trainNo: "G123",
        category: "G",
        fromStationId: "AOH",
        toStationId: "NKH",
        source: "manual",
        fingerprint: "2024-05-01|G123|AOH|NKH",
      },
    ];
    const { drafts, skippedExisting } = draftsFrom12306([paid], stations, existing);
    expect(skippedExisting).toBe(0);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].duplicateOf).toBe("old");
    expect(drafts[0].selected).toBe(true);
    expect(drafts[0].parsed.ticketPrice).toBe(144.5);
  });
});
