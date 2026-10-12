import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { allStations } from "../assets/stations";
import {
  removeTrip as removeTripOp,
  upsertTrips as upsertTripsOp,
} from "../data/archiveOps";
import { ArchiveWriter } from "../data/archiveWriter";
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
  const writerRef = useRef<ArchiveWriter | null>(null);
  writerRef.current ??= new ArchiveWriter(saveArchive, setArchive);
  const writer = writerRef.current;
  const stations = useMemo(() => allStations(archive), [archive.customStations]);

  const commit = useCallback(async (recipe: (current: Archive) => Archive): Promise<boolean> => {
    try {
      await writer.commit(recipe);
      setError(null);
      return true;
    } catch (err) {
      setError(describe(err));
      return false;
    }
  }, [writer]);

  useEffect(() => {
    let cancelled = false;
    loadArchive()
      .then((result) => {
        if (cancelled) return;
        writer.initialize(result.archive);
        if (result.notice) setNotice(result.notice);
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
  }, [writer]);

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
      return writer.ensureStation(name);
    },
    [writer],
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
