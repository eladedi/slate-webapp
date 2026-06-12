import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, type User as FirebaseUser } from "firebase/auth";
import { auth, googleProvider } from "./firebase";
import {
  createBoard,
  createCard,
  createColumn,
  deleteBoard,
  deleteColumn,
  moveCardToColumn,
  moveColumn,
  observeAllArchivedCards,
  observeBoard,
  observeBoards,
  observeCards,
  observeColumns,
  observeMyWeeklyCompletions,
  observeUrgentCardsPerBoard,
  renameBoard,
  renameColumn,
  restoreCard,
  seedDefaultsIfNeeded,
  setCardStatus,
  setUrgentColumn,
  type ArchivedCard,
  type UrgentCard,
} from "./repositories/boardRepository";
import {
  addItem,
  archiveNote,
  createNote,
  deleteItem,
  deleteNote,
  observeArchivedNotes,
  observeNote,
  observeNotes,
  renameNote,
  reorderItems,
  restoreNote,
  toggleItem,
  updateFreeTextContent,
  updateItem,
} from "./repositories/noteRepository";
import { consumePendingInvitesFor, redeemShareLink } from "./repositories/shareRepository";
import { getUser, upsertUserProfile } from "./repositories/userRepository";
import { AvatarStack } from "./components/Avatar";
import { navigate, replaceRoute, useRoute, type Destination } from "./router";
import { toggleMarkedUrgent, useMarkedUrgent } from "./markedUrgent";
import { useTheme, type ThemeMode } from "./theme";
import { ShareDialog } from "./components/ShareDialog";
import { CardDetail } from "./components/CardDetail";
import { Menu } from "./components/Menu";
import { ToastHost, toast } from "./components/Toast";
import { AssistantPanel } from "./components/AssistantPanel";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  reorderCardsInColumn,
} from "./repositories/boardRepository";
import type { Unsubscribe } from "firebase/firestore";
import {
  effectiveAssignees,
  isItemBasedNote,
  NOTE_TYPE_CHECKLIST,
  NOTE_TYPE_BULLETS,
  NOTE_TYPE_FREE_TEXT,
  RESOURCE_TYPE_BOARD,
  type Board,
  type BoardColumn,
  type Card,
  type Note,
  type NoteType,
  type User,
} from "./types";

const DESTINATIONS: { id: Destination; label: string; icon: string }[] = [
  { id: "home", label: "בית", icon: "⌂" },
  { id: "boards", label: "לוחות", icon: "▦" },
  { id: "notes", label: "פתקים", icon: "✎" },
  { id: "archive", label: "ארכיון", icon: "⌫" },
  { id: "settings", label: "הגדרות", icon: "⚙" },
];

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const route = useRoute();
  const dest = route.dest;
  const [error, setError] = useState<string | null>(null);

  const [boards, setBoards] = useState<Board[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [creatingNote, setCreatingNote] = useState(false);
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  // URL is the source of truth for what's selected. These derive from it.
  const selectedBoardId = route.boardId;
  const selectedNoteId = route.noteId;

  function setDest(d: Destination) {
    if (d === "boards") navigate({ dest: "boards", boardId: selectedBoardId ?? undefined });
    else if (d === "notes") navigate({ dest: "notes", noteId: selectedNoteId ?? undefined });
    else navigate({ dest: d });
  }
  function setSelectedBoardId(id: string | null) {
    navigate({ dest: "boards", boardId: id ?? undefined });
  }
  function setSelectedNoteId(id: string | null) {
    navigate({ dest: "notes", noteId: id ?? undefined });
  }

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  useEffect(() => {
    if (!user?.email) return;
    // 1. Upsert users/{uid} (lowercased email + displayName + photoUrl) so other
    //    users can findUserByEmail this account and email invites resolve to
    //    Path A "granted" instead of falling to pendingInvites.
    // 2. consumePendingInvitesFor — pick up any invites that were queued
    //    before this user signed up.
    // 3. seedDefaultsIfNeeded — first-launch only; creates 4 default boards.
    //    Transactional `users/{uid}.seededAt` lock makes re-runs a no-op.
    upsertUserProfile(user).catch((e) =>
      console.warn("[Slate] upsertUserProfile failed", e),
    );
    consumePendingInvitesFor(user.uid, user.email).catch((e) =>
      console.warn("[Slate] consumePendingInvitesFor failed", e),
    );
    seedDefaultsIfNeeded(user.uid).catch((e) =>
      console.warn("[Slate] seedDefaultsIfNeeded failed", e),
    );
    // Redeem an invite link if present: ?invite=<linkId>
    const params = new URLSearchParams(window.location.search);
    const linkId = params.get("invite");
    if (linkId) {
      redeemShareLink(linkId, user.uid)
        .then((r) => {
          if (r) {
            toast.success(
              r.resourceType === "board" ? "הצטרפת ללוח ששותף איתך" : "הצטרפת לפתק ששותף איתך",
            );
            if (r.resourceType === "board") setDest("boards");
          } else {
            toast.error("קישור ההזמנה אינו תקין או פג תוקף");
          }
        })
        .catch((e) => toast.error((e as Error).message))
        .finally(() => {
          // Clean the URL so a refresh doesn't re-trigger.
          window.history.replaceState({}, "", window.location.pathname);
        });
    }
  }, [user?.uid, user?.email]);

  useEffect(() => {
    if (!user) {
      setBoards([]);
      return;
    }
    return observeBoards(user.uid, setBoards, (e) => setError(e.message));
  }, [user]);

  useEffect(() => {
    if (!user) {
      setNotes([]);
      return;
    }
    return observeNotes(user.uid, setNotes, (e) => setError(e.message));
  }, [user]);

  // First-visit auto-select: when the URL is `#/boards` (no id) and boards
  // have loaded, replace with the first board so the user lands somewhere.
  // `replaceRoute` keeps it out of history.
  useEffect(() => {
    if (dest === "boards" && !selectedBoardId && boards.length > 0) {
      replaceRoute({ dest: "boards", boardId: boards[0]!.id });
    }
  }, [dest, selectedBoardId, boards]);
  useEffect(() => {
    if (dest === "notes" && !selectedNoteId && notes.length > 0) {
      replaceRoute({ dest: "notes", noteId: notes[0]!.id });
    }
  }, [dest, selectedNoteId, notes]);

  if (!user) {
    return (
      <div style={shell}>
        <div style={loginCard}>
          <h1 style={{ margin: 0 }}>Slate Desktop</h1>
          <p style={{ color: "var(--outline)" }}>התחבר כדי לטעון את הלוחות שלך</p>
          <button
            style={primaryBtn}
            onClick={() => signInWithPopup(auth, googleProvider).catch((e) => setError(e.message))}
          >
            התחבר עם Google
          </button>
          {error && <pre style={errBox}>{error}</pre>}
        </div>
      </div>
    );
  }

  async function handleSubmitNote(name: string, type: NoteType) {
    try {
      const id = await createNote(name, type, user!.uid);
      setSelectedNoteId(id);
      setDest("notes");
      setCreatingNote(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleSubmitBoard(name: string) {
    try {
      const id = await createBoard(name, user!.uid);
      setSelectedBoardId(id);
      setDest("boards");
      setCreatingBoard(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div style={shell}>
      {/* Primary nav rail */}
      <nav style={navRail}>
        {DESTINATIONS.map((d) => (
          <button
            key={d.id}
            onClick={() => setDest(d.id)}
            title={d.label}
            style={{ ...railBtn, ...(dest === d.id ? railBtnActive : {}) }}
          >
            <span style={railIcon}>{d.icon}</span>
            <span style={railLabel}>{d.label}</span>
          </button>
        ))}
        <button
          onClick={() => setQuickAddOpen(true)}
          title="הוספה מהירה"
          style={{ ...railBtn, marginTop: "auto" }}
        >
          <span style={railIcon}>＋</span>
          <span style={railLabel}>מהיר</span>
        </button>
        <button
          onClick={() => setAssistantOpen(true)}
          title="עוזר חכם"
          style={{ ...railBtn, color: "var(--primary)" }}
        >
          <span style={railIcon}>✨</span>
          <span style={railLabel}>עוזר</span>
        </button>
      </nav>

      {/* Secondary sidebar — only on Boards / Notes destinations */}
      {(dest === "boards" || dest === "notes") && (
        <aside style={sidebar}>
          {dest === "boards" ? (
            <div style={{ padding: "12px 0" }}>
              <div style={navLabel}>הלוחות שלי ({boards.length})</div>
              {boards.map((b) => (
                <div
                  key={b.id}
                  style={{
                    ...boardRow,
                    background: b.id === selectedBoardId ? "var(--selected)" : "transparent",
                    padding: 0,
                  }}
                >
                  <button
                    onClick={() => setSelectedBoardId(b.id)}
                    style={{ ...sidebarItemBtn, flex: 1 }}
                  >
                    <span style={{ ...colorDot, background: b.color || "#94451d" }} />
                    <span>{b.name}</span>
                  </button>
                  <Menu
                    items={[
                      {
                        label: "שנה שם",
                        onSelect: async () => {
                          const name = window.prompt("שם חדש ללוח:", b.name);
                          if (name?.trim() && name.trim() !== b.name) {
                            try {
                              await renameBoard(b.id, name.trim());
                            } catch (e) {
                              toast.error((e as Error).message);
                            }
                          }
                        },
                      },
                      {
                        label: "מחק לוח",
                        destructive: true,
                        disabled: b.ownerId !== user.uid,
                        onSelect: async () => {
                          if (b.ownerId !== user.uid) {
                            toast.error("רק הבעלים יכול למחוק את הלוח");
                            return;
                          }
                          if (!confirm(`למחוק את "${b.name}" ואת כל המשימות בו?`)) return;
                          try {
                            await deleteBoard(b.id);
                            if (selectedBoardId === b.id) setSelectedBoardId(null);
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        },
                      },
                    ]}
                  />
                </div>
              ))}
              <button style={{ ...addCardBtn, margin: "8px 16px" }} onClick={() => setCreatingBoard(true)}>
                + לוח חדש
              </button>
            </div>
          ) : (
            <div style={{ padding: "12px 0" }}>
              <div style={navLabel}>הפתקים שלי ({notes.length})</div>
              {notes.map((n) => (
                <div
                  key={n.id}
                  style={{
                    ...boardRow,
                    background: n.id === selectedNoteId ? "var(--secondary-container)" : "transparent",
                    padding: 0,
                  }}
                >
                  <button
                    onClick={() => setSelectedNoteId(n.id)}
                    style={{ ...sidebarItemBtn, flex: 1 }}
                  >
                    <span style={{ ...colorDot, background: "var(--secondary)" }} />
                    <span>{n.name}</span>
                  </button>
                  <Menu
                    items={[
                      {
                        label: "שנה שם",
                        onSelect: async () => {
                          const name = window.prompt("שם חדש לפתק:", n.name);
                          if (name?.trim() && name.trim() !== n.name) {
                            try {
                              await renameNote(n.id, name.trim());
                            } catch (e) {
                              toast.error((e as Error).message);
                            }
                          }
                        },
                      },
                      {
                        label: "העבר לארכיון",
                        onSelect: async () => {
                          try {
                            await archiveNote(n.id);
                            if (selectedNoteId === n.id) setSelectedNoteId(null);
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        },
                      },
                      {
                        label: "מחק לצמיתות",
                        destructive: true,
                        onSelect: async () => {
                          if (!confirm(`למחוק לצמיתות את "${n.name}"?`)) return;
                          try {
                            await deleteNote(n.id);
                            if (selectedNoteId === n.id) setSelectedNoteId(null);
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        },
                      },
                    ]}
                  />
                </div>
              ))}
              <button style={{ ...addCardBtn, margin: "8px 16px" }} onClick={() => setCreatingNote(true)}>
                + פתק חדש
              </button>
            </div>
          )}
        </aside>
      )}

      <main style={main}>
        {dest === "home" && <HomeScreen user={user} boards={boards} />}
        {dest === "boards" &&
          (selectedBoardId ? (
            (() => {
              const b = boards.find((x) => x.id === selectedBoardId);
              return (
                <BoardView
                  boardId={selectedBoardId}
                  boardName={b?.name ?? ""}
                  boardUrgentColumnId={b?.urgentColumnId ?? null}
                  uid={user.uid}
                  openCardId={route.openCardId}
                />
              );
            })()
          ) : (
            <div style={emptyMain}>בחר לוח מהתפריט</div>
          ))}
        {dest === "notes" &&
          (selectedNoteId ? (
            <NoteView noteId={selectedNoteId} />
          ) : (
            <div style={emptyMain}>בחר פתק מהתפריט</div>
          ))}
        {dest === "archive" && <ArchiveScreen uid={user.uid} boards={boards} />}
        {dest === "settings" && <SettingsScreen user={user} />}
        {error && <pre style={errBox}>{error}</pre>}
      </main>

      {creatingBoard && (
        <CreateBoardDialog
          onCancel={() => setCreatingBoard(false)}
          onSubmit={handleSubmitBoard}
        />
      )}
      {creatingNote && (
        <CreateNoteDialog onCancel={() => setCreatingNote(false)} onSubmit={handleSubmitNote} />
      )}
      {quickAddOpen && (
        <QuickAddDialog
          boards={boards}
          uid={user.uid}
          onClose={() => setQuickAddOpen(false)}
        />
      )}
      {assistantOpen && (
        <AssistantPanel uid={user.uid} onClose={() => setAssistantOpen(false)} />
      )}
      <ToastHost />
    </div>
  );
}

// -------------------- Create dialogs --------------------

function CreateBoardDialog({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <div style={dialogBackdrop} onClick={onCancel}>
      <div style={dialogPanel} dir="rtl" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 8px" }}>לוח חדש</h3>
        <input
          autoFocus
          style={dialogInput}
          placeholder="שם הלוח"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) onSubmit(name.trim());
            if (e.key === "Escape") onCancel();
          }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button style={ghostBtn} onClick={onCancel}>ביטול</button>
          <button style={primaryBtn} disabled={!name.trim()} onClick={() => onSubmit(name.trim())}>
            צור
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateNoteDialog({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (name: string, type: NoteType) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<NoteType>(NOTE_TYPE_CHECKLIST);
  const typeOptions: { id: NoteType; label: string }[] = [
    { id: NOTE_TYPE_CHECKLIST, label: "רשימת משימות" },
    { id: NOTE_TYPE_BULLETS, label: "רשימה" },
    { id: NOTE_TYPE_FREE_TEXT, label: "טקסט" },
  ];
  return (
    <div style={dialogBackdrop} onClick={onCancel}>
      <div style={dialogPanel} dir="rtl" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 8px" }}>פתק חדש</h3>
        <input
          autoFocus
          style={dialogInput}
          placeholder="שם הפתק"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) onSubmit(name.trim(), type);
            if (e.key === "Escape") onCancel();
          }}
        />
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {typeOptions.map((t) => (
            <button
              key={t.id}
              onClick={() => setType(t.id)}
              style={{
                ...typeChip,
                ...(type === t.id ? typeChipActive : {}),
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button style={ghostBtn} onClick={onCancel}>ביטול</button>
          <button
            style={primaryBtn}
            disabled={!name.trim()}
            onClick={() => onSubmit(name.trim(), type)}
          >
            צור
          </button>
        </div>
      </div>
    </div>
  );
}

// -------------------- Home --------------------

const URGENT_SECTION_OPEN_KEY = "slate.home.urgentSectionOpen";

function HomeScreen({ user, boards }: { user: FirebaseUser; boards: Board[] }) {
  const [weeklyCompleted, setWeeklyCompleted] = useState(0);
  const [urgentByBoard, setUrgentByBoard] = useState<Map<string, UrgentCard[]>>(new Map());
  const marked = useMarkedUrgent(user.uid);
  const [sectionOpen, setSectionOpen] = useState<boolean>(() => {
    const stored = localStorage.getItem(URGENT_SECTION_OPEN_KEY);
    return stored === null ? true : stored === "true";
  });

  useEffect(() => observeMyWeeklyCompletions(user.uid, setWeeklyCompleted), [user.uid]);
  useEffect(() => observeUrgentCardsPerBoard(user.uid, setUrgentByBoard), [user.uid]);

  function toggleSection() {
    setSectionOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(URGENT_SECTION_OPEN_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  // Flatten board → cards into a single ordered list. Marked cards bubble to
  // the top (mirrors the mobile §31 visual treatment).
  const allUrgent: (UrgentCard & { boardName: string; boardColor: string })[] = [];
  for (const b of boards) {
    for (const uc of urgentByBoard.get(b.id) ?? []) {
      allUrgent.push({ ...uc, boardName: b.name, boardColor: b.color || "#94451d" });
    }
  }
  allUrgent.sort((a, b) => {
    const am = marked.has(a.card.id) ? 0 : 1;
    const bm = marked.has(b.card.id) ? 0 : 1;
    return am - bm;
  });

  const totalUrgent = allUrgent.length;
  const firstName = user.displayName?.split(" ")[0] ?? "";

  return (
    <div style={{ padding: 24, maxWidth: 960, marginInline: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>היי {firstName}</h1>
        <span style={weeklyBadge}>{weeklyCompleted} הושלמו השבוע</span>
      </div>

      <div style={urgentHero}>
        <span style={{ fontSize: 28 }}>!</span>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>יש לך {totalUrgent} משימות דחופות</div>
          <div style={{ fontSize: 13, color: "var(--outline)" }}>לחץ על משימה כדי לפתוח אותה</div>
        </div>
      </div>

      {allUrgent.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <button onClick={toggleSection} style={sectionToggle}>
            <span
              aria-hidden
              style={{
                display: "inline-block",
                transition: "transform 120ms ease",
                transform: sectionOpen ? "rotate(90deg)" : "rotate(0deg)",
              }}
            >
              ▸
            </span>
            <span>משימות דחופות ({allUrgent.length})</span>
          </button>
          {sectionOpen && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {allUrgent.map((u) => (
                <UrgentTaskRow
                  key={u.card.id}
                  urgent={u}
                  isMarked={marked.has(u.card.id)}
                  uid={user.uid}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ fontWeight: 600, margin: "16px 0 8px" }}>פירוט לפי לוח</div>
      <div style={tileGrid}>
        {boards.map((b) => (
          <div key={b.id} style={{ ...tileCard, borderInlineStartColor: b.color || "#94451d" }}>
            <div style={{ fontWeight: 600 }}>{b.name}</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: b.color || "#94451d" }}>
              {(urgentByBoard.get(b.id) ?? []).length}
            </div>
            <div style={{ fontSize: 12, color: "var(--outline)" }}>משימות</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UrgentTaskRow({
  urgent,
  isMarked,
  uid,
}: {
  urgent: UrgentCard & { boardName: string; boardColor: string };
  isMarked: boolean;
  uid: string;
}) {
  const { boardId, columnId, card, boardName, boardColor } = urgent;
  function open() {
    navigate({ dest: "boards", boardId, openCardId: card.id });
  }
  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    toggleMarkedUrgent(uid, card.id, isMarked);
  }
  return (
    <div
      onClick={open}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        background: isMarked ? "var(--urgency-urgent-tint)" : "var(--surface)",
        border: `1px solid ${isMarked ? "var(--urgency-urgent)" : "var(--outline-variant)"}`,
        borderRadius: 12,
        cursor: "pointer",
        color: "var(--on-surface)",
      }}
      title={`${boardName} · פתח כרטיס`}
      data-column-id={columnId}
    >
      <span style={{ ...colorDot, background: boardColor }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 500,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {card.title}
        </div>
        <div style={{ fontSize: 12, color: "var(--outline)", marginTop: 2 }}>{boardName}</div>
      </div>
      <button
        onClick={toggle}
        title={isMarked ? "הסר סימון דחיפות" : "סמן כדחוף"}
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          border: "none",
          background: isMarked ? "var(--urgency-urgent)" : "transparent",
          color: isMarked ? "#fff" : "var(--outline)",
          cursor: "pointer",
          fontSize: 16,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        !
      </button>
    </div>
  );
}

// -------------------- Archive --------------------

function ArchiveScreen({ uid, boards }: { uid: string; boards: Board[] }) {
  const [innerTab, setInnerTab] = useState<"tasks" | "notes">("tasks");
  const [archivedCards, setArchivedCards] = useState<ArchivedCard[]>([]);
  const [archivedNotes, setArchivedNotes] = useState<Note[]>([]);

  useEffect(() => observeAllArchivedCards(uid, setArchivedCards), [uid]);
  useEffect(() => observeArchivedNotes(uid, setArchivedNotes), [uid]);

  const boardById = new Map(boards.map((b) => [b.id, b]));

  return (
    <div style={{ padding: 24, maxWidth: 960, marginInline: "auto" }}>
      <h1 style={{ margin: "0 0 16px", fontSize: 24 }}>ארכיון</h1>
      <div style={innerTabs}>
        <button
          style={{ ...innerTabBtn, ...(innerTab === "tasks" ? innerTabBtnActive : {}) }}
          onClick={() => setInnerTab("tasks")}
        >
          משימות ({archivedCards.length})
        </button>
        <button
          style={{ ...innerTabBtn, ...(innerTab === "notes" ? innerTabBtnActive : {}) }}
          onClick={() => setInnerTab("notes")}
        >
          פתקים ({archivedNotes.length})
        </button>
      </div>

      {innerTab === "tasks" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {archivedCards.length === 0 && <div style={emptyMain}>אין משימות בארכיון</div>}
          {archivedCards.map((a) => {
            const board = boardById.get(a.boardId);
            const assignees = a.card.assigneeIds ?? [];
            const canRestore =
              a.card.createdBy === uid || assignees.includes(uid) || a.card.assigneeId === uid;
            return (
              <div key={a.card.id} style={archiveRow}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{a.card.title}</div>
                  <div style={{ fontSize: 12, color: "var(--outline)", marginTop: 4 }}>
                    {board?.name ?? "?"} · {statusLabel(a.card.status)}
                  </div>
                </div>
                {canRestore && (
                  <button
                    style={restoreBtn}
                    title="שחזר"
                    onClick={() =>
                      restoreCard(a.boardId, a.columnId, a.card.id, uid).catch((e) =>
                        toast.error((e as Error).message),
                      )
                    }
                  >
                    ↻
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {archivedNotes.length === 0 && <div style={emptyMain}>אין פתקים בארכיון</div>}
          {archivedNotes.map((n) => (
            <div key={n.id} style={archiveRow}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{n.name}</div>
                <div style={{ fontSize: 12, color: "var(--outline)", marginTop: 4 }}>{noteTypeLabel(n.type)}</div>
              </div>
              <button
                style={restoreBtn}
                title="שחזר"
                onClick={() => restoreNote(n.id).catch((e) => toast.error((e as Error).message))}
              >
                ↻
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function statusLabel(s: string): string {
  if (s === "completed") return "הושלם";
  if (s === "irrelevant") return "לא רלוונטי";
  return s;
}
function noteTypeLabel(t: string): string {
  if (t === NOTE_TYPE_CHECKLIST) return "רשימת משימות";
  if (t === NOTE_TYPE_BULLETS) return "רשימה";
  if (t === NOTE_TYPE_FREE_TEXT) return "טקסט";
  return t;
}

// -------------------- Settings --------------------

function SettingsScreen({ user }: { user: FirebaseUser }) {
  const { mode, setMode } = useTheme();
  const themeOptions: { id: ThemeMode; label: string }[] = [
    { id: "system", label: "מערכת" },
    { id: "light", label: "בהיר" },
    { id: "dark", label: "כהה" },
  ];
  return (
    <div style={{ padding: 24, maxWidth: 720, marginInline: "auto" }}>
      <h1 style={{ margin: "0 0 16px", fontSize: 24 }}>הגדרות</h1>

      <section style={settingsCard}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>חשבון</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {user.photoURL ? (
            <img src={user.photoURL} alt="" style={{ width: 48, height: 48, borderRadius: 24 }} />
          ) : (
            <div style={avatarFallback}>{(user.displayName ?? "?").charAt(0)}</div>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{user.displayName}</div>
            <div style={{ fontSize: 13, color: "var(--outline)" }}>{user.email}</div>
          </div>
          <button style={ghostBtn} onClick={() => signOut(auth)}>התנתק</button>
        </div>
      </section>

      <section style={settingsCard}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>מראה</div>
        <div style={{ display: "flex", gap: 6 }}>
          {themeOptions.map((o) => (
            <button
              key={o.id}
              onClick={() => setMode(o.id)}
              style={{
                ...typeChip,
                ...(mode === o.id ? typeChipActive : {}),
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div style={{ color: "var(--outline)", fontSize: 12, marginTop: 8 }}>
          ערכת "Desert Study" — בחר בין מצב בהיר, כהה, או "מערכת" (עוקב אחר הגדרת המערכת).
        </div>
      </section>

      <section style={settingsCard}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>אודות</div>
        <div style={{ fontSize: 13, color: "var(--outline)" }}>Slate Desktop · 0.1.0 (pre-Tauri)</div>
      </section>
    </div>
  );
}

// -------------------- Quick Add --------------------

function QuickAddDialog({
  boards,
  uid,
  onClose,
}: {
  boards: Board[];
  uid: string;
  onClose: () => void;
}) {
  const [boardId, setBoardId] = useState(boards[0]?.id ?? "");
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [columnId, setColumnId] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!boardId) return;
    return observeColumns(boardId, (cols) => {
      setColumns(cols);
      setColumnId((prev) => (cols.some((c) => c.id === prev) ? prev : cols[0]?.id ?? ""));
    });
  }, [boardId]);

  async function submit() {
    if (!title.trim() || !boardId || !columnId) return;
    setBusy(true);
    try {
      await createCard(boardId, columnId, title.trim(), "", uid);
      toast.success("נוספה משימה");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={dialogBackdrop} onClick={onClose}>
      <div style={dialogPanel} dir="rtl" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 8px" }}>הוספה מהירה</h3>
        <input
          autoFocus
          style={dialogInput}
          placeholder="מה צריך לעשות?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onClose();
          }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <select
            style={{ ...dialogInput, flex: 1 }}
            value={boardId}
            onChange={(e) => setBoardId(e.target.value)}
          >
            {boards.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <select
            style={{ ...dialogInput, flex: 1 }}
            value={columnId}
            onChange={(e) => setColumnId(e.target.value)}
          >
            {columns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button style={ghostBtn} onClick={onClose}>ביטול</button>
          <button style={primaryBtn} disabled={busy || !title.trim()} onClick={submit}>
            הוסף
          </button>
        </div>
      </div>
    </div>
  );
}

// -------------------- Boards (existing) --------------------

function BoardView({
  boardId,
  boardName,
  boardUrgentColumnId,
  uid,
  openCardId,
}: {
  boardId: string;
  boardName: string;
  boardUrgentColumnId: string | null;
  uid: string;
  openCardId: string | null;
}) {
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [cardsByColumn, setCardsByColumn] = useState<Record<string, Card[]>>({});
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [memberProfiles, setMemberProfiles] = useState<Map<string, User>>(new Map());

  useEffect(() => observeColumns(boardId, setColumns), [boardId]);

  // Live board doc → memberIds (used to hydrate assignee profiles for avatar
  // rendering on each card).
  useEffect(
    () => observeBoard(boardId, (b) => setMemberIds(b?.memberIds ?? [])),
    [boardId],
  );

  // Fetch User profile for each member once. Small N (2–3 typically). When
  // membership changes the effect re-runs and we union new profiles in.
  const memberKey = memberIds.join(",");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        memberIds.map(async (m) => [m, await getUser(m)] as const),
      );
      if (cancelled) return;
      setMemberProfiles((prev) => {
        const next = new Map(prev);
        for (const [u, profile] of entries) if (profile) next.set(u, profile);
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberKey]);

  // Subscribe to every column's cards; aggregate into a single map.
  const colKey = columns.map((c) => c.id).join(",");
  useEffect(() => {
    if (columns.length === 0) {
      setCardsByColumn({});
      return;
    }
    const unsubs: Unsubscribe[] = [];
    for (const col of columns) {
      const stop = observeCards(boardId, col.id, (cards) => {
        setCardsByColumn((prev) => ({ ...prev, [col.id]: cards }));
      });
      unsubs.push(stop);
    }
    return () => {
      for (const u of unsubs) u();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, colKey]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function findColumnOfCard(cardId: string): string | null {
    for (const [colId, cards] of Object.entries(cardsByColumn)) {
      if (cards.some((c) => c.id === cardId)) return colId;
    }
    return null;
  }

  function handleDragStart(event: DragStartEvent) {
    const id = event.active.id as string;
    const colId = findColumnOfCard(id);
    if (!colId) return;
    const card = (cardsByColumn[colId] ?? []).find((c) => c.id === id) ?? null;
    setActiveCard(card);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveCard(null);
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const fromCol = findColumnOfCard(activeId);
    if (!fromCol) return;

    // over.id is either a card id (dropped onto a card) OR a column id (empty col body).
    const overId = over.id as string;
    const overIsColumn = columns.some((c) => c.id === overId);
    const toCol = overIsColumn ? overId : findColumnOfCard(overId);
    if (!toCol) return;

    if (fromCol === toCol) {
      if (overIsColumn || activeId === overId) return;
      const cards = cardsByColumn[fromCol] ?? [];
      const oldIdx = cards.findIndex((c) => c.id === activeId);
      const newIdx = cards.findIndex((c) => c.id === overId);
      if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return;
      const next = arrayMove(cards, oldIdx, newIdx);
      // Optimistic local order
      setCardsByColumn((prev) => ({ ...prev, [fromCol]: next }));
      try {
        await reorderCardsInColumn(boardId, fromCol, next.map((c) => c.id));
      } catch (e) {
        toast.error((e as Error).message);
      }
    } else {
      try {
        await moveCardToColumn(boardId, fromCol, toCol, activeId);
      } catch (e) {
        toast.error((e as Error).message);
      }
    }
  }

  async function handleCreateColumn() {
    const name = window.prompt("שם העמודה החדשה:");
    if (!name?.trim()) return;
    try {
      await createColumn(boardId, name.trim());
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const [shareOpen, setShareOpen] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={boardToolbar}>
        <strong style={{ fontFamily: "'Noto Serif Hebrew','Noto Serif',serif" }}>{boardName}</strong>
        <button style={ghostBtn} onClick={() => setShareOpen(true)}>שתף לוח</button>
      </div>
      {shareOpen && (
        <ShareDialog
          resourceType={RESOURCE_TYPE_BOARD}
          resourceId={boardId}
          resourceName={boardName}
          uid={uid}
          onClose={() => setShareOpen(false)}
        />
      )}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div style={kanban}>
          {columns.map((col) => (
            <ColumnView
              key={col.id}
              boardId={boardId}
              column={col}
              columns={columns}
              cards={cardsByColumn[col.id] ?? []}
              isUrgent={col.id === boardUrgentColumnId}
              uid={uid}
              memberProfiles={memberProfiles}
              openCardId={openCardId}
              onCardOpened={() =>
                replaceRoute({ dest: "boards", boardId, openCardId: null })
              }
            />
          ))}
          <button style={addColumnBtn} onClick={handleCreateColumn}>+ עמודה</button>
        </div>
        <DragOverlay>
          {activeCard ? (
            <div style={{ ...cardStyle, boxShadow: "0 8px 24px rgba(0,0,0,0.18)", opacity: 0.95 }}>
              <div style={{ fontWeight: 500 }}>{activeCard.title}</div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function ColumnView({
  boardId,
  column,
  columns,
  cards,
  isUrgent,
  uid,
  memberProfiles,
  openCardId,
  onCardOpened,
}: {
  boardId: string;
  column: BoardColumn;
  columns: BoardColumn[];
  cards: Card[];
  isUrgent: boolean;
  uid: string;
  memberProfiles: Map<string, User>;
  openCardId: string | null;
  onCardOpened: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  async function handleAdd() {
    const title = window.prompt("כותרת המשימה?");
    if (!title?.trim()) return;
    setBusy(true);
    try {
      await createCard(boardId, column.id, title.trim(), "", uid);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const columnMenu = (
    <Menu
      items={[
        {
          label: "שנה שם",
          onSelect: async () => {
            const name = window.prompt("שם חדש לעמודה:", column.name);
            if (name?.trim() && name.trim() !== column.name) {
              try {
                await renameColumn(boardId, column.id, name.trim());
              } catch (e) {
                toast.error((e as Error).message);
              }
            }
          },
        },
        {
          label: isUrgent ? "✓ עמודה דחופה" : "סמן כעמודה דחופה",
          onSelect: () =>
            setUrgentColumn(boardId, isUrgent ? null : column.id).catch((e) =>
              toast.error((e as Error).message),
            ),
        },
        {
          label: "הזז קדימה",
          onSelect: () =>
            moveColumn(boardId, column.id, "up").catch((e) =>
              toast.error((e as Error).message),
            ),
        },
        {
          label: "הזז אחורה",
          onSelect: () =>
            moveColumn(boardId, column.id, "down").catch((e) =>
              toast.error((e as Error).message),
            ),
        },
        {
          label: "מחק עמודה",
          destructive: true,
          onSelect: async () => {
            if (!confirm(`למחוק את "${column.name}" ואת כל הכרטיסים בה?`)) return;
            try {
              await deleteColumn(boardId, column.id);
            } catch (e) {
              toast.error((e as Error).message);
            }
          },
        },
      ]}
    />
  );

  return (
    <div style={columnStyle}>
      <div style={columnHeader}>
        <span style={{ ...colorDot, background: column.color || "#dbc1b7" }} />
        <strong>{column.name}</strong>
        {isUrgent && <span style={urgentBadge}>דחוף</span>}
        <span style={{ color: "var(--outline)", fontSize: 12, marginInlineStart: "auto" }}>{cards.length}</span>
        {columnMenu}
      </div>
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            minHeight: 40,
            borderRadius: 8,
            background: isOver ? "rgba(224,138,60,0.06)" : "transparent",
            padding: 2,
          }}
        >
          {cards.map((c) => (
            <SortableCard
              key={c.id}
              card={c}
              boardId={boardId}
              columnId={column.id}
              columns={columns}
              uid={uid}
              memberProfiles={memberProfiles}
              forceOpen={openCardId === c.id}
              onForceOpenConsumed={onCardOpened}
            />
          ))}
          <button style={addCardBtn} onClick={handleAdd} disabled={busy}>
            + הוסף משימה
          </button>
        </div>
      </SortableContext>
    </div>
  );
}

function SortableCard(props: {
  card: Card;
  boardId: string;
  columnId: string;
  columns: BoardColumn[];
  uid: string;
  memberProfiles: Map<string, User>;
  forceOpen?: boolean;
  onForceOpenConsumed?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.card.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      {...attributes}
      {...listeners}
    >
      <CardView {...props} />
    </div>
  );
}

function CardView({
  card,
  boardId,
  columnId,
  columns,
  uid,
  memberProfiles,
  forceOpen,
  onForceOpenConsumed,
}: {
  card: Card;
  boardId: string;
  columnId: string;
  columns: BoardColumn[];
  uid: string;
  memberProfiles: Map<string, User>;
  forceOpen?: boolean;
  onForceOpenConsumed?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const assignees = effectiveAssignees(card);

  // Deep-link consumption: when URL says `?card=<this.id>`, open the modal
  // and immediately clear the URL param so a refresh doesn't keep re-opening.
  useEffect(() => {
    if (forceOpen && !open) {
      setOpen(true);
      onForceOpenConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceOpen]);

  async function markDone(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await setCardStatus(boardId, columnId, card.id, "completed", uid);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }
  async function handleMove(e: React.ChangeEvent<HTMLSelectElement>) {
    const targetColumnId = e.target.value;
    e.target.value = "";
    if (!targetColumnId || targetColumnId === columnId) return;
    try {
      await moveCardToColumn(boardId, columnId, targetColumnId, card.id);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }
  const otherColumns = columns.filter((c) => c.id !== columnId);

  return (
    <>
      <div style={{ ...cardStyle, cursor: "pointer" }} onClick={() => setOpen(true)}>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 500 }}>{card.title}</div>
            {card.description && (
              <div style={{ fontSize: 12, color: "var(--outline)", marginTop: 4 }}>{card.description}</div>
            )}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 6,
                flexWrap: "wrap",
              }}
            >
              {(card.subtasks ?? []).length > 0 && (
                <div style={subtaskPill}>
                  {(card.subtasks ?? []).filter((s) => s.done).length} / {(card.subtasks ?? []).length}
                </div>
              )}
              {assignees.length > 0 && (
                <AvatarStack uids={assignees} profiles={memberProfiles} size={22} max={3} />
              )}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <button title="סמן כהושלם" style={doneBtn} onClick={markDone}>
              ✓
            </button>
            {otherColumns.length > 0 && (
              <select
                title="העבר לעמודה"
                style={moveSelect}
                value=""
                onClick={(e) => e.stopPropagation()}
                onChange={handleMove}
              >
                <option value="">↔</option>
                {otherColumns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>
      {open && (
        <CardDetail
          card={card}
          boardId={boardId}
          columnId={columnId}
          uid={uid}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// -------------------- Notes (existing) --------------------

function NoteView({ noteId }: { noteId: string }) {
  const [note, setNote] = useState<Note | null>(null);
  useEffect(() => observeNote(noteId, setNote), [noteId]);
  if (!note) return <div style={{ padding: 24 }}>טוען…</div>;

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <h2 style={{ marginTop: 0 }}>{note.name}</h2>
      {note.type === NOTE_TYPE_FREE_TEXT ? (
        <FreeTextEditor note={note} />
      ) : isItemBasedNote(note.type) ? (
        <ItemList note={note} />
      ) : null}
    </div>
  );
}

function FreeTextEditor({ note }: { note: Note }) {
  const [value, setValue] = useState(note.content);
  useEffect(() => setValue(note.content), [note.id, note.content]);
  return (
    <textarea
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value !== note.content)
          updateFreeTextContent(note.id, value).catch((e) => toast.error(e.message));
      }}
      style={textareaStyle}
      placeholder="כתוב כאן…"
    />
  );
}

function ItemList({ note }: { note: Note }) {
  const isChecklist = note.type === NOTE_TYPE_CHECKLIST;
  const items = note.items ?? [];
  const [adding, setAdding] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  async function handleAdd() {
    const text = adding.trim();
    if (!text) return;
    setAdding("");
    try {
      await addItem(note.id, text);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((i) => i.id === active.id);
    const newIdx = items.findIndex((i) => i.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(items, oldIdx, newIdx);
    try {
      await reorderItems(note.id, next.map((i) => i.id));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((item) => (
              <SortableNoteItem
                key={item.id}
                noteId={note.id}
                item={item}
                isChecklist={isChecklist}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          style={addInputStyle}
          placeholder="הוסף פריט…"
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
        />
        <button style={addCardBtn} disabled={!adding.trim()} onClick={handleAdd}>
          הוסף
        </button>
      </div>
    </div>
  );
}

function SortableNoteItem({
  noteId,
  item,
  isChecklist,
}: {
  noteId: string;
  item: import("./types").NoteItem;
  isChecklist: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);
  useEffect(() => setText(item.text), [item.id, item.text]);

  function commit() {
    setEditing(false);
    const next = text.trim();
    if (next === item.text) return;
    if (next === "") {
      // Empty commit deletes — matches Android checklist UX.
      deleteItem(noteId, item.id).catch((e) => toast.error((e as Error).message));
    } else {
      updateItem(noteId, item.id, next, item.checked).catch((e) =>
        toast.error((e as Error).message),
      );
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        ...itemRow,
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      <span
        {...attributes}
        {...listeners}
        title="גרור לסידור"
        style={{ cursor: "grab", color: "var(--outline-variant)", userSelect: "none" }}
      >
        ⠿
      </span>
      {isChecklist ? (
        <input
          type="checkbox"
          checked={item.checked}
          onChange={() => toggleItem(noteId, item.id).catch((e) => toast.error(e.message))}
        />
      ) : (
        <span style={{ color: "var(--outline)" }}>•</span>
      )}
      {editing ? (
        <input
          autoFocus
          style={inlineNoteInput}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setText(item.text);
              setEditing(false);
            }
          }}
        />
      ) : (
        <span
          onClick={() => setEditing(true)}
          style={{
            flex: 1,
            cursor: "text",
            textDecoration: item.checked ? "line-through" : "none",
            color: item.checked ? "var(--outline)" : "inherit",
          }}
        >
          {item.text}
        </span>
      )}
    </div>
  );
}

// -------------------- styles --------------------
// Color values reference CSS variables defined in `index.css`. The `:root` set
// is the light palette; `html[data-theme="dark"]` overrides them. Theme is
// switched at runtime by `ThemeProvider` (writes `data-theme` to <html>).

const shell: React.CSSProperties = {
  display: "flex",
  height: "100vh",
  fontFamily: "'Heebo','Inter',system-ui,sans-serif",
  background: "var(--bg)",
  color: "var(--on-surface)",
};
const navRail: React.CSSProperties = {
  width: 84,
  flexShrink: 0,
  background: "var(--surface)",
  borderInlineEnd: "1px solid var(--outline-variant)",
  display: "flex",
  flexDirection: "column",
  padding: "12px 0",
  gap: 4,
};
const railBtn: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 4,
  padding: "10px 4px",
  border: "none",
  background: "transparent",
  cursor: "pointer",
  color: "var(--outline)",
  font: "inherit",
  borderInlineStart: "3px solid transparent",
};
const railBtnActive: React.CSSProperties = {
  color: "var(--primary)",
  borderInlineStart: "3px solid var(--primary)",
  background: "var(--selected)",
};
const railIcon: React.CSSProperties = { fontSize: 20 };
const railLabel: React.CSSProperties = { fontSize: 11 };
const loginCard: React.CSSProperties = {
  margin: "auto",
  padding: 32,
  background: "var(--surface)",
  borderRadius: 12,
  boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
  textAlign: "center",
  minWidth: 320,
};
const sidebar: React.CSSProperties = {
  width: 260,
  flexShrink: 0,
  borderInlineEnd: "1px solid var(--outline-variant)",
  background: "var(--surface)",
  display: "flex",
  flexDirection: "column",
  overflow: "auto",
};
const main: React.CSSProperties = {
  flex: 1,
  overflow: "auto",
  position: "relative",
  minWidth: 0,
};
const emptyMain: React.CSSProperties = { padding: 24, color: "var(--outline)" };
const navLabel: React.CSSProperties = {
  padding: "8px 16px",
  fontSize: 11,
  textTransform: "uppercase",
  color: "var(--outline)",
  letterSpacing: 0.5,
};
const boardRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 16px",
  width: "100%",
  border: "none",
  background: "transparent",
  cursor: "pointer",
  textAlign: "start",
  font: "inherit",
  color: "inherit",
};
const colorDot: React.CSSProperties = {
  display: "inline-block",
  width: 10,
  height: 10,
  borderRadius: 5,
  flexShrink: 0,
};
const primaryBtn: React.CSSProperties = {
  padding: "10px 24px",
  background: "var(--primary)",
  color: "var(--on-primary)",
  border: "none",
  borderRadius: 8,
  fontSize: 14,
  cursor: "pointer",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18), 0 2px 6px rgba(58,47,37,0.18)",
  fontWeight: 600,
};
const ghostBtn: React.CSSProperties = {
  padding: "4px 12px",
  background: "transparent",
  border: "1px solid var(--outline-variant)",
  borderRadius: 6,
  fontSize: 12,
  cursor: "pointer",
  color: "inherit",
};
const boardToolbar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 16px",
  background: "var(--surface)",
  borderBottom: "1px solid var(--outline-variant)",
  flexShrink: 0,
};
const kanban: React.CSSProperties = {
  display: "flex",
  gap: 16,
  padding: 16,
  overflowX: "auto",
  height: "100%",
  boxSizing: "border-box",
};
const columnStyle: React.CSSProperties = {
  minWidth: 260,
  width: 260,
  background: "var(--surface-container)",
  borderRadius: 12,
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};
const columnHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "4px 4px 8px",
};
const cardStyle: React.CSSProperties = {
  background: "var(--surface)",
  color: "var(--on-surface)",
  borderRadius: 10,
  padding: "10px 12px",
  border: "1px solid var(--outline-variant)",
  boxShadow: "0 1px 2px rgba(58,47,37,0.05)",
  position: "relative",
};
const addCardBtn: React.CSSProperties = {
  marginTop: 4,
  padding: "8px",
  background: "transparent",
  border: "1px dashed var(--outline-variant)",
  borderRadius: 6,
  color: "var(--on-surface-variant)",
  fontSize: 13,
  cursor: "pointer",
};
const moveSelect: React.CSSProperties = {
  width: 28,
  height: 22,
  border: "1px solid var(--outline-variant)",
  background: "var(--surface)",
  color: "var(--on-surface)",
  borderRadius: 4,
  fontSize: 11,
  cursor: "pointer",
  padding: 0,
  textAlign: "center",
};
const doneBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  border: "1px solid var(--outline-variant)",
  background: "var(--surface)",
  borderRadius: 14,
  cursor: "pointer",
  fontSize: 14,
  color: "var(--secondary)",
  flexShrink: 0,
};
const subtaskPill: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  fontSize: 11,
  background: "var(--surface-container)",
  borderRadius: 10,
  color: "var(--on-surface-variant)",
};
const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 240,
  padding: 12,
  border: "1px solid var(--outline-variant)",
  borderRadius: 8,
  fontFamily: "inherit",
  fontSize: 14,
  resize: "vertical",
  background: "var(--surface)",
  color: "var(--on-surface)",
};
const itemRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  background: "var(--surface)",
  borderRadius: 6,
  border: "1px solid var(--outline-variant)",
};
const errBox: React.CSSProperties = {
  margin: 16,
  padding: 12,
  background: "var(--error-container)",
  color: "var(--error)",
  borderRadius: 6,
  whiteSpace: "pre-wrap",
};
const weeklyBadge: React.CSSProperties = {
  padding: "4px 12px",
  background: "var(--secondary-container)",
  color: "var(--secondary)",
  borderRadius: 12,
  fontSize: 13,
  fontWeight: 500,
};
const urgentHero: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  padding: 20,
  background: "var(--surface)",
  borderRadius: 12,
  border: "1px solid var(--outline-variant)",
};
const tileGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
  gap: 12,
};
const tileCard: React.CSSProperties = {
  padding: "16px 20px",
  background: "var(--surface)",
  borderRadius: 12,
  // Longhand for the leading edge so per-tile `borderInlineStartColor`
  // overrides don't trigger React's shorthand/longhand conflict warning.
  borderBlockStart: "1px solid var(--outline-variant)",
  borderBlockEnd: "1px solid var(--outline-variant)",
  borderInlineEnd: "1px solid var(--outline-variant)",
  borderInlineStartWidth: 4,
  borderInlineStartStyle: "solid",
  borderInlineStartColor: "var(--primary)",
};
const innerTabs: React.CSSProperties = {
  display: "flex",
  gap: 4,
  borderBottom: "1px solid var(--outline-variant)",
  marginBottom: 16,
};
const innerTabBtn: React.CSSProperties = {
  padding: "8px 16px",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  font: "inherit",
  color: "var(--outline)",
  borderBottom: "2px solid transparent",
};
const innerTabBtnActive: React.CSSProperties = {
  color: "var(--on-surface)",
  fontWeight: 600,
  borderBottomColor: "var(--primary)",
};
const archiveRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 16px",
  background: "var(--surface)",
  borderRadius: 8,
  border: "1px solid var(--outline-variant)",
};
const restoreBtn: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 18,
  border: "1px solid var(--outline-variant)",
  background: "var(--surface)",
  cursor: "pointer",
  fontSize: 18,
  color: "var(--primary)",
};
const settingsCard: React.CSSProperties = {
  padding: 20,
  background: "var(--surface)",
  borderRadius: 12,
  border: "1px solid var(--outline-variant)",
  marginBottom: 12,
};
const sidebarItemBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 16px",
  border: "none",
  background: "transparent",
  cursor: "pointer",
  textAlign: "start",
  font: "inherit",
  color: "inherit",
  minWidth: 0,
};
const dialogBackdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "var(--scrim)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 200,
};
const dialogPanel: React.CSSProperties = {
  width: "90%",
  maxWidth: 400,
  background: "var(--surface)",
  color: "var(--on-surface)",
  borderRadius: 12,
  padding: 20,
  boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
  fontFamily: "'Heebo','Inter',system-ui,sans-serif",
};
const dialogInput: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid var(--outline-variant)",
  borderRadius: 6,
  fontFamily: "inherit",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
  background: "var(--surface)",
  color: "var(--on-surface)",
};
const typeChip: React.CSSProperties = {
  flex: 1,
  padding: "8px 12px",
  border: "1px solid var(--outline-variant)",
  borderRadius: 6,
  background: "var(--surface)",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 13,
  color: "var(--on-surface)",
};
const typeChipActive: React.CSSProperties = {
  background: "var(--selected)",
  border: "1px solid var(--primary)",
  color: "var(--on-surface)",
  fontWeight: 600,
};
const addColumnBtn: React.CSSProperties = {
  alignSelf: "flex-start",
  marginTop: 4,
  padding: "16px 24px",
  background: "transparent",
  border: "1px dashed var(--outline-variant)",
  borderRadius: 12,
  color: "var(--on-surface-variant)",
  fontSize: 14,
  cursor: "pointer",
  height: 50,
  minWidth: 120,
};
const urgentBadge: React.CSSProperties = {
  padding: "1px 6px",
  fontSize: 10,
  background: "var(--error-container)",
  color: "var(--error)",
  borderRadius: 8,
  marginInlineStart: 4,
  fontWeight: 600,
};
const addInputStyle: React.CSSProperties = {
  flex: 1,
  padding: "8px 10px",
  border: "1px solid var(--outline-variant)",
  borderRadius: 6,
  fontFamily: "inherit",
  fontSize: 14,
  outline: "none",
  background: "var(--surface)",
  color: "var(--on-surface)",
};
const inlineNoteInput: React.CSSProperties = {
  flex: 1,
  padding: "4px 6px",
  border: "1px solid var(--outline-variant)",
  borderRadius: 4,
  fontFamily: "inherit",
  fontSize: 14,
  outline: "none",
  background: "var(--surface)",
  color: "var(--on-surface)",
};
const sectionToggle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 4px",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 600,
  color: "var(--on-surface)",
  width: "100%",
  textAlign: "start",
};
const avatarFallback: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 24,
  background: "var(--selected)",
  color: "var(--primary)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 22,
  fontWeight: 600,
};
