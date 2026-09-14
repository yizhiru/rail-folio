import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { allStations } from "../assets/stations";
import {
  ensureArchiveStation,
  removeTrip as removeTripOp,
  upsertTrips as upsertTripsOp,
} from "../data/archiveOps";
import { emptyArchive } from "../data/archiveSchema";
import { loadArchive, saveArchive } from "../data/repository";
import type { Archive, Station, Trip, TripInput } from "../domain/types";

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function useArchive() {
  const [archive, setArchive] = useState<Archive>(emptyArchive());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const archiveRef = useRef(archive);
  // 读取失败时禁止任何写入，避免用空档案覆盖磁盘上可能还完整的数据。
  const writableRef = useRef(false);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  const stations = useMemo(() => allStations(archive), [archive]);

  /** 所有写盘串行进行，保证最后落盘的一定是最新状态。resolve 为是否成功。 */
  const persist = useCallback((next: Archive): Promise<boolean> => {
    const run = queueRef.current.then(async () => {
      if (!writableRef.current) {
        throw new Error("档案尚未成功读取，为避免覆盖数据已禁止写入");
      }
      await saveArchive(next);
    });
    queueRef.current = run.catch(() => undefined);
    return run.then(
      () => {
        setError(null);
        return true;
      },
      (err: unknown) => {
        setError(describe(err));
        return false;
      },
    );
  }, []);

  const commit = useCallback(
    (recipe: (current: Archive) => Archive): Promise<boolean> => {
      const next = recipe(archiveRef.current);
      if (next === archiveRef.current) return Promise.resolve(true);
      archiveRef.current = next;
      setArchive(next);
      return persist(next);
    },
    [persist],
  );

  useEffect(() => {
    let cancelled = false;
    loadArchive()
      .then((result) => {
        if (cancelled) return;
        archiveRef.current = result.archive;
        writableRef.current = true;
        setArchive(result.archive);
        if (result.recovered) {
          setNotice(
            `原档案无法读取（${result.recovered.reason}），已备份到 ${result.recovered.backupPath}，当前从空档案开始。`,
          );
        }
        setReady(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(`读取档案失败：${describe(err)}。为避免覆盖数据，本次运行不会写入。`);
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const upsertTrips = useCallback(
    async (inputs: TripInput[]) => {
      let saved: Trip[] = [];
      let duplicates: Array<Trip | undefined> = [];
      const persisted = await commit((current) => {
        const result = upsertTripsOp(current, inputs);
        saved = result.saved;
        duplicates = result.duplicates;
        return result.archive;
      });
      return { saved, duplicates, persisted };
    },
    [commit],
  );

  const upsertTrip = useCallback(
    async (input: TripInput) => {
      const result = await upsertTrips([input]);
      return { trip: result.saved[0], duplicate: result.duplicates[0], persisted: result.persisted };
    },
    [upsertTrips],
  );

  const replaceArchive = useCallback(
    (next: Archive) => commit(() => next),
    [commit],
  );

  const removeTrip = useCallback(
    (id: string) => commit((current) => removeTripOp(current, id)),
    [commit],
  );

  const addCustomStation = useCallback(
    (name: string): Station => {
      let resolved: Station | undefined;
      void commit((current) => {
        const result = ensureArchiveStation(current, name);
        resolved = result.station;
        return result.archive;
      });
      return resolved as Station;
    },
    [commit],
  );

  return {
    archive,
    stations,
    ready,
    error,
    notice,
    dismissNotice: () => setNotice(null),
    upsertTrip,
    upsertTrips,
    removeTrip,
    replaceArchive,
    addCustomStation,
  };
}

export type ArchiveState = ReturnType<typeof useArchive>;
