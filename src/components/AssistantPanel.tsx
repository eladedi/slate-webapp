import { useEffect, useRef, useState } from "react";
import { t } from "../theme";
import {
  DAILY_MESSAGE_CAP,
  DEFAULT_CAPABILITIES,
  type AssistantAction,
  type AssistantCapabilities,
  type AssistantUndoTarget,
  type ChatTurn,
} from "../assistant/assistantModels";
import {
  executeAction,
  executeProposeNewBoard,
  executeProposeNewNote,
  planActions,
  undoAction,
} from "../assistant/assistantRepository";
import { assistantSettings } from "../assistant/assistantSettings";
import { AssistantApiError } from "../assistant/assistantApiClient";

type Bubble =
  | { id: number; role: "user" | "assistant" | "status"; text: string }
  | { id: number; role: "proposal"; action: AssistantAction; resolved?: "done" | "skipped" };

const CAP_LABELS: { key: keyof AssistantCapabilities; label: string }[] = [
  { key: "insertCard", label: "הוספת משימות" },
  { key: "insertNoteItem", label: "הוספת פריטים לפתק" },
  { key: "appendNoteText", label: "הוספת טקסט לפתק" },
  { key: "moveCard", label: "העברת משימות" },
  { key: "linkNoteToCard", label: "קישור פתקים למשימות" },
  { key: "showStatus", label: "סטטוס וסיכומים" },
  { key: "proposeNewBoard", label: "הצעת לוח חדש" },
  { key: "proposeNewNote", label: "הצעת פתק חדש" },
];

export function AssistantPanel({ uid, onClose }: { uid: string; onClose: () => void }) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [conversation, setConversation] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [undo, setUndo] = useState<{ targets: AssistantUndoTarget[] } | null>(null);
  const nextId = useRef(1);
  const bodyRef = useRef<HTMLDivElement>(null);

  const hasKey = assistantSettings.getApiKey().trim().length > 0;

  useEffect(() => {
    if (!assistantSettings.getPrivacyAck()) {
      addBubble("status", "⚠️ הצ'אט שולח את מבנה הלוחות והפתקים שלך ל-Gemini (Google). מפתח ה-API נשמר מקומית בלבד. המשך שימוש מהווה הסכמה.");
      assistantSettings.setPrivacyAck();
    }
    addBubble("assistant", "היי! ספר לי מה לעשות — אפשר להוסיף משימות, לארגן, להעביר, או לבקש סטטוס.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [bubbles]);

  function addBubble(role: "user" | "assistant" | "status", text: string) {
    setBubbles((b) => [...b, { id: nextId.current++, role, text }]);
  }
  function addProposal(action: AssistantAction) {
    setBubbles((b) => [...b, { id: nextId.current++, role: "proposal", action }]);
  }

  async function send() {
    const msg = input.trim();
    if (!msg || busy) return;
    if (!hasKey) {
      addBubble("status", "❌ חסר מפתח API. הגדר אותו בהגדרות (גלגל השיניים).");
      setShowSettings(true);
      return;
    }
    const over = assistantSettings.checkAndBumpUsage(DAILY_MESSAGE_CAP);
    if (over !== null) {
      addBubble("status", `הגעת למכסה היומית (${DAILY_MESSAGE_CAP} הודעות). נסה שוב מחר.`);
      return;
    }
    setInput("");
    addBubble("user", msg);
    const nextConv: ChatTurn[] = [...conversation, { role: "user", text: msg }];
    setConversation(nextConv);
    setBusy(true);
    try {
      const actions = await planActions(uid, nextConv);
      if (actions.length === 0) {
        addBubble("assistant", "לא הבנתי — אפשר לנסח אחרת?");
      }
      const undoTargets: AssistantUndoTarget[] = [];
      const echoes: string[] = [];
      for (const a of actions) {
        echoes.push(a.text || a.kind);
        if (a.kind === "PROPOSE_NEW_BOARD" || a.kind === "PROPOSE_NEW_NOTE") {
          addProposal(a);
        } else if (a.kind === "ASK_CLARIFICATION") {
          addBubble("assistant", a.question);
        } else if (a.kind === "SHOW_STATUS") {
          addBubble("status", a.body);
        } else {
          try {
            const tgt = await executeAction(uid, a);
            addBubble("assistant", `✓ ${a.text || a.kind}`);
            if (tgt) undoTargets.push(tgt);
          } catch (e) {
            addBubble("status", `⚠️ נכשל: ${(e as Error).message}`);
          }
        }
      }
      setConversation((c) => [...c, { role: "model", text: echoes.join(" · ") || "(אין פעולות)" }]);
      if (undoTargets.length > 0) {
        setUndo({ targets: undoTargets });
        setTimeout(() => setUndo(null), 30000);
      }
    } catch (e) {
      const msg2 =
        e instanceof AssistantApiError
          ? e.kind === "MISSING_KEY"
            ? "חסר מפתח API."
            : e.kind === "AUTH"
              ? "מפתח API לא תקין."
              : e.kind === "QUOTA"
                ? "חרגת ממכסת Gemini."
                : e.kind === "NETWORK"
                  ? "שגיאת רשת."
                  : "שגיאת שרת."
          : (e as Error).message;
      addBubble("status", `❌ ${msg2}`);
    } finally {
      setBusy(false);
    }
  }

  async function confirmProposal(bubbleId: number, action: AssistantAction, accept: boolean) {
    setBubbles((b) =>
      b.map((x) =>
        x.id === bubbleId && x.role === "proposal"
          ? { ...x, resolved: accept ? "done" : "skipped" }
          : x,
      ),
    );
    if (!accept) return;
    try {
      if (action.kind === "PROPOSE_NEW_BOARD") await executeProposeNewBoard(uid, action);
      else if (action.kind === "PROPOSE_NEW_NOTE") await executeProposeNewNote(uid, action);
      addBubble("assistant", "✓ נוצר.");
    } catch (e) {
      addBubble("status", `⚠️ ${(e as Error).message}`);
    }
  }

  return (
    <div style={panel} dir="rtl">
      <div style={header}>
        <strong style={{ fontFamily: t.fontSerif }}>✨ עוזר חכם</strong>
        <div style={{ marginInlineStart: "auto", display: "flex", gap: 4 }}>
          <button style={iconBtn} title="הגדרות" onClick={() => setShowSettings((s) => !s)}>⚙</button>
          <button style={iconBtn} title="סגור" onClick={onClose}>✕</button>
        </div>
      </div>

      {showSettings ? (
        <AssistantSettings onClose={() => setShowSettings(false)} />
      ) : (
        <>
          <div style={body} ref={bodyRef}>
            {bubbles.map((b) =>
              b.role === "proposal" ? (
                <div key={b.id} style={proposalBubble}>
                  <div>{b.action.text || "הצעה"}</div>
                  {b.action.kind === "PROPOSE_NEW_BOARD" && (
                    <div style={dim}>לוח: {b.action.suggestedName} ({b.action.items.length} פריטים)</div>
                  )}
                  {b.action.kind === "PROPOSE_NEW_NOTE" && (
                    <div style={dim}>פתק: {b.action.suggestedName} ({b.action.suggestedType})</div>
                  )}
                  {b.resolved ? (
                    <div style={dim}>{b.resolved === "done" ? "✓ בוצע" : "✕ דולג"}</div>
                  ) : (
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <button style={chipYes} onClick={() => confirmProposal(b.id, b.action, true)}>אישור</button>
                      <button style={chipNo} onClick={() => confirmProposal(b.id, b.action, false)}>ביטול</button>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  key={b.id}
                  style={
                    b.role === "user" ? userBubble : b.role === "status" ? statusBubble : asstBubble
                  }
                >
                  {b.text}
                </div>
              ),
            )}
            {busy && <div style={statusBubble}>חושב…</div>}
          </div>

          {undo && (
            <div style={undoBar}>
              <span>בוצע</span>
              <button
                style={chipNo}
                onClick={async () => {
                  for (const tgt of undo.targets) await undoAction(tgt);
                  setUndo(null);
                  addBubble("status", "בוטל.");
                }}
              >
                בטל
              </button>
            </div>
          )}

          <div style={inputRow}>
            <textarea
              style={textarea}
              placeholder="כתוב הודעה…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button style={sendBtn} disabled={busy || !input.trim()} onClick={send}>
              שלח
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function AssistantSettings({ onClose }: { onClose: () => void }) {
  const [apiKey, setApiKey] = useState(assistantSettings.getApiKey());
  const [model, setModel] = useState(assistantSettings.getModel());
  const [caps, setCaps] = useState<AssistantCapabilities>(
    assistantSettings.getCapabilities(),
  );

  function save() {
    assistantSettings.setApiKey(apiKey.trim());
    assistantSettings.setModel(model.trim() || "gemini-2.5-flash");
    assistantSettings.setCapabilities(caps);
    onClose();
  }

  return (
    <div style={{ ...body, gap: 12 }}>
      <div>
        <label style={lbl}>מפתח Gemini API</label>
        <input
          style={field}
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="הדבק כאן"
        />
        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 12, color: t.primary }}
        >
          קבל מפתח חינמי ←
        </a>
      </div>
      <div>
        <label style={lbl}>מודל</label>
        <input style={field} value={model} onChange={(e) => setModel(e.target.value)} />
      </div>
      <div>
        <label style={lbl}>יכולות</label>
        {CAP_LABELS.map(({ key, label }) => (
          <label key={key} style={{ display: "flex", gap: 8, padding: "4px 0", fontSize: 14 }}>
            <input
              type="checkbox"
              checked={caps[key]}
              onChange={(e) => setCaps({ ...caps, [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button style={sendBtn} onClick={save}>שמור</button>
        <button style={chipNo} onClick={() => setCaps(DEFAULT_CAPABILITIES)}>אפס יכולות</button>
      </div>
    </div>
  );
}

// styles
const panel: React.CSSProperties = {
  position: "fixed",
  insetInlineStart: 0,
  top: 0,
  bottom: 0,
  width: 380,
  background: t.surface,
  borderInlineEnd: `1px solid ${t.outlineVariant}`,
  display: "flex",
  flexDirection: "column",
  zIndex: 300,
  boxShadow: t.shadowModal,
  fontFamily: t.fontBody,
};
const header: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "12px 16px",
  borderBottom: `1px solid ${t.outlineVariant}`,
};
const body: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};
const baseBubble: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: t.radiusMd,
  fontSize: 14,
  maxWidth: "85%",
  whiteSpace: "pre-wrap",
  lineHeight: 1.5,
};
const userBubble: React.CSSProperties = {
  ...baseBubble,
  alignSelf: "flex-start",
  background: t.surfaceContainer,
};
const asstBubble: React.CSSProperties = {
  ...baseBubble,
  alignSelf: "flex-end",
  background: t.surfaceLow,
};
const statusBubble: React.CSSProperties = {
  ...baseBubble,
  alignSelf: "center",
  background: "transparent",
  color: t.outline,
  fontSize: 13,
  maxWidth: "100%",
};
const proposalBubble: React.CSSProperties = {
  ...baseBubble,
  alignSelf: "stretch",
  maxWidth: "100%",
  background: t.surfaceLow,
  border: `1px solid ${t.outlineVariant}`,
};
const dim: React.CSSProperties = { fontSize: 12, color: t.outline, marginTop: 2 };
const inputRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  padding: 12,
  borderTop: `1px solid ${t.outlineVariant}`,
};
const textarea: React.CSSProperties = {
  flex: 1,
  resize: "none",
  height: 56,
  padding: 8,
  border: `1px solid ${t.outlineVariant}`,
  borderRadius: t.radius,
  fontFamily: "inherit",
  fontSize: 14,
  outline: "none",
  background: t.surface,
};
const sendBtn: React.CSSProperties = {
  padding: "8px 16px",
  background: t.primary,
  color: t.onPrimary,
  border: "none",
  borderRadius: t.radius,
  cursor: "pointer",
  fontSize: 14,
  alignSelf: "flex-end",
};
const iconBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  fontSize: 15,
  color: t.outline,
  borderRadius: t.radius,
};
const chipYes: React.CSSProperties = {
  padding: "4px 12px",
  background: t.primary,
  color: t.onPrimary,
  border: "none",
  borderRadius: t.radius,
  cursor: "pointer",
  fontSize: 13,
};
const chipNo: React.CSSProperties = {
  padding: "4px 12px",
  background: "transparent",
  border: `1px solid ${t.outlineVariant}`,
  borderRadius: t.radius,
  cursor: "pointer",
  fontSize: 13,
};
const undoBar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 16px",
  background: t.onSurface,
  color: "#fff",
};
const lbl: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: t.onSurfaceVariant,
  marginBottom: 4,
  fontWeight: 600,
};
const field: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: `1px solid ${t.outlineVariant}`,
  borderRadius: t.radius,
  fontFamily: "inherit",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
  marginBottom: 4,
};
