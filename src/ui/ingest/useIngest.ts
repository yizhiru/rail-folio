import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri, listImages, ocrImages, sync12306Orders } from "../../data/repository";
import { findDuplicate, tripFingerprint } from "../../domain/fingerprint";
import { annotateDuplicateDraft, tripNeedsFill } from "../../domain/tripFill";
import type {
  OcrItem,
  Station,
  Trip,
  TripDraft,
  TripInput,
  TripSource,
} from "../../domain/types";
import { draftsFrom12306 } from "../../ingest/from12306";
import { parseTicketText } from "../../ingest/parseTicket";

const IMAGE_EXT = /\.(png|jpe?g|webp|heic|heif|tiff?|bmp)$/i;
const MAX_BATCH = 200;
const DESKTOP_ONLY = "识别图片请用桌面应用启动：npm run tauri dev";

export type IngestOptions = {
  trips: Trip[];
  stations: Station[];
  /** 返回是否成功落盘。 */
  onCommit: (rows: TripInput[]) => Promise<boolean>;
  onEnsureStation: (name: string) => Station;
  /** 有图片被拖进窗口并开始识别时触发，App 用它切到导入页。 */
  onDropStarted?: () => void;
};

export type DraftPatch = Partial<Pick<TripDraft["parsed"], "date" | "trainNo" | "fromName" | "toName" | "departureTime" | "arrivalTime" | "seatClass" | "ticketPrice" | "notes">> & {
  selected?: boolean;
};

/**
 * 导入页的全部状态与动作。挂在 App 层而不是页面组件里，
 * 这样切换页签不会丢掉已识别的草稿，识别过程也不会因页面卸载而中断。
 */
export function useIngest(options: IngestOptions) {
  const { trips, stations, onCommit, onEnsureStation, onDropStarted } = options;
  const [source, setSource] = useState<TripSource>("ocr");
  const [drafts, setDrafts] = useState<TripDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const tripsRef = useRef(trips);
  const stationsRef = useRef(stations);
  const sourceRef = useRef(source);
  const draftsRef = useRef(drafts);
  const busyRef = useRef(busy);
  tripsRef.current = trips;
  stationsRef.current = stations;
  sourceRef.current = source;
  draftsRef.current = drafts;
  busyRef.current = busy;

  const toDraft = useCallback((item: OcrItem): TripDraft => {
    const currentSource = sourceRef.current;
    if (item.error) {
      return {
        id: crypto.randomUUID(),
        imagePath: item.path,
        rawText: item.error,
        confidence: 0,
        parsed: { source: currentSource },
        needsReview: true,
        selected: false,
      };
    }
    const draft = parseTicketText(item.text, stationsRef.current, currentSource, item.path);
    return annotateDuplicateDraft(draft, tripsRef.current);
  }, []);

  const recognizePaths = useCallback(
    async (input: string[]) => {
      if (!isTauri()) {
        setMessage(DESKTOP_ONLY);
        return;
      }
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setMessage("正在扫描文件…");
      try {
        const expanded: string[] = [];
        for (const path of input) {
          if (IMAGE_EXT.test(path)) {
            expanded.push(path);
          } else {
            expanded.push(...(await listImages(path)));
          }
        }
        const known = new Set(
          draftsRef.current.map((draft) => draft.imagePath).filter(Boolean),
        );
        const unique = [...new Set(expanded)].filter((path) => !known.has(path));
        if (unique.length === 0) {
          setMessage(
            expanded.length > 0 ? "这些图片已经在列表里了" : "没有找到图片（png / jpg / webp / heic）",
          );
          return;
        }
        const capped = unique.slice(0, MAX_BATCH);
        let done = 0;
        setMessage(`正在识别 0 / ${capped.length}`);
        await ocrImages(capped, (item) => {
          done += 1;
          setMessage(`正在识别 ${done} / ${capped.length}`);
          const draft = toDraft(item);
          setDrafts((current) => [...current, draft]);
        });
        setMessage(
          unique.length > MAX_BATCH
            ? `已加入 ${capped.length} 张（单次最多 ${MAX_BATCH} 张，其余请再拖一次）`
            : `已加入 ${capped.length} 张，请核对后入库`,
        );
      } catch (err) {
        setMessage(err instanceof Error ? err.message : String(err));
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [toDraft],
  );

  const pickImages = useCallback(async () => {
    setMessage(null);
    if (!isTauri()) {
      setMessage(DESKTOP_ONLY);
      return;
    }
    const selected = await open({
      multiple: true,
      title:
        sourceRef.current === "12306-screenshot"
          ? "选择 12306 订单截图（可多选）"
          : "选择火车票图片（可多选）",
      filters: [
        { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "heic", "tif", "tiff"] },
      ],
    });
    if (!selected) return;
    await recognizePaths(Array.isArray(selected) ? selected : [selected]);
  }, [recognizePaths]);

  const pickFolder = useCallback(async () => {
    setMessage(null);
    if (!isTauri()) {
      setMessage(DESKTOP_ONLY);
      return;
    }
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择存放车票图片的文件夹",
    });
    if (!selected || Array.isArray(selected)) return;
    await recognizePaths([selected]);
  }, [recognizePaths]);

  // 只注册一次拖放监听；busy 用 ref 判断，避免依赖变化导致反复注册和 unlisten 丢失。
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type !== "drop" || busyRef.current) return;
        onDropStarted?.();
        void recognizePaths(event.payload.paths);
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [recognizePaths, onDropStarted]);

  const updateDraft = useCallback((id: string, patch: DraftPatch) => {
    setDrafts((current) =>
      current.map((draft) => {
        if (draft.id !== id) return draft;
        const { selected, ...parsedPatch } = patch;
        const hasParsed = Object.keys(parsedPatch).length > 0;
        return {
          ...draft,
          selected: selected ?? draft.selected,
          parsed: hasParsed ? { ...draft.parsed, ...parsedPatch } : draft.parsed,
          needsReview: hasParsed ? false : draft.needsReview,
        };
      }),
    );
  }, []);

  const removeDraft = useCallback((id: string) => {
    setDrafts((current) => current.filter((draft) => draft.id !== id));
  }, []);

  const clearDrafts = useCallback(() => {
    setDrafts([]);
    setMessage(null);
  }, []);

  const syncFrom12306 = useCallback(async () => {
    setMessage(null);
    if (!isTauri()) {
      setMessage(DESKTOP_ONLY);
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage("正在打开 12306…");
    try {
      const tickets = await sync12306Orders((text) => setMessage(text));
      const { drafts: incoming, skippedExisting } = draftsFrom12306(
        tickets,
        stationsRef.current,
        tripsRef.current,
      );
      const known = new Set(
        draftsRef.current
          .map((draft) => {
            const { date, trainNo, fromStationId, toStationId } = draft.parsed;
            if (!date || !trainNo || !fromStationId || !toStationId) return undefined;
            return tripFingerprint(date, trainNo, fromStationId, toStationId);
          })
          .filter((item): item is string => Boolean(item)),
      );
      const added = incoming.filter((draft) => {
        const { date, trainNo, fromStationId, toStationId } = draft.parsed;
        if (!date || !trainNo || !fromStationId || !toStationId) return true;
        const key = tripFingerprint(date, trainNo, fromStationId, toStationId);
        if (known.has(key)) return false;
        known.add(key);
        return true;
      });
      const skippedDrafts = incoming.length - added.length;
      const skipped = skippedExisting + skippedDrafts;
      if (added.length === 0) {
        if (skipped > 0) {
          setMessage(`没有可补充的行程，已跳过 ${skipped} 条（档案或当前列表中已有）`);
        } else {
          setMessage(tickets.length > 0 ? "读到了车票，但没有可入库的有效行程（可能都已退改）" : "没有读到订单");
        }
        return;
      }
      setDrafts((current) => [...added, ...current]);
      setMessage(
        skipped > 0
          ? `已加入 ${added.length} 条待核对，跳过 ${skipped} 条已有记录`
          : `已加入 ${added.length} 条，请核对后入库`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const commit = useCallback(async () => {
    const chosen = draftsRef.current.filter((draft) => draft.selected);
    if (chosen.length === 0) {
      setMessage("请先勾选要入库的记录");
      return;
    }
    const committedIds = new Set<string>();
    const payload: TripInput[] = [];
    for (const draft of chosen) {
      const fromName = draft.parsed.fromName?.trim();
      const toName = draft.parsed.toName?.trim();
      const { date, trainNo } = draft.parsed;
      if (!date || !trainNo || !fromName || !toName) continue;
      const from = onEnsureStation(fromName);
      const to = onEnsureStation(toName);
      const fingerprint = tripFingerprint(date, trainNo, from.id, to.id);
      const dup = findDuplicate({ fingerprint }, tripsRef.current);
      if (dup && !tripNeedsFill(dup, draft.parsed)) {
        committedIds.add(draft.id);
        continue;
      }
      committedIds.add(draft.id);
      payload.push({
        date,
        trainNo,
        fromStationId: from.id,
        toStationId: to.id,
        departureTime: draft.parsed.departureTime,
        arrivalTime: draft.parsed.arrivalTime,
        seatClass: draft.parsed.seatClass,
        ticketPrice: draft.parsed.ticketPrice,
        notes: draft.parsed.notes,
        source: draft.parsed.source ?? sourceRef.current,
      });
    }
    if (payload.length === 0) {
      if (committedIds.size > 0) {
        setDrafts((current) => current.filter((draft) => !committedIds.has(draft.id)));
        setMessage("勾选的记录都已在档案中，没有可补充的信息");
        return;
      }
      setMessage("勾选的记录缺少日期 / 车次 / 车站，请先补全");
      return;
    }
    const persisted = await onCommit(payload);
    if (!persisted) {
      setMessage("写入档案失败，记录仍保留在列表里");
      return;
    }
    setDrafts((current) => current.filter((draft) => !committedIds.has(draft.id)));
    const skippedDup = committedIds.size - payload.length;
    const skippedIncomplete = chosen.length - committedIds.size;
    const extras = [
      skippedDup > 0 ? `${skippedDup} 条已在档案中` : "",
      skippedIncomplete > 0 ? `${skippedIncomplete} 条信息不完整未入库` : "",
    ].filter(Boolean);
    setMessage(
      extras.length > 0
        ? `已写入 ${payload.length} 条，另有 ${extras.join("，")}`
        : `已写入 ${payload.length} 条`,
    );
  }, [onCommit, onEnsureStation]);

  return {
    source,
    setSource,
    drafts,
    busy,
    message,
    recognizePaths,
    pickImages,
    pickFolder,
    syncFrom12306,
    updateDraft,
    removeDraft,
    clearDrafts,
    commit,
  };
}

export type IngestState = ReturnType<typeof useIngest>;
