import { useEffect, useRef, useState } from "react";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

/** Tiny dropdown menu. Click the trigger to open; click outside to close. */
export function Menu({
  items,
  trigger = "⋯",
  align = "end",
}: {
  items: MenuItem[];
  trigger?: string;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div style={{ position: "relative", display: "inline-block" }} ref={ref}>
      <button
        style={triggerBtn}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {trigger}
      </button>
      {open && (
        <div style={{ ...menuPanel, [align === "end" ? "insetInlineEnd" : "insetInlineStart"]: 0 }}>
          {items.map((it, i) => (
            <button
              key={i}
              disabled={it.disabled}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                it.onSelect();
              }}
              style={{
                ...menuItem,
                ...(it.destructive ? { color: "var(--error)" } : {}),
                ...(it.disabled ? { color: "var(--outline)", cursor: "not-allowed" } : {}),
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const triggerBtn: React.CSSProperties = {
  width: 24,
  height: 24,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  fontSize: 18,
  color: "var(--outline)",
  borderRadius: 6,
  lineHeight: 1,
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};
const menuPanel: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 4px)",
  minWidth: 160,
  background: "var(--surface)",
  color: "var(--on-surface)",
  border: "1px solid var(--outline-variant)",
  borderRadius: 8,
  boxShadow: "var(--shadow-popover)",
  padding: 4,
  zIndex: 50,
  display: "flex",
  flexDirection: "column",
};
const menuItem: React.CSSProperties = {
  padding: "7px 10px",
  border: "none",
  background: "transparent",
  cursor: "pointer",
  textAlign: "start",
  fontFamily: "inherit",
  fontSize: 13,
  color: "inherit",
  borderRadius: 4,
};
