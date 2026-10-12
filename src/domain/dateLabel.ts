/** `2025-02-03` → `2025年2月3日`，给卡片等展示用；不是合法的年月日就原样返回。 */
export function formatDateCn(iso: string): string {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(iso.trim());
  if (!match) return iso;
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`;
}
