import { describe, expect, it } from "vitest";
import { layoutMapLabels } from "./mapLabels";

const viewport = { width: 800, height: 500, zoom: 1.15 };
const point = (id: string, x: number, y: number, visits = 1, name = id) => ({
  id, name, x, y, visits, radius: 5,
});

describe("adaptive map labels", () => {
  it("prioritizes frequent places in a dense cluster, independent of input order", () => {
    const points = [point("偶尔", 310, 200), point("常去", 300, 200, 20), point("远处", 600, 350)];
    const labels = layoutMapLabels(points, viewport);
    expect([...labels.keys()]).toEqual(["常去", "远处"]);
    expect(layoutMapLabels([...points].reverse(), viewport)).toEqual(labels);
  });

  it("releases nearby names when the map is enlarged", () => {
    const points = [point("常去", 200, 200, 20), point("附近", 235, 220)];
    expect(layoutMapLabels(points, viewport).size).toBe(1);
    const enlarged = points.map((p) => ({ ...p, x: 200 + (p.x - 200) * 4, y: 200 + (p.y - 200) * 4 }));
    expect(layoutMapLabels(enlarged, { ...viewport, zoom: 4.6 }).size).toBe(2);
  });

  it("chooses another side near edges and avoids map controls", () => {
    expect(layoutMapLabels([point("长车站名称", 780, 250)], viewport).get("长车站名称")).toBe("left");
    const obstacles = [{ x: 410, y: 180, width: 100, height: 40 }];
    expect(layoutMapLabels([point("车站", 400, 200)], { ...viewport, obstacles }).get("车站")).toBe("left");
    expect(layoutMapLabels([point("车站", 400, 200)], {
      ...viewport, obstacles: [{ x: 300, y: 100, width: 200, height: 200 }],
    }).size).toBe(0);
  });

  it("ignores offscreen hubs and invalid coordinates when allocating space", () => {
    const points = [point("屏幕外", -100, 200, 100), point("无效", NaN, 200, 100), point("当前地点", 150, 100)];
    expect([...layoutMapLabels(points, { width: 300, height: 200, zoom: 1.15 }).keys()]).toEqual(["当前地点"]);
  });

  it("keeps long names apart and labels away from other nodes", () => {
    const labels = layoutMapLabels([
      point("hub", 200, 200, 20, "常去的长名称车站"), point("neighbor", 225, 200),
    ], viewport);
    expect(labels.get("hub")).toBe("left");
    expect(labels.has("neighbor")).toBe(false);
  });

  it("reduces label density in smaller windows", () => {
    const points = Array.from({ length: 16 }, (_, i) => point(`站${i}`, 70 + i % 4 * 180, 80 + Math.floor(i / 4) * 110));
    const large = layoutMapLabels(points, viewport);
    const small = layoutMapLabels(points, { ...viewport, width: 350, height: 250 });
    expect(large.size).toBeGreaterThan(small.size);
    expect(small.size).toBeLessThanOrEqual(2);
  });
});
