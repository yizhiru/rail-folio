import { describe, expect, it } from "vitest";
import { shareFooterStats } from "./shareStats";

describe("shareFooterStats", () => {
  it("puts station, city, duration and fare on the poster footer", () => {
    expect(
      shareFooterStats({
        stationCount: 42,
        cityCount: 18,
        totalMinutes: 185,
        totalTicketPrice: 553.5,
        pricedTripCount: 2,
      }),
    ).toEqual([
      { label: "到过车站", value: "42" },
      { label: "到过城市", value: "18" },
      {
        label: "乘车时长",
        value: "3 h 5 min",
        duration: [
          { amount: 3, unit: "h" },
          { amount: 5, unit: "min" },
        ],
      },
      { label: "总花费", value: "553.5元" },
    ]);
  });
});
