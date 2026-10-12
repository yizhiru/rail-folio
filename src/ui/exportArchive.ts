import { save } from "@tauri-apps/plugin-dialog";
import { exportArchiveCsv } from "../data/tripsCsv";
import { isTauri, writeTextFile } from "../data/repository";
import type { Archive } from "../domain/types";

const FILE_NAME = "rail-folio.csv";

/** 把行程导出成 CSV 表格（车站写站名，不带内部 id）。用户取消保存对话框时返回 null。 */
export async function exportArchive(archive: Archive): Promise<string | null> {
  const csv = exportArchiveCsv(archive);
  if (!isTauri()) {
    await writeTextFile(FILE_NAME, csv);
    return "已下载行程表";
  }
  const path = await save({
    defaultPath: FILE_NAME,
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  if (!path) return null;
  await writeTextFile(path, csv);
  return `已导出到 ${path}`;
}
