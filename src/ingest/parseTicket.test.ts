import { describe, expect, it } from "vitest";
import { parseTicketText, redactSensitive } from "../ingest/parseTicket";
import { bundledStations } from "../assets/stations";

describe("parseTicketText", () => {
  it("parses a paper-style ticket", () => {
    const text = `
      电子客票
      G123次
      上海虹桥站 南京南站
      2024年02月10日 09:00开
      02车08A号 二等座
      票价:144.5元
      110101199001011234
    `;
    const draft = parseTicketText(text, bundledStations, "ocr");
    expect(draft.parsed.trainNo).toBe("G123");
    expect(draft.parsed.date).toBe("2024-02-10");
    expect(draft.parsed.fromName).toBe("上海虹桥");
    expect(draft.parsed.toName).toBe("南京南");
    expect(draft.parsed.seatClass).toBe("二等座");
    expect(draft.parsed.ticketPrice).toBe(144.5);
    expect(draft.parsed.departureTime).toBe("09:00");
    expect(draft.parsed.arrivalTime).toBeUndefined();
    expect(draft.needsReview).toBe(false);
    expect(draft.rawText).toContain("[证件号]");
  });

  it("parses a 12306 screenshot style line", () => {
    const text = "G80 广州南-武汉 2024-08-18 15:00 商务座";
    const draft = parseTicketText(text, bundledStations, "12306-screenshot");
    expect(draft.parsed.trainNo).toBe("G80");
    expect(draft.parsed.date).toBe("2024-08-18");
    expect(draft.parsed.fromName).toBe("广州南");
    expect(draft.parsed.toName).toBe("武汉");
    expect(draft.parsed.departureTime).toBe("15:00");
  });

  it("parses labeled and ranged arrival times", () => {
    const ranged = parseTicketText(
      "G80 广州南 武汉 2024-08-18 15：00-18：58 商务座",
      bundledStations,
      "12306-screenshot",
    );
    expect(ranged.parsed.departureTime).toBe("15:00");
    expect(ranged.parsed.arrivalTime).toBe("18:58");

    const labeled = parseTicketText(
      "D2282 杭州东站 厦门北站 2024年05月01日 08:10开 13:46到 一等座",
      bundledStations,
      "ocr",
    );
    expect(labeled.parsed.departureTime).toBe("08:10");
    expect(labeled.parsed.arrivalTime).toBe("13:46");

    const nextDay = parseTicketText(
      "Z176 上海 哈尔滨 2023-10-01 20:04开 次日14:22到 软卧",
      bundledStations,
      "ocr",
    );
    expect(nextDay.parsed.departureTime).toBe("20:04");
    expect(nextDay.parsed.arrivalTime).toBe("14:22");

    const twoClocks = parseTicketText(
      "C2002 北京南 天津 2025-01-20 07:30 08:05 二等座",
      bundledStations,
      "12306-screenshot",
    );
    expect(twoClocks.parsed.departureTime).toBe("07:30");
    expect(twoClocks.parsed.arrivalTime).toBe("08:05");
  });

  it("parses N-prefix trains as 管内快速, not a bare number", () => {
    const draft = parseTicketText(
      "N201 上海虹桥 南京南 2024-03-01 19:12 22:40 硬座",
      bundledStations,
      "ocr",
    );
    expect(draft.parsed.trainNo).toBe("N201");
    expect(draft.parsed.fromName).toBe("上海虹桥");
    expect(draft.parsed.toName).toBe("南京南");
    expect(draft.needsReview).toBe(false);
  });

  it("redacts phone numbers", () => {
    expect(redactSensitive("联系 13812345678")).toContain("[手机]");
  });
});
