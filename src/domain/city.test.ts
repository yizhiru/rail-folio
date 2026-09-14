import { describe, expect, it } from "vitest";
import { cityFromStationName, cityOfStation } from "./city";

describe("cityOfStation", () => {
  it("uses the city field when present", () => {
    expect(cityOfStation({ name: "北京南", city: "北京" })).toBe("北京");
    expect(cityOfStation({ name: "汉口", city: "武汉" })).toBe("武汉");
  });

  it("folds directional stations in the same city", () => {
    expect(cityFromStationName("上海虹桥")).toBe("上海");
    expect(cityFromStationName("上海南")).toBe("上海");
    expect(cityFromStationName("南京南")).toBe("南京");
    expect(cityFromStationName("广州南")).toBe("广州");
    expect(cityFromStationName("北京西")).toBe("北京");
    expect(cityFromStationName("杭州东")).toBe("杭州");
    expect(cityFromStationName("汉口")).toBe("武汉");
    expect(cityFromStationName("武昌")).toBe("武汉");
  });

  it("keeps two-character place names that end with a direction", () => {
    expect(cityFromStationName("丹东")).toBe("丹东");
    expect(cityFromStationName("启东站")).toBe("启东");
    expect(cityFromStationName("海东")).toBe("海东");
    expect(cityFromStationName("周口东")).toBe("周口");
  });
});
