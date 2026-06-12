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
                ...(it.destructive ? { color: "#BA1A1A" } : {}),
                ...(it.disabled ? { color: "#88736a", cursor: "not-allowed" } : {}),
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
  color: "#88736a",
  borderRadius: 12,
  lineHeight: 1,
  padding: 0,
};
const menuPanel: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  minWidth: 160,
  background: "#fff",
  border: "1px solid #dbc1b7",
  borderRadius: 8,
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  padding: 4,
  zIndex: 50,
  display: "flex",
  flexDirection: "column",
};
const menuItem: React.CSSProperties = {
  padding: "8px 12px",
  border: "none",
  background: "transparent",
  cursor: "pointer",
  textAlign: "start",
  fontFamily: "inherit",
  fontSize: 14,
  color: "inherit",
  borderRadius: 4,
};
