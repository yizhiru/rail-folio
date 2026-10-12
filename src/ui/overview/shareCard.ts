import type { DurationSegment } from "../../domain/duration";
import type { Station, Trip } from "../../domain/types";
import type { MapGranularity } from "../../map/buildLayers";
import type { OverviewStats } from "../../stats/summarize";
import { echarts } from "../charts/echarts";
import { buildTripMapOption, ensureChinaMap } from "../map/tripMapChart";
import { shareFooterStats } from "./shareStats";

/** 2160 宽；高度按中国轮廓收紧，避免地图上下大片留白。 */
export const SHARE_WIDTH = 2160;
export const SHARE_HEIGHT = 1960;
const FOOTER_HEIGHT = 300;
const MAP_HEIGHT = SHARE_HEIGHT - FOOTER_HEIGHT;
const FONT = '"PingFang SC", "Hiragino Sans GB", "Noto Sans SC", sans-serif';
const NUM_FONT = '"Avenir Next", "Segoe UI", "Helvetica Neue", sans-serif';

function waitForChartFinished(chart: ReturnType<typeof echarts.init>): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("地图渲染超时")), 12000);
    chart.on("finished", () => {
      window.clearTimeout(timer);
      resolve();
    });
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("地图导出失败"));
    image.src = src;
  });
}

async function renderMapImage(
  trips: Trip[],
  stations: Station[],
  granularity: MapGranularity,
): Promise<HTMLImageElement> {
  await ensureChinaMap();
  const host = document.createElement("div");
  host.style.cssText = `width:${SHARE_WIDTH}px;height:${MAP_HEIGHT}px;position:fixed;left:-99999px;top:0;`;
  document.body.appendChild(host);
  // 画布本身就是目标像素，不再叠一层 devicePixelRatio，避免发糊。
  const chart = echarts.init(host, undefined, { renderer: "canvas", devicePixelRatio: 1 });
  try {
    const finished = waitForChartFinished(chart);
    chart.setOption(
      buildTripMapOption(trips, stations, { granularity, share: true, roam: false }),
      { notMerge: true },
    );
    await finished;
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 80);
    });
    return loadImage(
      chart.getDataURL({
        type: "png",
        pixelRatio: 1,
        backgroundColor: "#0b1018",
      }),
    );
  } finally {
    chart.dispose();
    host.remove();
  }
}

function fitValueFont(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number): string {
  let current = size;
  while (current > 36) {
    ctx.font = `600 ${current}px ${FONT}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    current -= 2;
  }
  return `600 ${current}px ${FONT}`;
}

function durationGap(size: number, kind: "pair" | "unit"): number {
  return size * (kind === "pair" ? 0.22 : 0.12);
}

function measureDuration(ctx: CanvasRenderingContext2D, parts: DurationSegment[], size: number): number {
  const unitSize = Math.round(size * 0.42);
  let width = 0;
  parts.forEach((part, index) => {
    if (index > 0) width += durationGap(size, "pair");
    ctx.font = `600 ${size}px ${NUM_FONT}`;
    width += ctx.measureText(String(part.amount)).width;
    width += durationGap(size, "unit");
    ctx.font = `500 ${unitSize}px ${FONT}`;
    width += ctx.measureText(part.unit).width;
  });
  return width;
}

function fitDurationSize(ctx: CanvasRenderingContext2D, parts: DurationSegment[], maxWidth: number): number {
  let size = 72;
  while (size > 36 && measureDuration(ctx, parts, size) > maxWidth) size -= 2;
  return size;
}

function drawDuration(
  ctx: CanvasRenderingContext2D,
  parts: DurationSegment[],
  centerX: number,
  y: number,
  maxWidth: number,
): void {
  const size = fitDurationSize(ctx, parts, maxWidth);
  const unitSize = Math.round(size * 0.42);
  let x = centerX - measureDuration(ctx, parts, size) / 2;
  ctx.textAlign = "left";
  parts.forEach((part, index) => {
    if (index > 0) x += durationGap(size, "pair");
    ctx.fillStyle = "#ece7dc";
    ctx.font = `600 ${size}px ${NUM_FONT}`;
    const amount = String(part.amount);
    ctx.fillText(amount, x, y);
    x += ctx.measureText(amount).width + durationGap(size, "unit");
    ctx.fillStyle = "#6ea8c9";
    ctx.font = `500 ${unitSize}px ${FONT}`;
    ctx.fillText(part.unit, x, y);
    x += ctx.measureText(part.unit).width;
  });
}

function paintChrome(ctx: CanvasRenderingContext2D, stats: OverviewStats): void {
  const w = SHARE_WIDTH;
  const footerTop = MAP_HEIGHT;

  ctx.fillStyle = "#d27a3a";
  ctx.font = `600 48px ${FONT}`;
  ctx.textAlign = "left";
  ctx.fillText("火车记", 72, 80);
  ctx.fillStyle = "rgba(236, 231, 220, 0.72)";
  ctx.font = `400 26px ${FONT}`;
  const years = stats.byYear.map((item) => item.year);
  const span =
    years.length === 0
      ? ""
      : years[0] === years[years.length - 1]
        ? years[0]
        : `${years[0]} – ${years[years.length - 1]}`;
  ctx.fillText(span ? `个人铁路足迹  ·  ${span}` : "个人铁路足迹", 72, 122);

  ctx.fillStyle = "#0b1018";
  ctx.fillRect(0, footerTop, w, FOOTER_HEIGHT);

  ctx.strokeStyle = "rgba(210, 122, 58, 0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(72, footerTop + 28);
  ctx.lineTo(w - 72, footerTop + 28);
  ctx.stroke();

  const items = shareFooterStats(stats);
  const col = (w - 144) / items.length;
  const valueY = footerTop + 148;
  const labelY = footerTop + 214;
  items.forEach((item, index) => {
    const x = 72 + col * index + col / 2;
    ctx.textAlign = "center";
    if (item.duration) {
      drawDuration(ctx, item.duration, x, valueY, col - 28);
    } else {
      ctx.fillStyle = "#ece7dc";
      ctx.font = fitValueFont(ctx, item.value, col - 28, 72);
      ctx.fillText(item.value, x, valueY);
    }
    ctx.textAlign = "center";
    ctx.fillStyle = "#9aa6b5";
    ctx.font = `400 26px ${FONT}`;
    ctx.fillText(item.label, x, labelY);
  });
}

export async function renderShareCard(
  trips: Trip[],
  stations: Station[],
  stats: OverviewStats,
  granularity: MapGranularity,
): Promise<Blob> {
  const mapImage = await renderMapImage(trips, stations, granularity);
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_WIDTH;
  canvas.height = SHARE_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建画布");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#0b1018";
  ctx.fillRect(0, 0, SHARE_WIDTH, SHARE_HEIGHT);
  ctx.drawImage(mapImage, 0, 0, SHARE_WIDTH, MAP_HEIGHT);
  paintChrome(ctx, stats);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("图片生成失败"));
    }, "image/png");
  });
  return blob;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function copyImageBlob(blob: Blob): Promise<void> {
  if (!navigator.clipboard?.write) {
    throw new Error("当前环境不支持复制图片，请改用保存");
  }
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
