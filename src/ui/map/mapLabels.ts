export type LabelRect = { x: number; y: number; width: number; height: number };
export type LabelPosition = "right" | "left" | "top" | "bottom";
export type LabelViewport = {
  width: number;
  height: number;
  zoom: number;
  project: (coordinates: [number, number]) => number[];
  obstacles?: LabelRect[];
};
type LabelPoint = {
  id: string;
  name: string;
  x: number;
  y: number;
  visits: number;
  radius: number;
};

function overlaps(a: LabelRect, b: LabelRect, gap = 0): boolean {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
}

/** 按频次安排屏幕内的标签，预留呼吸空间；平移后屏幕外的热门地点不占名额。 */
export function layoutMapLabels(points: LabelPoint[], viewport: Pick<LabelViewport, "width" | "height" | "zoom" | "obstacles">): Map<string, LabelPosition> {
  const { width, height, obstacles = [] } = viewport;
  const zoom = Math.max(1, viewport.zoom / 1.15);
  const visible = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)
    && p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height);
  const ranked = [...visible].sort((a, b) => b.visits - a.visits
    || a.name.localeCompare(b.name, "zh-CN") || a.id.localeCompare(b.id));
  // 数量随可用面积和缩放连续变化，避免固定档位突然铺满名称。
  const budget = Math.max(1, Math.floor(width * height / 36000 * Math.sqrt(zoom)));
  const gap = Math.max(12, 28 / Math.sqrt(zoom));
  const placed: LabelRect[] = [];
  const selected: LabelPoint[] = [];
  const result = new Map<string, LabelPosition>();
  const nodeBoxes = visible.map((p) => ({
    x: p.x - p.radius - 2, y: p.y - p.radius - 2,
    width: p.radius * 2 + 4, height: p.radius * 2 + 4,
  }));
  for (const point of ranked) {
    if (result.size >= budget) break;
    // 偶尔到访的地点留更大间距；放大后自然释放附近名称。
    const spacing = Math.max(24, (point.visits >= 3 ? 64 : 96) / Math.sqrt(zoom));
    if (selected.some((p) => Math.hypot(point.x - p.x, point.y - p.y) < spacing)) continue;
    const w = Array.from(point.name).reduce((sum, char) => sum + (/[\u0000-\u00ff]/.test(char) ? 7 : 11), 0) + 6;
    const h = 18;
    const distance = point.radius + 6;
    const choices: Array<[LabelPosition, LabelRect]> = [
      ["right", { x: point.x + distance, y: point.y - h / 2, width: w, height: h }],
      ["left", { x: point.x - distance - w, y: point.y - h / 2, width: w, height: h }],
      ["top", { x: point.x - w / 2, y: point.y - distance - h, width: w, height: h }],
      ["bottom", { x: point.x - w / 2, y: point.y + distance, width: w, height: h }],
    ];
    const choice = choices.find(([, box]) => box.x >= 8 && box.y >= 8
      && box.x + box.width <= width - 8 && box.y + box.height <= height - 8
      && !obstacles.some((obstacle) => overlaps(box, obstacle, 6))
      && !nodeBoxes.some((node) => overlaps(box, node))
      && !placed.some((label) => overlaps(box, label, gap)));
    if (!choice) continue;
    result.set(point.id, choice[0]);
    placed.push(choice[1]);
    selected.push(point);
  }
  return result;
}
