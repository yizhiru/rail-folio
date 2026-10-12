import { emptyArchive, normalizeArchive } from "./archiveSchema";
import { ensureArchiveStation } from "./archiveOps";
import type { Archive, Station } from "../domain/types";

/** 事务串行计算并写盘；只有成功落盘的快照可以参与去重和发布到 UI。 */
export class ArchiveWriter {
  private current = emptyArchive();
  private writable = false;
  private queue: Promise<unknown> = Promise.resolve();
  private pendingStations = new Map<string, Station>();

  constructor(
    private save: (archive: Archive) => Promise<void>,
    private publish: (archive: Archive) => void,
  ) {}

  initialize(archive: Archive) {
    this.current = archive;
    this.writable = true;
    this.publish(archive);
  }

  ensureStation(name: string): Station {
    const result = ensureArchiveStation({
      ...this.current,
      customStations: [...this.current.customStations, ...this.pendingStations.values()],
    }, name);
    if (!this.current.customStations.some((station) => station.id === result.station.id)
        && result.archive.customStations.some((station) => station.id === result.station.id)) {
      this.pendingStations.set(result.station.id, result.station);
    }
    return result.station;
  }

  commit(recipe: (archive: Archive) => Archive): Promise<void> {
    const stations = new Map(this.pendingStations);
    const run = this.queue.then(async () => {
      if (!this.writable) throw new Error("档案尚未成功读取，为避免覆盖数据已禁止写入");
      const next = recipe(this.current);
      const used = new Set(next.trips.flatMap((trip) => [trip.fromStationId, trip.toStationId]));
      const customs = new Map(next.customStations.map((station) => [station.id, station]));
      for (const [id, station] of stations) {
        if (used.has(id) && !customs.has(id)) customs.set(id, station);
      }
      const snapshot = customs.size === next.customStations.length
        ? next : { ...next, customStations: [...customs.values()] };
      normalizeArchive(snapshot, "manual");
      await this.save(snapshot);
      this.current = snapshot;
      for (const id of customs.keys()) this.pendingStations.delete(id);
      this.publish(snapshot);
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}
