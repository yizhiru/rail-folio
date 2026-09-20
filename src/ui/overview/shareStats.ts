import { durationSegments, formatDuration, type DurationSegment } from "../../domain/duration";
import { compactTicketPrice } from "../../domain/price";
import type { OverviewStats } from "../../stats/summarize";

export type ShareStat = {
  label: string;
  value: string;
  duration?: DurationSegment[];
};

export function shareFooterStats(
  stats: Pick<OverviewStats, "stationCount" | "cityCount" | "totalMinutes" | "totalTicketPrice" | "pricedTripCount">,
): ShareStat[] {
  return [
    { label: "到过车站", value: `${stats.stationCount}` },
    { label: "到过城市", value: `${stats.cityCount}` },
    {
      label: "乘车时长",
      value: formatDuration(stats.totalMinutes),
      duration: durationSegments(stats.totalMinutes),
    },
    {
      label: "票价合计",
      value: stats.pricedTripCount > 0 ? compactTicketPrice(stats.totalTicketPrice) : "—",
    },
  ];
}
