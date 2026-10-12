import type { Archive, Station, TripInput } from "../../domain/types";
import { formValuesToTripInput, TripForm } from "../trips/TripForm";
import { SmartImport } from "./SmartImport";

type Props = {
  archive: Archive;
  stations: Station[];
  /** 返回是否成功落盘。 */
  onSave: (input: TripInput) => Promise<boolean>;
  onSaveMany: (rows: TripInput[]) => Promise<boolean>;
  onEnsureStation: (name: string) => Station;
};

export function EditorPage({ archive, stations, onSave, onSaveMany, onEnsureStation }: Props) {
  return (
    <section className="page">
      <TripForm
        mode="create"
        onSubmit={(values) =>
          onSave(formValuesToTripInput(values, onEnsureStation, { source: "manual" }))
        }
      />

      <SmartImport
        stations={stations}
        trips={archive.trips}
        onEnsureStation={onEnsureStation}
        onImport={onSaveMany}
      />
    </section>
  );
}
