const PRICE_MAX = 100_000;

/** 四舍五入到分，拒绝非正数与离谱金额。 */
export function normalizeTicketPrice(value: number): number | undefined {
  if (!Number.isFinite(value) || value <= 0 || value > PRICE_MAX) return undefined;
  return Math.round(value * 100) / 100;
}

function priceFromMatch(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  return normalizeTicketPrice(Number(raw));
}

/** 读表单、12306 字段或导入 JSON 里的票价。 */
export function parseTicketPrice(value: unknown): number | undefined {
  if (typeof value === "number") return normalizeTicketPrice(value);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const match = /(?:¥|￥)?\s*(\d{1,6}(?:\.\d{1,2})?)\s*元?/.exec(trimmed);
  return priceFromMatch(match?.[1]);
}

/** 从票面 OCR / 粘贴文本里抽票价，优先「票价」「¥」。 */
export function parseTicketPriceFromText(text: string): number | undefined {
  const labeled = /(?:票价|票款)[:：\s]*[¥￥]?\s*(\d{1,6}(?:\.\d{1,2})?)\s*元?/.exec(text);
  if (labeled) return priceFromMatch(labeled[1]);
  const marked = /[¥￥]\s*(\d{1,6}(?:\.\d{1,2})?)/.exec(text);
  if (marked) return priceFromMatch(marked[1]);
  const yuan = /(?<!\d)(\d{1,6}(?:\.\d{1,2})?)\s*元/.exec(text);
  return priceFromMatch(yuan?.[1]);
}

function compactAmount(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, "");
}

/** 列表与卡片用：`553.5 元`。 */
export function formatTicketPrice(value: number): string {
  return `${compactAmount(value)} 元`;
}

/** 分享图等窄处用：`553.5元`。 */
export function compactTicketPrice(value: number): string {
  return `${compactAmount(value)}元`;
}
