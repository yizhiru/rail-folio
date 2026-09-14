type Props = {
  imageUrl: string;
  busy: boolean;
  error: string | null;
  notice: string | null;
  onCopy: () => void;
  onSave: () => void;
  onClose: () => void;
};

export function ShareCardDialog({ imageUrl, busy, error, notice, onCopy, onSave, onClose }: Props) {
  return (
    <div className="viewer-backdrop" role="dialog" aria-label="分享图片" onClick={onClose}>
      <div className="share-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="viewer-toolbar">
          <strong>分享图片</strong>
          <span style={{ flex: 1 }} />
          <button className="btn secondary" type="button" onClick={onCopy} disabled={busy}>
            复制图片
          </button>
          <button className="btn" type="button" onClick={onSave} disabled={busy}>
            保存图片
          </button>
          <button className="btn secondary" type="button" onClick={onClose}>
            关闭
          </button>
        </div>
        {error ? <div className="notice">{error}</div> : null}
        {notice ? <div className="notice">{notice}</div> : null}
        <div className="share-preview">
          <img src={imageUrl} alt="火车记足迹分享图" />
        </div>
      </div>
    </div>
  );
}
