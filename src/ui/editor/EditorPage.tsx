import { save } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { isTauri, writeTextFile } from "../../data/repository";
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
  const [message, setMessage] = useState<string | null>(null);

  async function exportJson() {
    const json = JSON.stringify(archive, null, 2);
    if (!isTauri()) {
      await writeTextFile("rail-folio.json", json);
      setMessage("已下载备份");
      return;
    }
    const path = await save({
      defaultPath: "rail-folio.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path) return;
    try {
      await writeTextFile(path, json);
      setMessage(`已导出到 ${path}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

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

      <div className="card toolbar">
        <button className="btn secondary" type="button" onClick={() => void exportJson()}>
          导出
        </button>
      </div>
      {message ? <div className="notice">{message}</div> : null}
    </section>
  );
}
