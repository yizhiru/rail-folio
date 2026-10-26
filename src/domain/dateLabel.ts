/** `2025-02-03` → `2025年2月3日`，给卡片等展示用；不是合法的年月日就原样返回。 */
export function formatDateCn(iso: string): string {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(iso.trim());
  if (!match) return iso;
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`;
}

/** 按日历顺延日期，使用 UTC 避免本机时区影响跨日、跨年统计。 */
export function addCalendarDays(isoDate: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const stamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days);
  return new Date(stamp).toISOString().slice(0, 10);
}
