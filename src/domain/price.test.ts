import { describe, expect, it } from "vitest";
import {
  compactTicketPrice,
  formatTicketPrice,
  parseTicketPrice,
  parseTicketPriceFromText,
} from "./price";

describe("parseTicketPrice", () => {
  it("accepts numbers and yuan-labeled strings", () => {
    expect(parseTicketPrice(553.5)).toBe(553.5);
    expect(parseTicketPrice("553.50")).toBe(553.5);
    expect(parseTicketPrice("¥144.5")).toBe(144.5);
    expect(parseTicketPrice("￥73 元")).toBe(73);
    expect(parseTicketPrice("0")).toBeUndefined();
    expect(parseTicketPrice(-1)).toBeUndefined();
    expect(parseTicketPrice("abc")).toBeUndefined();
  });
});

describe("parseTicketPriceFromText", () => {
  it("prefers an explicit 票价 label", () => {
    expect(parseTicketPriceFromText("二等座 票价:553.5元 02车08A")).toBe(553.5);
    expect(parseTicketPriceFromText("票价￥144.50")).toBe(144.5);
    expect(parseTicketPriceFromText("G123 上海虹桥 南京南 ¥73.5")).toBe(73.5);
    expect(parseTicketPriceFromText("G123 上海虹桥 南京南 09:00开")).toBeUndefined();
  });
});

describe("formatTicketPrice", () => {
  it("drops trailing zeros", () => {
    expect(formatTicketPrice(73)).toBe("73 元");
    expect(formatTicketPrice(553.5)).toBe("553.5 元");
    expect(compactTicketPrice(553.5)).toBe("553.5元");
  });
});
