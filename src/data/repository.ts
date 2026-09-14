import { Channel, invoke } from "@tauri-apps/api/core";
import { ArchiveParseError, emptyArchive, parseArchiveText } from "./archiveSchema";
import type { Archive, OcrItem } from "../domain/types";

const STORAGE_KEY = "rail-folio-archive";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export type LoadResult = {
  archive: Archive;
  /** 原档案损坏时：已把原文件移走备份，当前从空档案开始。 */
  recovered?: { backupPath: string; reason: string };
};

async function backupCorruptArchive(raw: string | null): Promise<string> {
  if (isTauri()) {
    return invoke<string>("backup_archive");
  }
  const key = `${STORAGE_KEY}.corrupt-${Date.now()}`;
  if (raw != null) localStorage.setItem(key, raw);
  localStorage.removeItem(STORAGE_KEY);
  return key;
}

/**
 * 读取本地档案。IO 错误直接抛出（调用方应据此禁止写入）；
 * 内容损坏则先备份原文件，再返回空档案，避免后续写入覆盖掉用户数据。
 */
export async function loadArchive(): Promise<LoadResult> {
  const raw = isTauri()
    ? await invoke<string>("load_archive")
    : localStorage.getItem(STORAGE_KEY);
  try {
    return { archive: parseArchiveText(raw) };
  } catch (err) {
    if (!(err instanceof ArchiveParseError)) throw err;
    const backupPath = await backupCorruptArchive(raw);
    return { archive: emptyArchive(), recovered: { backupPath, reason: err.message } };
  }
}

export async function saveArchive(archive: Archive): Promise<void> {
  const raw = JSON.stringify(archive, null, 2);
  if (isTauri()) {
    await invoke("save_archive", { json: raw });
    return;
  }
  localStorage.setItem(STORAGE_KEY, raw);
}

/** 逐张识别，每张完成后回调一次；识别在 Rust 侧并行进行，回调顺序不保证。 */
export async function ocrImages(
  paths: string[],
  onItem: (item: OcrItem) => void,
): Promise<void> {
  if (!isTauri()) {
    for (const path of paths) {
      onItem({ path, text: "", error: "OCR 需要在桌面应用中运行（npm run tauri dev）" });
    }
    return;
  }
  const channel = new Channel<OcrItem>();
  channel.onmessage = onItem;
  await invoke("ocr_images", { paths, onItem: channel });
}

export async function listImages(dir: string): Promise<string[]> {
  if (!isTauri()) return [];
  return invoke<string[]>("list_images", { dir });
}

/** 打开 12306 登录窗口并读取订单原始票面 JSON；需用户在窗口内自行登录。 */
export async function sync12306Orders(onStatus: (text: string) => void): Promise<unknown[]> {
  if (!isTauri()) {
    throw new Error("从 12306 同步需要桌面应用（npm run tauri dev）");
  }
  const channel = new Channel<string>();
  channel.onmessage = onStatus;
  const tickets = await invoke<unknown>("sync_12306_orders", { onStatus: channel });
  return Array.isArray(tickets) ? tickets : [];
}

export async function writeTextFile(path: string, contents: string): Promise<void> {
  if (isTauri()) {
    await invoke("write_text_file", { path, contents });
    return;
  }
  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = path.split("/").pop() ?? "rail-folio.json";
  link.click();
  URL.revokeObjectURL(url);
}

export async function writeBinaryFile(path: string, data: Uint8Array): Promise<void> {
  await invoke("write_binary_file", { path, contents: Array.from(data) });
}

export async function readTextFile(path: string): Promise<string> {
  if (isTauri()) {
    return invoke<string>("read_text_file", { path });
  }
  throw new Error("浏览器模式请使用文件选择器导入");
}

export { isTauri };
