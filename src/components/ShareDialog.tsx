import { useEffect, useState } from "react";
import { t } from "../theme";
import { createShareLink, shareByEmail } from "../repositories/shareRepository";
import { RESOURCE_TYPE_BOARD, ROLE_EDITOR, ROLE_VIEWER, type ResourceType } from "../types";
import { toast } from "./Toast";

const SHARE_EMAIL_HISTORY_KEY = "slate.share.emailHistory";
const SHARE_EMAIL_HISTORY_CAP = 20;

function loadEmailHistory(): string[] {
  try {
    const raw = localStorage.getItem(SHARE_EMAIL_HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Push `email` to the front, dedupe case-insensitively, cap at 20. Mirrors
 *  mobile §29 share-email MRU. Local-only; never written to Firestore. */
function recordEmailHistory(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;
  const current = loadEmailHistory();
  const filtered = current.filter((e) => e.toLowerCase() !== normalized);
  const next = [email.trim(), ...filtered].slice(0, SHARE_EMAIL_HISTORY_CAP);
  try {
    localStorage.setItem(SHARE_EMAIL_HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* localStorage full / disabled — ignore */
  }
}

export function ShareDialog({
  resourceType,
  resourceId,
  resourceName,
  uid,
  onClose,
}: {
  resourceType: ResourceType;
  resourceId: string;
  resourceName: string;
  uid: string;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>(ROLE_EDITOR);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => setHistory(loadEmailHistory()), []);

  async function invite() {
    if (!email.trim()) return;
    setBusy(true);
    try {
      const res = await shareByEmail(
        resourceType,
        resourceId,
        resourceName,
        email.trim(),
        role,
        uid,
      );
      switch (res.kind) {
        case "granted":
          recordEmailHistory(email);
          toast.success(`שותף עם ${res.displayName}`);
          onClose();
          break;
        case "pending":
          recordEmailHistory(email);
          toast("המוזמן אינו רשום עדיין — ההזמנה תמומש בכניסתו הראשונה");
          onClose();
          break;
        case "invalidEmail":
          toast.error('דוא"ל לא תקין');
          break;
        case "selfInvite":
          toast.error("לא ניתן לשתף עם עצמך");
          break;
        case "error":
          toast.error("שגיאה: " + res.message);
          break;
      }
    } finally {
      setBusy(false);
    }
  }

  async function makeLink() {
    setBusy(true);
    try {
      const id = await createShareLink(resourceType, resourceId, role, uid);
      setLink(`${window.location.origin}/?invite=${id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={panel} dir="rtl" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 4px", fontFamily: t.fontSerif }}>
          שיתוף {resourceType === RESOURCE_TYPE_BOARD ? "לוח" : "פתק"}
        </h3>
        <div style={{ fontSize: 13, color: t.outline, marginBottom: 12 }}>{resourceName}</div>

        <label style={lbl}>הרשאה</label>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <button
            style={{ ...roleChip, ...(role === ROLE_EDITOR ? roleActive : {}) }}
            onClick={() => setRole(ROLE_EDITOR)}
          >
            עריכה
          </button>
          <button
            style={{ ...roleChip, ...(role === ROLE_VIEWER ? roleActive : {}) }}
            onClick={() => setRole(ROLE_VIEWER)}
          >
            צפייה בלבד
          </button>
        </div>

        <label style={lbl}>שיתוף בדוא"ל</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            style={{ ...field, flex: 1 }}
            placeholder="name@example.com"
            list="share-email-history"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && invite()}
          />
          {history.length > 0 && (
            <datalist id="share-email-history">
              {history.map((e) => (
                <option key={e} value={e} />
              ))}
            </datalist>
          )}
          <button style={primary} disabled={busy || !email.trim()} onClick={invite}>
            שתף
          </button>
        </div>

        <label style={lbl}>או קישור הזמנה</label>
        {link ? (
          <div style={{ display: "flex", gap: 8 }}>
            <input style={{ ...field, flex: 1 }} readOnly value={link} />
            <button
              style={ghost}
              onClick={() => {
                navigator.clipboard?.writeText(link).then(
                  () => toast.success("הקישור הועתק"),
                  () => toast.error("העתקה נכשלה"),
                );
              }}
            >
              העתק
            </button>
          </div>
        ) : (
          <button style={ghost} disabled={busy} onClick={makeLink}>
            צור קישור ({role === ROLE_EDITOR ? "עריכה" : "צפייה"})
          </button>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button style={ghost} onClick={onClose}>סגור</button>
        </div>
      </div>
    </div>
  );
}

const backdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: t.scrim,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 200,
};
const panel: React.CSSProperties = {
  width: "90%",
  maxWidth: 440,
  background: t.surface,
  borderRadius: t.radiusMd,
  padding: 20,
  boxShadow: t.shadowModal,
  fontFamily: t.fontBody,
};
const lbl: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: t.onSurfaceVariant,
  marginBottom: 6,
};
const field: React.CSSProperties = {
  padding: "8px 10px",
  border: `1px solid ${t.outlineVariant}`,
  borderRadius: t.radius,
  fontFamily: "inherit",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};
const roleChip: React.CSSProperties = {
  flex: 1,
  padding: "8px 12px",
  border: `1px solid ${t.outlineVariant}`,
  borderRadius: t.radius,
  background: t.surface,
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 13,
};
const roleActive: React.CSSProperties = {
  background: t.surfaceContainer,
  borderColor: t.primary,
  fontWeight: 600,
};
const primary: React.CSSProperties = {
  padding: "8px 16px",
  background: t.primary,
  color: t.onPrimary,
  border: "none",
  borderRadius: t.radius,
  cursor: "pointer",
  fontSize: 14,
};
const ghost: React.CSSProperties = {
  padding: "8px 14px",
  background: "transparent",
  border: `1px solid ${t.outlineVariant}`,
  borderRadius: t.radius,
  cursor: "pointer",
  fontSize: 13,
  fontFamily: "inherit",
};
