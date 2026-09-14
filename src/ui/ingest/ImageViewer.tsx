import { useEffect, useRef, useState } from "react";
import { PageHelp } from "../PageHelp";

type Props = {
  src: string;
  onClose: () => void;
};

const MIN_SCALE = 0.5;
const MAX_SCALE = 8;

export function ImageViewer({ src, onClose }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "+" || event.key === "=") {
        setScale((value) => Math.min(MAX_SCALE, value * 1.2));
      }
      if (event.key === "-" || event.key === "_") {
        setScale((value) => Math.max(MIN_SCALE, value / 1.2));
      }
      if (event.key === "0") {
        setScale(1);
        setOffset({ x: 0, y: 0 });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      setScale((value) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value * factor)));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, []);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    setOffset({
      x: drag.current.ox + (event.clientX - drag.current.x),
      y: drag.current.oy + (event.clientY - drag.current.y),
    });
  }

  function onPointerUp() {
    drag.current = null;
  }

  return (
    <div className="viewer-backdrop" onClick={onClose} role="presentation">
      <div
        className="viewer-panel"
        role="dialog"
        aria-modal="true"
        aria-label="票面原图"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="viewer-toolbar">
          <button className="btn secondary" type="button" onClick={() => setScale((v) => Math.max(MIN_SCALE, v / 1.25))}>
            缩小
          </button>
          <button className="btn secondary" type="button" onClick={() => setScale((v) => Math.min(MAX_SCALE, v * 1.25))}>
            放大
          </button>
          <button
            className="btn secondary"
            type="button"
            onClick={() => {
              setScale(1);
              setOffset({ x: 0, y: 0 });
            }}
          >
            适应窗口
          </button>
          <span className="muted">{Math.round(scale * 100)}%</span>
          <PageHelp text="滚轮缩放，拖动查看细节，Esc 关闭。" />
          <button className="btn" type="button" onClick={onClose}>
            关闭
          </button>
        </div>
        <div
          ref={stageRef}
          className="viewer-stage"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <img
            src={src}
            alt="票面原图"
            draggable={false}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
