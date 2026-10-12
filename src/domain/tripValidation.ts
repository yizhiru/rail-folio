export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isValidTime(value: string): boolean {
  return /^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(value);
}

export function isValidDayOffset(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 30;
}

export function dateDayOffset(departure?: string, arrival?: string): number | undefined {
  if (!departure || !arrival || !isValidDate(departure) || !isValidDate(arrival)) return undefined;
  const days = (Date.parse(`${arrival}T00:00:00Z`) - Date.parse(`${departure}T00:00:00Z`)) / 86400000;
  return isValidDayOffset(days) ? days : undefined;
}
