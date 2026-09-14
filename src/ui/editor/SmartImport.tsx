import { useState } from "react";
import { parseTicketPrice } from "../../domain/price";
import type { Station, Trip, TripDraft, TripInput } from "../../domain/types";
import { draftsFromSmartText, tripInputsFromDrafts } from "../../ingest/fromSmartText";
import { STATION_DATALIST_ID } from "../StationDatalist";

const PLACEHOLDER = `每行一条，站名用中文即可，例如：
2024-05-01 G1 上海虹桥 北京南 08:00 12:30
G80 广州南-武汉 2024年8月18日 15:00-18:58 商务座
D2282 杭州东 厦门北 2024-05-02 09:00 14:20`;

type DraftPatch = Partial<
  Pick<
    TripDraft["parsed"],
    "date" | "trainNo" | "fromName" | "toName" | "departureTime" | "arrivalTime" | "seatClass" | "ticketPrice"
  >
> & { selected?: boolean };

type Props = {
  stations: Station[];
  trips: Trip[];
  onEnsureStation: (name: string) => Station;
  onImport: (rows: TripInput[]) => Promise<boolean>;
};

export function SmartImport({ stations, trips, onEnsureStation, onImport }: Props) {
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<TripDraft[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const selectedCount = drafts.filter((draft) => draft.selected).length;
  const allSelected = drafts.length > 0 && selectedCount === drafts.length;

  function patchDraft(id: string, patch: DraftPatch) {
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
  }

  function setAllSelected(selected: boolean) {
    setDrafts((current) => current.map((draft) => ({ ...draft, selected })));
  }

  function parseText(raw: string) {
    const incoming = draftsFromSmartText(raw, stations, trips);
    setDrafts(incoming);
    if (incoming.length === 0) {
      setMessage("没有解析出行程。每行写：日期 车次 出发站 到达站 出发时刻 到达时刻");
    } else {
      const ready = incoming.filter((draft) => draft.selected).length;
      const review = incoming.length - ready;
      setMessage(
        review > 0
          ? `解析出 ${incoming.length} 条，其中 ${review} 条需补全或可能重复`
          : `解析出 ${incoming.length} 条，核对后即可导入`,
      );
    }
  }

  async function importSelected() {
    const { inputs, importedIds, skippedDup, skippedIncomplete } = tripInputsFromDrafts(
      drafts,
      onEnsureStation,
      trips,
    );
    if (inputs.length === 0) {
      const extras = [
        skippedDup > 0 ? `${skippedDup} 条已在档案中` : "",
        skippedIncomplete > 0 ? `${skippedIncomplete} 条缺少日期 / 车次 / 车站` : "",
      ].filter(Boolean);
      setMessage(extras.length > 0 ? extras.join("，") : "请先勾选要导入的记录");
      return;
    }
    setSaving(true);
    try {
      const ok = await onImport(inputs);
      if (!ok) {
        setMessage("导入失败，请查看顶部错误提示");
        return;
      }
      const imported = new Set(importedIds);
      const remaining = drafts.filter((draft) => !imported.has(draft.id));
      setDrafts(remaining);
      if (remaining.length === 0) setText("");
      const extras = [
        skippedDup > 0 ? `跳过重复 ${skippedDup} 条` : "",
        skippedIncomplete > 0 ? `未补全 ${skippedIncomplete} 条` : "",
      ].filter(Boolean);
      setMessage(
        extras.length > 0
          ? `已导入 ${inputs.length} 条，${extras.join("，")}`
          : `已导入 ${inputs.length} 条`,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card stack">
      <div>
        <strong>智能导入</strong>
      </div>
      <label>
        行程文本
        <textarea
          className="smart-import-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={6}
        />
      </label>
      <div className="toolbar">
        <button
          className="btn secondary"
          type="button"
          disabled={!text.trim() || saving}
          onClick={() => parseText(text)}
        >
          解析预览
        </button>
        {drafts.length > 0 ? (
          <button
            className="btn"
            type="button"
            disabled={saving || selectedCount === 0}
            onClick={() => void importSelected()}
          >
            {saving ? "导入中…" : selectedCount > 0 ? `导入（${selectedCount}）` : "导入"}
          </button>
        ) : null}
        {drafts.length > 0 ? (
          <button
            className="btn danger"
            type="button"
            onClick={() => {
              setDrafts([]);
              setMessage(null);
            }}
            disabled={saving}
          >
            清空预览
          </button>
        ) : null}
      </div>
      {message ? <div className="notice">{message}</div> : null}
      {drafts.length > 0 ? (
        <div className="notice smart-import-hint">
          <span>请先勾选要导入的记录</span>
          <button
            className="btn secondary"
            type="button"
            disabled={saving}
            onClick={() => setAllSelected(!allSelected)}
          >
            {allSelected ? "取消全选" : "全部选中"}
          </button>
        </div>
      ) : null}
      {drafts.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    title={allSelected ? "取消全选" : "全部选中"}
                    onChange={(e) => setAllSelected(e.target.checked)}
                  />
                </th>
                <th>日期</th>
                <th>车次</th>
                <th>出发站</th>
                <th>到达站</th>
                <th>出发</th>
                <th>到达</th>
                <th>席别</th>
                <th>票价</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {drafts.map((draft) => (
                <tr key={draft.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={draft.selected}
                      onChange={(e) => patchDraft(draft.id, { selected: e.target.checked })}
                    />
                    {draft.duplicateOf ? (
                      <div className="muted">{draft.needsReview ? "已有" : "可补充"}</div>
                    ) : null}
                    {draft.needsReview && !draft.duplicateOf ? <div className="muted">待补</div> : null}
                  </td>
                  <td>
                    <input
                      type="date"
                      value={draft.parsed.date ?? ""}
                      onChange={(e) => patchDraft(draft.id, { date: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      value={draft.parsed.trainNo ?? ""}
                      onChange={(e) => patchDraft(draft.id, { trainNo: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      list={STATION_DATALIST_ID}
                      value={draft.parsed.fromName ?? ""}
                      onChange={(e) => patchDraft(draft.id, { fromName: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      list={STATION_DATALIST_ID}
                      value={draft.parsed.toName ?? ""}
                      onChange={(e) => patchDraft(draft.id, { toName: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="time-input"
                      placeholder="08:00"
                      value={draft.parsed.departureTime ?? ""}
                      onChange={(e) => patchDraft(draft.id, { departureTime: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="time-input"
                      placeholder="12:00"
                      value={draft.parsed.arrivalTime ?? ""}
                      onChange={(e) => patchDraft(draft.id, { arrivalTime: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      value={draft.parsed.seatClass ?? ""}
                      onChange={(e) => patchDraft(draft.id, { seatClass: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="time-input"
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="元"
                      value={draft.parsed.ticketPrice ?? ""}
                      onChange={(e) =>
                        patchDraft(draft.id, { ticketPrice: parseTicketPrice(e.target.value) })
                      }
                    />
                  </td>
                  <td>
                    <button
                      className="btn danger"
                      type="button"
                      onClick={() => setDrafts((current) => current.filter((item) => item.id !== draft.id))}
                    >
                      移除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
