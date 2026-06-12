import { useEffect, useState } from "react";

type Variant = "info" | "success" | "error";

interface ToastItem {
  id: number;
  message: string;
  variant: Variant;
}

let nextId = 1;
const listeners = new Set<(items: ToastItem[]) => void>();
let queue: ToastItem[] = [];

function emit() {
  for (const fn of listeners) fn(queue);
}

/** Module-level API. Call from anywhere — no provider needed. */
export function toast(message: string, variant: Variant = "info", durationMs = 3500) {
  const item: ToastItem = { id: nextId++, message, variant };
  queue = [...queue, item];
  emit();
  setTimeout(() => {
    queue = queue.filter((t) => t.id !== item.id);
    emit();
  }, durationMs);
}

toast.error = (msg: string) => toast(msg, "error", 5000);
toast.success = (msg: string) => toast(msg, "success");

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const fn = (next: ToastItem[]) => setItems(next);
    listeners.add(fn);
    fn(queue);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return (
    <div style={host} dir="rtl">
      {items.map((t) => (
        <div key={t.id} style={{ ...toastBase, ...variantStyle[t.variant] }}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

const host: React.CSSProperties = {
  position: "fixed",
  bottom: 16,
  insetInlineEnd: 16,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  zIndex: 1000,
  pointerEvents: "none",
};
const toastBase: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
  fontFamily: "'Heebo','Inter',system-ui,sans-serif",
  fontSize: 14,
  maxWidth: 360,
  pointerEvents: "auto",
};
const variantStyle: Record<Variant, React.CSSProperties> = {
  info: { background: "#231a11", color: "#fff" },
  success: { background: "#4c653e", color: "#fff" },
  error: { background: "#BA1A1A", color: "#fff" },
};
