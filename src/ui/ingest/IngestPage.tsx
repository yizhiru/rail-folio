import { convertFileSrc } from "@tauri-apps/api/core";
import { useState } from "react";
import { isTauri } from "../../data/repository";
import { parseTicketPrice } from "../../domain/price";
import type { TripSource } from "../../domain/types";
import { ImageViewer } from "./ImageViewer";
import type { IngestState } from "./useIngest";

type Props = {
  ingest: IngestState;
};

export function IngestPage({ ingest }: Props) {
  const {
    source,
    setSource,
    drafts,
    busy,
    message,
    pickImages,
    pickFolder,
    syncFrom12306,
    updateDraft,
    removeDraft,
    clearDrafts,
    commit,
  } = ingest;
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const selectedCount = drafts.filter((draft) => draft.selected).length;

  return (
    <section className="page">
      <div className="card">
        <div className="toolbar">
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as TripSource)}
            disabled={busy}
          >
            <option value="ocr">火车票图片</option>
            <option value="12306-screenshot">12306 订单截图</option>
          </select>
          <button className="btn" type="button" onClick={() => void pickImages()} disabled={busy}>
            {busy ? "识别中…" : "选择图片"}
          </button>
          <button className="btn secondary" type="button" onClick={() => void pickFolder()} disabled={busy}>
            选择文件夹
          </button>
          <button className="btn" type="button" onClick={() => void syncFrom12306()} disabled={busy}>
            从 12306 同步
          </button>
          {drafts.length > 0 ? (
            <button
              className="btn secondary"
              type="button"
              onClick={() => void commit()}
              disabled={busy || selectedCount === 0}
            >
              确认入库{selectedCount > 0 ? `（${selectedCount}）` : ""}
            </button>
          ) : null}
          {drafts.length > 0 ? (
            <button className="btn danger" type="button" onClick={clearDrafts} disabled={busy}>
              清空列表
            </button>
          ) : null}
        </div>
        {message ? <p className="notice" style={{ marginTop: 12 }}>{message}</p> : null}
      </div>

      {drafts.length === 0 ? (
        <div className="dropzone muted">将图片拖到此处</div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th />
                <th>预览</th>
                <th>日期</th>
                <th>车次</th>
                <th>出发站</th>
                <th>到达站</th>
                <th>出发时刻</th>
                <th>到达时刻</th>
                <th>票价</th>
                <th>识别文本</th>
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
                      onChange={(e) => updateDraft(draft.id, { selected: e.target.checked })}
                    />
                  </td>
                  <td>
                    {draft.imagePath && isTauri() ? (
                      <button
                        type="button"
                        className="preview-btn"
                        title="查看原图"
                        onClick={() => {
                          if (!draft.imagePath) return;
                          setViewerSrc(convertFileSrc(draft.imagePath));
                        }}
                      >
                        <img className="preview" src={convertFileSrc(draft.imagePath)} alt="票面预览" loading="lazy" />
                      </button>
                    ) : (
                      <span className="muted">无图</span>
                    )}
                    {draft.duplicateOf ? (
                      <div className="muted">{draft.needsReview ? "可能重复" : "可补充"}</div>
                    ) : null}
                    {draft.needsReview && !draft.duplicateOf ? <div className="muted">待核对</div> : null}
                  </td>
                  <td>
                    <input
                      value={draft.parsed.date ?? ""}
                      onChange={(e) => updateDraft(draft.id, { date: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      value={draft.parsed.trainNo ?? ""}
                      onChange={(e) => updateDraft(draft.id, { trainNo: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      list="station-list"
                      value={draft.parsed.fromName ?? ""}
                      onChange={(e) => updateDraft(draft.id, { fromName: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      list="station-list"
                      value={draft.parsed.toName ?? ""}
                      onChange={(e) => updateDraft(draft.id, { toName: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="time-input"
                      placeholder="HH:mm"
                      value={draft.parsed.departureTime ?? ""}
                      onChange={(e) => updateDraft(draft.id, { departureTime: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="time-input"
                      placeholder="HH:mm"
                      value={draft.parsed.arrivalTime ?? ""}
                      onChange={(e) => updateDraft(draft.id, { arrivalTime: e.target.value })}
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
                        updateDraft(draft.id, { ticketPrice: parseTicketPrice(e.target.value) })
                      }
                    />
                  </td>
                  <td>
                    <div className="muted" style={{ maxWidth: 280, whiteSpace: "pre-wrap" }}>
                      {draft.rawText.slice(0, 180)}
                    </div>
                  </td>
                  <td>
                    <button className="btn danger" type="button" onClick={() => removeDraft(draft.id)}>
                      移除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {viewerSrc ? <ImageViewer src={viewerSrc} onClose={() => setViewerSrc(null)} /> : null}
    </section>
  );
}
