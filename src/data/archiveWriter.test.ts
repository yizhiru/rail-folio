import { describe, expect, it, vi } from "vitest";
import { ArchiveWriter } from "./archiveWriter";
import { emptyArchive } from "./archiveSchema";
import { upsertTrips } from "./archiveOps";
import type { Archive, TripInput } from "../domain/types";

const input: TripInput = { date: "2024-01-01", trainNo: "G1", fromStationId: "AOH", toStationId: "HGH", source: "manual" };
const insert = (archive: Archive) => upsertTrips(archive, [input]).archive;

describe("archive transactions", () => {
  it("does not publish failed saves; retry really writes and only then dedupes", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("disk full")).mockResolvedValue(undefined);
    const publish = vi.fn();
    const writer = new ArchiveWriter(save, publish);
    writer.initialize(emptyArchive());
    await expect(writer.commit(insert)).rejects.toThrow("disk full");
    expect(publish).toHaveBeenCalledTimes(1);
    await writer.commit(insert);
    expect(save).toHaveBeenCalledTimes(2);
    expect(publish.mock.lastCall?.[0].trips).toHaveLength(1);
    await writer.commit(insert);
    expect(publish.mock.lastCall?.[0].trips).toHaveLength(1);
  });

  it("serializes overlapping submissions against the last successful snapshot", async () => {
    let release!: () => void;
    const save = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; })).mockResolvedValue(undefined);
    const publish = vi.fn();
    const writer = new ArchiveWriter(save, publish);
    writer.initialize(emptyArchive());
    const first = writer.commit(insert);
    const duplicate = writer.commit(insert);
    const second = writer.commit((archive) => upsertTrips(archive, [{ ...input, date: "2024-02-01" }]).archive);
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, duplicate, second]);
    expect(publish.mock.lastCall?.[0].trips).toHaveLength(2);
  });

  it("keeps station creation and its trip in one transaction, including retry", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const publish = vi.fn();
    const writer = new ArchiveWriter(save, publish);
    writer.initialize(emptyArchive());
    const station = writer.ensureStation("不存在东");
    writer.ensureStation("未使用的车站");
    expect(save).not.toHaveBeenCalled();
    const recipe = (archive: Archive) => upsertTrips(archive, [{ ...input, toStationId: station.id }]).archive;
    await expect(writer.commit(recipe)).rejects.toThrow();
    await writer.commit(recipe);
    expect(publish.mock.lastCall?.[0].customStations).toEqual([station]);
  });

  it("rejects writes before load and invalid data without touching disk", async () => {
    const save = vi.fn();
    const writer = new ArchiveWriter(save, vi.fn());
    await expect(writer.commit(insert)).rejects.toThrow("禁止写入");
    writer.initialize(emptyArchive());
    await expect(writer.commit((archive) => upsertTrips(archive, [{ ...input, date: "2024-02-30" }]).archive)).rejects.toThrow("字段异常");
    expect(save).not.toHaveBeenCalled();
  });
});
