import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadArchive } from "./repository";
import { ARCHIVE_VERSION } from "../domain/types";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke, Channel: class {} }));
const rawTrip = { id: "a", date: "2024-01-01", trainNo: "G1", fromStationId: "AOH", toStationId: "HGH", fingerprint: "2024-01-01|G1|AOH|HGH" };
beforeEach(() => {
  vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
  mocks.invoke.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("archive recovery", () => {
  it("keeps future-version files untouched", async () => {
    mocks.invoke.mockResolvedValue(JSON.stringify({ version: 99, trips: [] }));
    await expect(loadArchive()).rejects.toThrow(/版本/);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
  it("reports partial corruption and duplicate IDs without moving the archive", async () => {
    mocks.invoke.mockResolvedValue(JSON.stringify({ version: ARCHIVE_VERSION, trips: [rawTrip, { ...rawTrip, date: "2024-02-30" }] }));
    await expect(loadArchive()).rejects.toThrow(/1 条行程字段异常/);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    mocks.invoke.mockResolvedValue(JSON.stringify({ version: ARCHIVE_VERSION, trips: [rawTrip, rawTrip] }));
    await expect(loadArchive()).rejects.toThrow(/重复行程 ID/);
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });
  it("backs up old versions before permitting migrated data to be used", async () => {
    mocks.invoke.mockResolvedValueOnce(JSON.stringify({ version: 3, trips: [rawTrip] })).mockResolvedValueOnce("backup.json");
    const result = await loadArchive();
    expect(mocks.invoke).toHaveBeenLastCalledWith("backup_archive", { preserve: true });
    expect(result.archive.version).toBe(ARCHIVE_VERSION);
    expect(result.notice).toContain("backup.json");
  });
  it("refuses migration when the backup fails", async () => {
    mocks.invoke.mockResolvedValueOnce(JSON.stringify({ version: 3, trips: [rawTrip] })).mockRejectedValueOnce(new Error("backup failed"));
    await expect(loadArchive()).rejects.toThrow("backup failed");
  });
  it("repairs stale fingerprints after preserving the original", async () => {
    mocks.invoke.mockResolvedValueOnce(JSON.stringify({ version: ARCHIVE_VERSION, trips: [{ ...rawTrip, fingerprint: "stale" }] })).mockResolvedValueOnce("backup.json");
    expect((await loadArchive()).archive.trips[0].fingerprint).toBe(rawTrip.fingerprint);
    expect(mocks.invoke).toHaveBeenLastCalledWith("backup_archive", { preserve: true });
  });
  it("only recovers broken JSON after a successful backup", async () => {
    mocks.invoke.mockResolvedValueOnce("{").mockResolvedValueOnce("corrupt.json");
    const result = await loadArchive();
    expect(result.archive.trips).toEqual([]);
    expect(result.recovered?.backupPath).toBe("corrupt.json");
    mocks.invoke.mockResolvedValueOnce("{").mockRejectedValueOnce(new Error("backup failed"));
    await expect(loadArchive()).rejects.toThrow("backup failed");
  });
});
