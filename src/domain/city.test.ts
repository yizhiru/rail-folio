import { describe, expect, it } from "vitest";
import { bundledStations } from "../assets/stations";
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

describe("bundled station table", () => {
  const cityOf = (name: string) => {
    const station = bundledStations.find((item) => item.name === name);
    expect(station, name).toBeDefined();
    return cityOfStation(station!);
  };

  it("puts county-level stations under their prefecture-level city", () => {
    expect(cityOf("京山")).toBe("荆门");
    expect(cityOf("京山南")).toBe("荆门");
    expect(cityOf("钟祥南")).toBe("荆门");
    expect(cityOf("当阳西")).toBe("宜昌");
    expect(cityOf("建德南")).toBe("杭州");
    expect(cityOf("温岭西")).toBe("台州");
    expect(cityOf("汉川北")).toBe("孝感");
  });

  it("keeps a county and its directional stations in one city", () => {
    for (const [a, b] of [
      ["灵武", "灵武北"],
      ["富平", "富平南"],
      ["宜城", "宜城南"],
      ["安溪", "安溪东"],
    ]) {
      expect(cityOf(a)).toBe(cityOf(b));
    }
  });

  it("treats Chongqing districts like other municipalities", () => {
    expect(cityOf("万州")).toBe("重庆");
    expect(cityOf("重庆北")).toBe("重庆");
  });
});
