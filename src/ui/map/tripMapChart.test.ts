import { describe, expect, it } from "vitest";
import { bundledStations } from "../../assets/stations";
import type { Trip } from "../../domain/types";
import { buildMapSeries } from "./tripMapChart";

function trip(partial: Partial<Trip>): Trip {
  return {
    id: crypto.randomUUID(),
    date: "2024-01-01",
    trainNo: "G1",
    category: "G",
    fromStationId: "HGH",
    toStationId: "UUH",
    source: "manual",
    fingerprint: crypto.randomUUID(),
    ...partial,
  };
}

describe("buildMapSeries", () => {
  it("keeps reverse OD pairs as two arcs", () => {
    const series = buildMapSeries(
      [
        trip({ fromStationId: "HGH", toStationId: "UUH" }),
        trip({ fromStationId: "UUH", toStationId: "HGH" }),
      ],
      bundledStations,
    );
    const lines = (
      series[0] as { data: Array<{ fromName: string; toName: string; lineStyle: { curveness: number } }> }
    ).data;
    expect(lines).toHaveLength(2);
    expect(lines[0].lineStyle.curveness).toBe(lines[1].lineStyle.curveness);
  });

  it("merges categories on the same directed pair", () => {
    const series = buildMapSeries(
      [
        trip({ fromStationId: "HGH", toStationId: "UUH", category: "G" }),
        trip({ fromStationId: "HGH", toStationId: "UUH", category: "D", trainNo: "D1" }),
      ],
      bundledStations,
    );
    const lines = (series[0] as { data: Array<{ count: number }> }).data;
    expect(lines).toHaveLength(1);
    expect(lines[0].count).toBe(2);
  });
});
