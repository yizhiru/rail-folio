import { describe, expect, it } from "vitest";
import { compactDuration } from "../../domain/duration";
import { shareFooterStats } from "./shareStats";

describe("compactDuration", () => {
  it("keeps share-card duration short", () => {
    expect(compactDuration(0)).toBe("0分钟");
    expect(compactDuration(50)).toBe("50分钟");
    expect(compactDuration(185)).toBe("3小时5分");
    expect(compactDuration(26 * 60)).toBe("26小时");
  });
});

describe("shareFooterStats", () => {
  it("puts station, city, duration and fare on the poster footer", () => {
    expect(shareFooterStats({ stationCount: 42, cityCount: 18, totalMinutes: 185, totalTicketPrice: 553.5, pricedTripCount: 2 })).toEqual([
      { label: "到过车站", value: "42" },
      { label: "到过城市", value: "18" },
      { label: "乘车时长", value: "3小时5分" },
      { label: "票价合计", value: "553.5元" },
    ]);
  });
});
