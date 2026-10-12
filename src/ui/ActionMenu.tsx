import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { IconMore } from "./navIcons";

export type ActionMenuItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  onSelect: () => void;
};

type Props = {
  items: ActionMenuItem[];
  /** 触发按钮的无障碍名称与悬停提示。 */
  label?: string;
  /** 有操作正在进行时，触发按钮轻微闪动，菜单收起后仍能看出在忙。 */
  busy?: boolean;
};

/** 「…」按钮 + 向下弹出的操作菜单。点外面、按 Esc、选中菜单项都会收起。 */
export function ActionMenu({ items, label = "更多操作", busy = false }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
  }, [open]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!open) return;
    if (event.key === "Escape") {
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const nodes = Array.from(
      rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [],
    );
    if (nodes.length === 0) return;
    const at = nodes.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    nodes[(at + step + nodes.length) % nodes.length].focus();
  }

  return (
    <div className="action-menu" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className={`map-chip icon${busy ? " busy" : ""}`}
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-busy={busy}
        onClick={() => setOpen((value) => !value)}
      >
        <IconMore />
      </button>
      {open ? (
        <div className="menu-pop" id={menuId} role="menu">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                triggerRef.current?.focus();
                item.onSelect();
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
