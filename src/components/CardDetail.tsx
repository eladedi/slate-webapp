import { useEffect, useMemo, useState } from "react";
import {
  addLinkedNote,
  addSubtask,
  deleteCard,
  deleteSubtask,
  observeBoard,
  removeLinkedNote,
  setCardAssignees,
  setCardStatus,
  setSubtaskDone,
  updateCard,
  updateSubtask,
} from "../repositories/boardRepository";
import { observeNotes } from "../repositories/noteRepository";
import { getUser } from "../repositories/userRepository";
import type { Board, Card, Note, Subtask, User } from "../types";
import { toast } from "./Toast";

interface Props {
  card: Card;
  boardId: string;
  columnId: string;
  uid: string;
  onClose: () => void;
}

export function CardDetail({ card, boardId, columnId, uid, onClose }: Props) {
  const [board, setBoard] = useState<Board | null>(null);
  const [memberProfiles, setMemberProfiles] = useState<Map<string, User>>(new Map());
  const [availableNotes, setAvailableNotes] = useState<Note[]>([]);

  useEffect(() => observeBoard(boardId, setBoard), [boardId]);
  useEffect(() => observeNotes(uid, setAvailableNotes), [uid]);

  // Fetch user profiles for every board member (small N).
  useEffect(() => {
    if (!board) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        board.memberIds.map(async (m) => [m, await getUser(m)] as const),
      );
      if (cancelled) return;
      const map = new Map<string, User>();
      for (const [u, profile] of entries) if (profile) map.set(u, profile);
      setMemberProfiles(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [board?.memberIds.join(",")]);

  const assignees = card.assigneeIds?.length
    ? card.assigneeIds
    : card.assigneeId
      ? [card.assigneeId]
      : [];
  const canEdit = card.createdBy === uid || assignees.includes(uid);
  const linkedNoteIds = card.linkedNoteIds ?? [];
  const subtasks = card.subtasks ?? [];

  const notesById = useMemo(() => new Map(availableNotes.map((n) => [n.id, n])), [availableNotes]);
  const notesNotLinked = useMemo(
    () => availableNotes.filter((n) => !linkedNoteIds.includes(n.id)),
    [availableNotes, linkedNoteIds],
  );

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={modal} dir="rtl" onClick={(e) => e.stopPropagation()}>
        <div style={modalHeader}>
          <strong style={{ fontSize: 18, fontFamily: "'Noto Serif Hebrew','Noto Serif',serif" }}>
            פרטי המשימה
          </strong>
          <button style={iconBtn} onClick={onClose} title="סגור">✕</button>
        </div>

        <div style={modalBody}>
          <TitleField card={card} boardId={boardId} columnId={columnId} canEdit={canEdit} />
          <DescriptionField card={card} boardId={boardId} columnId={columnId} canEdit={canEdit} />

          <Section title="תת-משימות">
            <SubtaskList
              boardId={boardId}
              columnId={columnId}
              cardId={card.id}
              subtasks={subtasks}
              canEdit={canEdit}
            />
          </Section>

          <Section title="אחראים">
            <AssigneePicker
              board={board}
              card={card}
              boardId={boardId}
              columnId={columnId}
              memberProfiles={memberProfiles}
              uid={uid}
            />
          </Section>

          <Section title="פתקים מקושרים">
            <LinkedNotesPanel
              card={card}
              boardId={boardId}
              columnId={columnId}
              linkedNoteIds={linkedNoteIds}
              notesById={notesById}
              notesNotLinked={notesNotLinked}
              canEdit={canEdit}
            />
          </Section>
        </div>

        {canEdit && (
          <div style={modalFooter}>
            <button
              style={ghostBtn}
              onClick={async () => {
                try {
                  await setCardStatus(boardId, columnId, card.id, "irrelevant", uid);
                  onClose();
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              סמן כלא רלוונטי
            </button>
            <button
              style={dangerBtn}
              onClick={async () => {
                if (!confirm("למחוק את המשימה לצמיתות?")) return;
                try {
                  await deleteCard(boardId, columnId, card.id);
                  onClose();
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              מחק
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// -------------------- subcomponents --------------------

function TitleField({
  card,
  boardId,
  columnId,
  canEdit,
}: {
  card: Card;
  boardId: string;
  columnId: string;
  canEdit: boolean;
}) {
  const [value, setValue] = useState(card.title);
  useEffect(() => setValue(card.title), [card.id, card.title]);
  return (
    <input
      style={titleInput}
      value={value}
      readOnly={!canEdit}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        const next = value.trim();
        if (next && next !== card.title) {
          updateCard(boardId, columnId, card.id, next, card.description).catch((e) =>
            toast.error((e as Error).message),
          );
        } else {
          setValue(card.title);
        }
      }}
      placeholder="כותרת"
    />
  );
}

function DescriptionField({
  card,
  boardId,
  columnId,
  canEdit,
}: {
  card: Card;
  boardId: string;
  columnId: string;
  canEdit: boolean;
}) {
  const [value, setValue] = useState(card.description);
  useEffect(() => setValue(card.description), [card.id, card.description]);
  return (
    <textarea
      style={descTextarea}
      value={value}
      readOnly={!canEdit}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value !== card.description) {
          updateCard(boardId, columnId, card.id, card.title, value).catch((e) =>
            toast.error((e as Error).message),
          );
        }
      }}
      placeholder="תיאור"
    />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={sectionLabel}>{title}</div>
      {children}
    </div>
  );
}

function SubtaskList({
  boardId,
  columnId,
  cardId,
  subtasks,
  canEdit,
}: {
  boardId: string;
  columnId: string;
  cardId: string;
  subtasks: Subtask[];
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState("");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {subtasks.map((s) => (
        <SubtaskRow
          key={s.id}
          boardId={boardId}
          columnId={columnId}
          cardId={cardId}
          subtask={s}
          canEdit={canEdit}
        />
      ))}
      {canEdit && (
        <div style={{ display: "flex", gap: 6 }}>
          <input
            style={addInput}
            placeholder="הוסף תת-משימה…"
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && adding.trim()) {
                addSubtask(boardId, columnId, cardId, adding.trim()).catch((err) =>
                  toast.error((err as Error).message),
                );
                setAdding("");
              }
            }}
          />
          <button
            style={ghostBtn}
            disabled={!adding.trim()}
            onClick={() => {
              addSubtask(boardId, columnId, cardId, adding.trim()).catch((err) =>
                toast.error((err as Error).message),
              );
              setAdding("");
            }}
          >
            הוסף
          </button>
        </div>
      )}
    </div>
  );
}

function SubtaskRow({
  boardId,
  columnId,
  cardId,
  subtask,
  canEdit,
}: {
  boardId: string;
  columnId: string;
  cardId: string;
  subtask: Subtask;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(subtask.title);
  const [editingDesc, setEditingDesc] = useState(false);
  const [desc, setDesc] = useState(subtask.description);
  useEffect(() => setText(subtask.title), [subtask.id, subtask.title]);
  useEffect(() => setDesc(subtask.description), [subtask.id, subtask.description]);

  function saveTitle() {
    setEditing(false);
    if (text.trim() && text !== subtask.title) {
      updateSubtask(boardId, columnId, cardId, subtask.id, text.trim(), subtask.description).catch(
        (e) => toast.error((e as Error).message),
      );
    } else {
      setText(subtask.title);
    }
  }
  function saveDesc() {
    setEditingDesc(false);
    if (desc !== subtask.description) {
      updateSubtask(boardId, columnId, cardId, subtask.id, subtask.title, desc).catch((e) =>
        toast.error((e as Error).message),
      );
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "4px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          checked={subtask.done}
          disabled={!canEdit}
          onChange={() =>
            setSubtaskDone(boardId, columnId, cardId, subtask.id, !subtask.done).catch((e) =>
              toast.error((e as Error).message),
            )
          }
        />
        {editing && canEdit ? (
          <input
            autoFocus
            style={inlineInput}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setText(subtask.title);
                setEditing(false);
              }
            }}
          />
        ) : (
          <span
            onClick={() => canEdit && setEditing(true)}
            style={{
              flex: 1,
              textDecoration: subtask.done ? "line-through" : "none",
              color: subtask.done ? "#88736a" : "inherit",
              cursor: canEdit ? "text" : "default",
            }}
          >
            {subtask.title}
          </span>
        )}
        {canEdit && (
          <button
            style={iconBtn}
            onClick={() =>
              deleteSubtask(boardId, columnId, cardId, subtask.id).catch((e) =>
                toast.error((e as Error).message),
              )
            }
            title="מחק"
          >
            ✕
          </button>
        )}
      </div>
      <div style={{ paddingInlineStart: 26 }}>
        {editingDesc && canEdit ? (
          <textarea
            autoFocus
            style={{ ...inlineInput, width: "100%", minHeight: 44, resize: "vertical" }}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={saveDesc}
            placeholder="תיאור (אופציונלי)"
          />
        ) : subtask.description ? (
          <div
            onClick={() => canEdit && setEditingDesc(true)}
            style={{ fontSize: 12, color: "#88736a", cursor: canEdit ? "text" : "default" }}
          >
            {subtask.description}
          </div>
        ) : (
          canEdit && (
            <button
              onClick={() => setEditingDesc(true)}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                fontSize: 11,
                color: "#88736a",
                cursor: "pointer",
              }}
            >
              + הוסף תיאור
            </button>
          )
        )}
      </div>
    </div>
  );
}

function AssigneePicker({
  board,
  card,
  boardId,
  columnId,
  memberProfiles,
  uid,
}: {
  board: Board | null;
  card: Card;
  boardId: string;
  columnId: string;
  memberProfiles: Map<string, User>;
  uid: string;
}) {
  if (!board) return null;
  const current = card.assigneeIds?.length
    ? card.assigneeIds
    : card.assigneeId
      ? [card.assigneeId]
      : [];
  // Any board editor may reassign — server rules allow `assigneeId(s)`-only diffs.
  const canReassign = board.memberIds.includes(uid);

  async function toggle(memberUid: string) {
    if (!canReassign) return;
    const next = current.includes(memberUid)
      ? current.filter((u) => u !== memberUid)
      : [...current, memberUid];
    try {
      await setCardAssignees(boardId, columnId, card.id, next);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {board.memberIds.map((m) => {
        const profile = memberProfiles.get(m);
        const name = profile?.displayName || profile?.email || m.slice(0, 6);
        const active = current.includes(m);
        return (
          <button
            key={m}
            onClick={() => toggle(m)}
            disabled={!canReassign}
            style={{ ...chip, ...(active ? chipActive : {}) }}
          >
            {active && <span style={{ marginInlineEnd: 4 }}>✓</span>}
            {name}
          </button>
        );
      })}
    </div>
  );
}

function LinkedNotesPanel({
  card,
  boardId,
  columnId,
  linkedNoteIds,
  notesById,
  notesNotLinked,
  canEdit,
}: {
  card: Card;
  boardId: string;
  columnId: string;
  linkedNoteIds: string[];
  notesById: Map<string, Note>;
  notesNotLinked: Note[];
  canEdit: boolean;
}) {
  async function handleLink(e: React.ChangeEvent<HTMLSelectElement>) {
    const noteId = e.target.value;
    e.target.value = "";
    if (!noteId) return;
    try {
      await addLinkedNote(boardId, columnId, card.id, noteId);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {linkedNoteIds.length === 0 && (
        <div style={{ color: "#88736a", fontSize: 13 }}>אין פתקים מקושרים</div>
      )}
      {linkedNoteIds.map((id) => {
        const n = notesById.get(id);
        return (
          <div key={id} style={linkedRow}>
            <span style={{ ...colorDotSmall, background: "#4c653e" }} />
            <span style={{ flex: 1, color: n ? "inherit" : "#88736a" }}>
              {n?.name ?? "פתק לא זמין"}
            </span>
            {canEdit && (
              <button
                style={iconBtn}
                title="בטל קישור"
                onClick={() =>
                  removeLinkedNote(boardId, columnId, card.id, id).catch((e) =>
                    toast.error((e as Error).message),
                  )
                }
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
      {canEdit && notesNotLinked.length > 0 && (
        <select style={addInput} value="" onChange={handleLink}>
          <option value="">+ קשר פתק</option>
          {notesNotLinked.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

// -------------------- styles --------------------

const backdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
};
const modal: React.CSSProperties = {
  width: "100%",
  maxWidth: 560,
  maxHeight: "85vh",
  display: "flex",
  flexDirection: "column",
  background: "#fff",
  borderRadius: 12,
  boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
  fontFamily: "'Heebo','Inter',system-ui,sans-serif",
};
const modalHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 16px",
  borderBottom: "1px solid #dbc1b7",
};
const modalBody: React.CSSProperties = {
  padding: "12px 16px",
  overflowY: "auto",
  flex: 1,
};
const modalFooter: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  padding: "12px 16px",
  borderTop: "1px solid #dbc1b7",
};
const iconBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  fontSize: 14,
  color: "#88736a",
  borderRadius: 14,
};
const sectionLabel: React.CSSProperties = {
  fontSize: 12,
  color: "#88736a",
  marginBottom: 6,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};
const titleInput: React.CSSProperties = {
  width: "100%",
  padding: "8px 0",
  border: "none",
  borderBottom: "1px solid #dbc1b7",
  fontSize: 18,
  fontWeight: 600,
  background: "transparent",
  fontFamily: "inherit",
  outline: "none",
};
const descTextarea: React.CSSProperties = {
  marginTop: 8,
  width: "100%",
  minHeight: 80,
  padding: 8,
  border: "1px solid #dbc1b7",
  borderRadius: 6,
  fontFamily: "inherit",
  fontSize: 14,
  resize: "vertical",
  background: "transparent",
  outline: "none",
};
const inlineInput: React.CSSProperties = {
  flex: 1,
  padding: "4px 8px",
  border: "1px solid #dbc1b7",
  borderRadius: 4,
  fontFamily: "inherit",
  fontSize: 14,
  outline: "none",
};
const addInput: React.CSSProperties = {
  flex: 1,
  padding: "6px 10px",
  border: "1px solid #dbc1b7",
  borderRadius: 6,
  fontFamily: "inherit",
  fontSize: 14,
  outline: "none",
};
const chip: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 14,
  border: "1px solid #dbc1b7",
  background: "#fff",
  cursor: "pointer",
  font: "inherit",
  fontSize: 13,
};
const chipActive: React.CSSProperties = {
  background: "#feeadb",
  borderColor: "#94451d",
  color: "#231a11",
};
const linkedRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 8px",
  background: "#feeadb",
  borderRadius: 6,
};
const colorDotSmall: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 4,
};
const ghostBtn: React.CSSProperties = {
  padding: "6px 14px",
  background: "transparent",
  border: "1px solid #dbc1b7",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
  font: "inherit",
};
const dangerBtn: React.CSSProperties = {
  padding: "6px 14px",
  background: "#BA1A1A",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
  font: "inherit",
};
