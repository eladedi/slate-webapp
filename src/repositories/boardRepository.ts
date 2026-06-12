import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  ROLE_EDITOR,
  type Board,
  type BoardColumn,
  type BoardMember,
  type Card,
  type CardStatus,
  type MoveDirection,
  type Subtask,
} from "../types";
import { DEFAULT_BOARD_COLOR, DEFAULT_BOARDS, DEFAULT_COLUMNS } from "../seedDefaults";

const BOARDS = "boards";
const COLUMNS = "columns";
const CARDS = "cards";

function docToObject<T>(snap: { id: string; data: () => any }): T {
  return { id: snap.id, ...snap.data() } as T;
}

const cardRef = (boardId: string, columnId: string, cardId: string) =>
  doc(db, BOARDS, boardId, COLUMNS, columnId, CARDS, cardId);

const colRef = (boardId: string, columnId: string) =>
  doc(db, BOARDS, boardId, COLUMNS, columnId);

// -------------------- Reads --------------------

export function observeBoards(
  uid: string,
  onChange: (boards: Board[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, BOARDS),
    where("memberIds", "array-contains", uid),
    orderBy("updatedAt", "desc"),
  );
  return onSnapshot(q, (snap) => onChange(snap.docs.map((d) => docToObject<Board>(d))), onError);
}

export function observeBoard(
  boardId: string,
  onChange: (board: Board | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, BOARDS, boardId),
    (snap) => onChange(snap.exists() ? docToObject<Board>(snap) : null),
    onError,
  );
}

export function observeColumns(
  boardId: string,
  onChange: (columns: BoardColumn[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(collection(db, BOARDS, boardId, COLUMNS), orderBy("order", "asc"));
  return onSnapshot(q, (snap) => onChange(snap.docs.map((d) => docToObject<BoardColumn>(d))), onError);
}

export function observeCards(
  boardId: string,
  columnId: string,
  onChange: (cards: Card[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, BOARDS, boardId, COLUMNS, columnId, CARDS),
    orderBy("order", "asc"),
  );
  return onSnapshot(
    q,
    (snap) => {
      const cards = snap.docs.map((d) => docToObject<Card>(d)).filter((c) => c.status === "active");
      onChange(cards);
    },
    onError,
  );
}

export interface ArchivedCard {
  card: Card;
  boardId: string;
  columnId: string;
}

/**
 * All archived cards (status != "active") across every column of every board
 * the user is a member of. The Android version uses nested flatMapLatest+
 * combine; we do the same shape with a manual reaggregator keyed on
 * boardId/columnId.
 */
export function observeAllArchivedCards(
  uid: string,
  onChange: (cards: ArchivedCard[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const boardsQ = query(
    collection(db, BOARDS),
    where("memberIds", "array-contains", uid),
  );
  const colUnsubs = new Map<string, Unsubscribe>(); // key = boardId
  const cardUnsubs = new Map<string, Unsubscribe>(); // key = boardId/columnId
  const buckets = new Map<string, ArchivedCard[]>(); // key = boardId/columnId

  function emit() {
    const flat: ArchivedCard[] = [];
    for (const arr of buckets.values()) flat.push(...arr);
    flat.sort((a, b) => {
      const ta = a.card.archivedAt?.toMillis() ?? 0;
      const tb = b.card.archivedAt?.toMillis() ?? 0;
      return tb - ta;
    });
    onChange(flat);
  }

  const stopBoards = onSnapshot(
    boardsQ,
    (snap) => {
      const seenBoards = new Set<string>();
      snap.docs.forEach((d) => {
        const boardId = d.id;
        seenBoards.add(boardId);
        if (colUnsubs.has(boardId)) return;
        const stopCols = onSnapshot(
          collection(db, BOARDS, boardId, COLUMNS),
          (colSnap) => {
            const seenCols = new Set<string>();
            colSnap.docs.forEach((c) => {
              const columnId = c.id;
              const key = `${boardId}/${columnId}`;
              seenCols.add(key);
              if (cardUnsubs.has(key)) return;
              const stopCards = onSnapshot(
                collection(db, BOARDS, boardId, COLUMNS, columnId, CARDS),
                (cardSnap) => {
                  const archived = cardSnap.docs
                    .map((cd) => docToObject<Card>(cd))
                    .filter((card) => card.status !== "active")
                    .map<ArchivedCard>((card) => ({ card, boardId, columnId }));
                  buckets.set(key, archived);
                  emit();
                },
                onError,
              );
              cardUnsubs.set(key, stopCards);
            });
            // unsubscribe from columns that no longer exist
            for (const [key, stop] of cardUnsubs) {
              if (key.startsWith(`${boardId}/`) && !seenCols.has(key)) {
                stop();
                cardUnsubs.delete(key);
                buckets.delete(key);
              }
            }
            emit();
          },
          onError,
        );
        colUnsubs.set(boardId, stopCols);
      });
      // unsubscribe from boards the user is no longer a member of
      for (const [boardId, stop] of colUnsubs) {
        if (!seenBoards.has(boardId)) {
          stop();
          colUnsubs.delete(boardId);
          for (const [k, cstop] of cardUnsubs) {
            if (k.startsWith(`${boardId}/`)) {
              cstop();
              cardUnsubs.delete(k);
              buckets.delete(k);
            }
          }
        }
      }
      emit();
    },
    onError,
  );

  return () => {
    stopBoards();
    for (const s of colUnsubs.values()) s();
    for (const s of cardUnsubs.values()) s();
    colUnsubs.clear();
    cardUnsubs.clear();
    buckets.clear();
  };
}

/**
 * Count of cards the user has completed since start-of-week (local Sunday 00:00).
 * Mirrors observeMyWeeklyCompletions in the Android repo. Uses the same per-board
 * fan-out the archive flow uses to avoid needing a collectionGroup index.
 */
export function observeMyWeeklyCompletions(
  uid: string,
  onChange: (count: number) => void,
): Unsubscribe {
  const startOfWeek = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay()); // Sunday = 0
    return d.getTime();
  })();
  return observeAllArchivedCards(uid, (archived) => {
    const count = archived.filter((a) => {
      const c = a.card;
      return (
        c.status === "completed" &&
        c.completedBy === uid &&
        (c.completedAt?.toMillis() ?? 0) >= startOfWeek
      );
    }).length;
    onChange(count);
  });
}

export interface UrgentCard {
  boardId: string;
  columnId: string;
  card: Card;
}

/**
 * Per-board urgent cards: the actual active cards inside each board's
 * `urgentColumnId`. Returns map of boardId -> ordered card list. Same fan-out
 * shape as `observeUrgentCountsPerBoard` (which it could be derived from, but
 * keeping it separate avoids a double read per snapshot).
 */
export function observeUrgentCardsPerBoard(
  uid: string,
  onChange: (cardsByBoard: Map<string, UrgentCard[]>) => void,
): Unsubscribe {
  const boardsQ = query(
    collection(db, BOARDS),
    where("memberIds", "array-contains", uid),
  );
  const cardsByBoard = new Map<string, UrgentCard[]>();
  const urgentUnsubs = new Map<string, Unsubscribe>();

  function emit() {
    onChange(new Map(cardsByBoard));
  }

  const stopBoards = onSnapshot(boardsQ, (snap) => {
    const seen = new Set<string>();
    snap.docs.forEach((d) => {
      const boardId = d.id;
      const data = d.data() as Board;
      const urgentColId = data.urgentColumnId ?? null;
      seen.add(boardId);
      const existing = urgentUnsubs.get(boardId);
      if (existing) {
        existing();
        urgentUnsubs.delete(boardId);
      }
      if (!urgentColId) {
        cardsByBoard.set(boardId, []);
        emit();
        return;
      }
      const stop = onSnapshot(
        query(
          collection(db, BOARDS, boardId, COLUMNS, urgentColId, CARDS),
          orderBy("order", "asc"),
        ),
        (cs) => {
          const cards = cs.docs
            .map((cd) => docToObject<Card>(cd))
            .filter((c) => c.status === "active")
            .map<UrgentCard>((card) => ({ boardId, columnId: urgentColId, card }));
          cardsByBoard.set(boardId, cards);
          emit();
        },
      );
      urgentUnsubs.set(boardId, stop);
    });
    for (const [bId, stop] of urgentUnsubs) {
      if (!seen.has(bId)) {
        stop();
        urgentUnsubs.delete(bId);
        cardsByBoard.delete(bId);
      }
    }
    emit();
  });

  return () => {
    stopBoards();
    for (const s of urgentUnsubs.values()) s();
    urgentUnsubs.clear();
    cardsByBoard.clear();
  };
}

/**
 * Per-board urgent count: number of active cards in each board's urgentColumnId.
 * Returns map of boardId -> count. Updates whenever any urgent column's cards
 * change. Skips boards without urgentColumnId.
 */
export function observeUrgentCountsPerBoard(
  uid: string,
  onChange: (counts: Map<string, number>) => void,
): Unsubscribe {
  const boardsQ = query(
    collection(db, BOARDS),
    where("memberIds", "array-contains", uid),
  );
  const counts = new Map<string, number>();
  const urgentUnsubs = new Map<string, Unsubscribe>(); // boardId -> unsub on its urgent column

  function emit() {
    onChange(new Map(counts));
  }

  const stopBoards = onSnapshot(boardsQ, (snap) => {
    const seen = new Set<string>();
    snap.docs.forEach((d) => {
      const boardId = d.id;
      const data = d.data() as Board;
      const urgentColId = data.urgentColumnId ?? null;
      seen.add(boardId);
      // re-subscribe if column changed
      const existing = urgentUnsubs.get(boardId);
      if (existing) {
        existing();
        urgentUnsubs.delete(boardId);
      }
      if (!urgentColId) {
        counts.set(boardId, 0);
        emit();
        return;
      }
      const stop = onSnapshot(
        collection(db, BOARDS, boardId, COLUMNS, urgentColId, CARDS),
        (cs) => {
          const n = cs.docs
            .map((cd) => docToObject<Card>(cd))
            .filter((c) => c.status === "active").length;
          counts.set(boardId, n);
          emit();
        },
      );
      urgentUnsubs.set(boardId, stop);
    });
    for (const [bId, stop] of urgentUnsubs) {
      if (!seen.has(bId)) {
        stop();
        urgentUnsubs.delete(bId);
        counts.delete(bId);
      }
    }
    emit();
  });

  return () => {
    stopBoards();
    for (const s of urgentUnsubs.values()) s();
    urgentUnsubs.clear();
    counts.clear();
  };
}

// -------------------- Writes --------------------

async function touchBoard(boardId: string) {
  try {
    await updateDoc(doc(db, BOARDS, boardId), { updatedAt: serverTimestamp() });
  } catch {
    /* best-effort */
  }
}

async function bumpActiveCardCount(boardId: string, delta: number) {
  try {
    await updateDoc(doc(db, BOARDS, boardId), { activeCardCount: increment(delta) });
  } catch {
    /* best-effort */
  }
}

/**
 * Create a card. Auto-assigns to creator (rules require createdBy == assigneeId
 * on create). Writes both legacy single field and new array for compatibility.
 */
export async function createCard(
  boardId: string,
  columnId: string,
  title: string,
  description: string,
  createdBy: string,
): Promise<string> {
  const newCardRef = doc(collection(db, BOARDS, boardId, COLUMNS, columnId, CARDS));
  const card = {
    title,
    description,
    order: Date.now(),
    status: "active" as CardStatus,
    archivedAt: null,
    createdAt: Timestamp.now(),
    createdBy,
    assigneeId: createdBy,
    assigneeIds: [createdBy],
    subtasks: [],
    linkedNoteIds: [],
    completedAt: null,
    completedBy: null,
  };
  await setDoc(newCardRef, card);
  await updateDoc(colRef(boardId, columnId), { cardOrder: arrayUnion(newCardRef.id) });
  await bumpActiveCardCount(boardId, +1);
  await touchBoard(boardId);
  return newCardRef.id;
}

export async function updateCard(
  boardId: string,
  columnId: string,
  cardId: string,
  title: string,
  description: string,
) {
  await updateDoc(cardRef(boardId, columnId, cardId), { title, description });
  await touchBoard(boardId);
}

export async function deleteCard(boardId: string, columnId: string, cardId: string) {
  const ref = cardRef(boardId, columnId, cardId);
  const snap = await getDoc(ref);
  const wasActive = snap.exists() && (snap.data() as Card).status === "active";
  await deleteDoc(ref);
  await updateDoc(colRef(boardId, columnId), { cardOrder: arrayRemove(cardId) });
  if (wasActive) await bumpActiveCardCount(boardId, -1);
  await touchBoard(boardId);
}

/** Change a card's status. Manages archivedAt/completedAt and counter deltas. */
export async function setCardStatus(
  boardId: string,
  columnId: string,
  cardId: string,
  status: CardStatus,
  currentUid: string,
) {
  const ref = cardRef(boardId, columnId, cardId);
  const before = await getDoc(ref);
  const wasActive = before.exists() && (before.data() as Card).status === "active";
  await updateDoc(ref, {
    status,
    archivedAt: status === "active" ? null : serverTimestamp(),
    completedAt: status === "completed" ? serverTimestamp() : null,
    completedBy: status === "completed" ? currentUid : null,
  });
  const nowActive = status === "active";
  if (wasActive && !nowActive) await bumpActiveCardCount(boardId, -1);
  else if (!wasActive && nowActive) await bumpActiveCardCount(boardId, +1);
  await touchBoard(boardId);
}

export const restoreCard = (boardId: string, columnId: string, cardId: string, uid: string) =>
  setCardStatus(boardId, columnId, cardId, "active", uid);

// -------------------- Assignees --------------------

export async function setCardAssignees(
  boardId: string,
  columnId: string,
  cardId: string,
  assigneeIds: string[],
) {
  await updateDoc(cardRef(boardId, columnId, cardId), {
    assigneeIds,
    assigneeId: assigneeIds[0] ?? "",
  });
}

export const setCardAssignee = (boardId: string, columnId: string, cardId: string, assigneeId: string) =>
  setCardAssignees(boardId, columnId, cardId, assigneeId ? [assigneeId] : []);

// -------------------- Linked notes --------------------

export async function addLinkedNote(
  boardId: string,
  columnId: string,
  cardId: string,
  noteId: string,
) {
  await updateDoc(cardRef(boardId, columnId, cardId), { linkedNoteIds: arrayUnion(noteId) });
}

export async function removeLinkedNote(
  boardId: string,
  columnId: string,
  cardId: string,
  noteId: string,
) {
  await updateDoc(cardRef(boardId, columnId, cardId), { linkedNoteIds: arrayRemove(noteId) });
}

// -------------------- Subtasks (RMW) --------------------
//
// Firestore can't address array elements by id, so each mutation does
// read-modify-write of the whole subtasks list. The cards `update` rule
// already gates by creator/assignee.

async function mutateSubtasks(
  boardId: string,
  columnId: string,
  cardId: string,
  transform: (list: Subtask[]) => Subtask[],
) {
  const ref = cardRef(boardId, columnId, cardId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const current = (snap.data() as Card).subtasks ?? [];
  const next = transform(current);
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  await updateDoc(ref, { subtasks: next });
}

export async function addSubtask(
  boardId: string,
  columnId: string,
  cardId: string,
  title: string,
  description = "",
): Promise<string> {
  const id = crypto.randomUUID();
  await mutateSubtasks(boardId, columnId, cardId, (list) => [
    ...list,
    { id, title, description, done: false },
  ]);
  return id;
}

export const updateSubtask = (
  boardId: string,
  columnId: string,
  cardId: string,
  subtaskId: string,
  title: string,
  description: string,
) =>
  mutateSubtasks(boardId, columnId, cardId, (list) =>
    list.map((s) => (s.id === subtaskId ? { ...s, title, description } : s)),
  );

export const setSubtaskDone = (
  boardId: string,
  columnId: string,
  cardId: string,
  subtaskId: string,
  done: boolean,
) =>
  mutateSubtasks(boardId, columnId, cardId, (list) =>
    list.map((s) => (s.id === subtaskId ? { ...s, done } : s)),
  );

export const deleteSubtask = (
  boardId: string,
  columnId: string,
  cardId: string,
  subtaskId: string,
) =>
  mutateSubtasks(boardId, columnId, cardId, (list) => list.filter((s) => s.id !== subtaskId));

// -------------------- First-launch seeding --------------------

/**
 * On the user's first sign-in, create the 4 default boards (each with the 4
 * default columns). Lock is `users/{uid}.seededAt` set inside a transaction —
 * second concurrent caller reads it non-null and bails. Mirrors Android
 * `BoardRepository.seedDefaultsIfNeeded` (rampup §9).
 *
 * Safe to call on every sign-in.
 */
export async function seedDefaultsIfNeeded(uid: string): Promise<void> {
  const userRef = doc(db, "users", uid);
  const shouldSeed = await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    if (snap.exists() && (snap.data() as any).seededAt) return false;
    tx.set(userRef, { seededAt: serverTimestamp() }, { merge: true });
    return true;
  });
  if (!shouldSeed) return;
  for (const def of DEFAULT_BOARDS) {
    try {
      await createBoard(def.name, uid, def.color);
    } catch (e) {
      console.warn("[Slate] seedDefaultsIfNeeded: createBoard failed", def.name, e);
    }
  }
}

// -------------------- Board CRUD --------------------

const boardDocRef = (boardId: string) => doc(db, BOARDS, boardId);

/**
 * Create a new board with the 4 default columns pre-filled.
 * Critical ordering: write the board doc FIRST so the column-create rules can
 * verify membership via get(/boards/$boardId) — see Android §9 in the rampup.
 */
export async function createBoard(name: string, ownerUid: string, color = DEFAULT_BOARD_COLOR): Promise<string> {
  const newBoardRef = doc(collection(db, BOARDS));
  const colRefs = DEFAULT_COLUMNS.map(() => doc(collection(db, BOARDS, newBoardRef.id, COLUMNS)));
  const columnIds = colRefs.map((r) => r.id);
  const firstColumnId = columnIds[0] ?? null;
  const now = Timestamp.now();

  await setDoc(newBoardRef, {
    name,
    ownerId: ownerUid,
    members: [{ userId: ownerUid, role: ROLE_EDITOR }],
    memberIds: [ownerUid],
    columnOrder: columnIds,
    activeCardCount: 0,
    color,
    urgentColumnId: firstColumnId,
    createdAt: now,
    updatedAt: now,
  });

  for (let i = 0; i < DEFAULT_COLUMNS.length; i++) {
    const def = DEFAULT_COLUMNS[i]!;
    await setDoc(colRefs[i]!, {
      name: def.name,
      order: (i + 1) * 1000,
      color: def.color,
      cardOrder: [],
    });
  }

  return newBoardRef.id;
}

export const renameBoard = (boardId: string, name: string) =>
  updateDoc(boardDocRef(boardId), { name, updatedAt: serverTimestamp() });

export const setBoardColor = (boardId: string, color: string) =>
  updateDoc(boardDocRef(boardId), { color, updatedAt: serverTimestamp() });

export const setUrgentColumn = (boardId: string, urgentColumnId: string | null) =>
  updateDoc(boardDocRef(boardId), { urgentColumnId, updatedAt: serverTimestamp() });

/**
 * Cascade-delete a board and its columns + cards. No native cascade in Firestore;
 * we walk client-side. Owner-only (rules check ownerId == request.auth.uid).
 */
export async function deleteBoard(boardId: string) {
  const boardRef = boardDocRef(boardId);
  const cols = await getDocs(collection(db, BOARDS, boardId, COLUMNS));
  for (const col of cols.docs) {
    const cards = await getDocs(collection(col.ref, CARDS));
    for (const c of cards.docs) await deleteDoc(c.ref);
    await deleteDoc(col.ref);
  }
  await deleteDoc(boardRef);
}

// -------------------- Column CRUD --------------------

export async function createColumn(boardId: string, name: string, color = ""): Promise<string> {
  const newColRef = doc(collection(db, BOARDS, boardId, COLUMNS));
  await setDoc(newColRef, {
    name,
    order: Date.now(),
    color,
    cardOrder: [],
  });
  await updateDoc(boardDocRef(boardId), {
    columnOrder: arrayUnion(newColRef.id),
    updatedAt: serverTimestamp(),
  });
  return newColRef.id;
}

export async function renameColumn(boardId: string, columnId: string, name: string) {
  await updateDoc(colRef(boardId, columnId), { name });
  await touchBoard(boardId);
}

export async function setColumnColor(boardId: string, columnId: string, color: string) {
  await updateDoc(colRef(boardId, columnId), { color });
  await touchBoard(boardId);
}

/**
 * Delete a column: cascade-delete its cards, then the column doc, then clean up
 * the board's columnOrder array and unset urgentColumnId if it pointed here.
 */
export async function deleteColumn(boardId: string, columnId: string) {
  const cards = await getDocs(collection(db, BOARDS, boardId, COLUMNS, columnId, CARDS));
  for (const c of cards.docs) await deleteDoc(c.ref);
  await deleteDoc(colRef(boardId, columnId));

  const boardSnap = await getDoc(boardDocRef(boardId));
  const wasUrgent = boardSnap.exists() && (boardSnap.data() as Board).urgentColumnId === columnId;
  const updates: Record<string, unknown> = {
    columnOrder: arrayRemove(columnId),
    updatedAt: serverTimestamp(),
  };
  if (wasUrgent) updates.urgentColumnId = null;
  await updateDoc(boardDocRef(boardId), updates);
}

// -------------------- Membership --------------------

export async function addBoardMember(boardId: string, uid: string, role: string = ROLE_EDITOR) {
  const ref = boardDocRef(boardId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const current = snap.data() as Board;
  if (current.memberIds?.includes(uid)) return;
  const updatedMembers: BoardMember[] = [...(current.members ?? []), { userId: uid, role }];
  await updateDoc(ref, {
    memberIds: arrayUnion(uid),
    members: updatedMembers,
    updatedAt: serverTimestamp(),
  });
}

/** Self-join path for pendingInvites consumption — bounded diff so the rules'
 *  isSelfJoining carve-out permits it. */
export async function selfJoinBoard(boardId: string, uid: string, role: string = ROLE_EDITOR) {
  await updateDoc(boardDocRef(boardId), {
    memberIds: arrayUnion(uid),
    members: arrayUnion({ userId: uid, role }),
    updatedAt: serverTimestamp(),
  });
}

// -------------------- Cross-column / cross-board moves --------------------

export async function moveCardToColumn(
  boardId: string,
  fromColumnId: string,
  toColumnId: string,
  cardId: string,
) {
  if (fromColumnId === toColumnId) return;
  const fromColRef = colRef(boardId, fromColumnId);
  const toColRef = colRef(boardId, toColumnId);
  const source = cardRef(boardId, fromColumnId, cardId);
  const snap = await getDoc(source);
  if (!snap.exists()) return;
  const card = snap.data() as Card;
  const newCardRef = cardRef(boardId, toColumnId, cardId);
  const moved = { ...card, order: Date.now() };
  const batch = writeBatch(db);
  batch.set(newCardRef, moved);
  batch.delete(source);
  batch.update(fromColRef, { cardOrder: arrayRemove(cardId) });
  batch.update(toColRef, { cardOrder: arrayUnion(cardId) });
  batch.update(boardDocRef(boardId), { updatedAt: serverTimestamp() });
  await batch.commit();
}

export async function moveCardBetweenBoards(
  fromBoardId: string,
  fromColumnId: string,
  cardId: string,
  toBoardId: string,
  toColumnId: string,
) {
  if (fromBoardId === toBoardId && fromColumnId === toColumnId) return;
  const source = cardRef(fromBoardId, fromColumnId, cardId);
  const snap = await getDoc(source);
  if (!snap.exists()) return;
  const card = snap.data() as Card;
  const newCardRef = cardRef(toBoardId, toColumnId, cardId);
  const moved = { ...card, order: Date.now() };
  const batch = writeBatch(db);
  batch.set(newCardRef, moved);
  batch.delete(source);
  batch.update(colRef(fromBoardId, fromColumnId), { cardOrder: arrayRemove(cardId) });
  batch.update(colRef(toBoardId, toColumnId), { cardOrder: arrayUnion(cardId) });
  batch.update(boardDocRef(fromBoardId), { updatedAt: serverTimestamp() });
  batch.update(boardDocRef(toBoardId), { updatedAt: serverTimestamp() });
  if (card.status === "active") {
    batch.update(boardDocRef(fromBoardId), { activeCardCount: increment(-1) });
    batch.update(boardDocRef(toBoardId), { activeCardCount: increment(1) });
  }
  await batch.commit();
}

export async function moveCardWithinColumn(
  boardId: string,
  columnId: string,
  cardId: string,
  direction: MoveDirection,
) {
  const q = query(
    collection(db, BOARDS, boardId, COLUMNS, columnId, CARDS),
    orderBy("order", "asc"),
  );
  const snap = await getDocs(q);
  const cards = snap.docs
    .map((d) => docToObject<Card>(d))
    .filter((c) => c.status === "active");
  const idx = cards.findIndex((c) => c.id === cardId);
  if (idx < 0) return;
  const partner = direction === "up" ? cards[idx - 1] : cards[idx + 1];
  if (!partner) return;
  const current = cards[idx]!;
  const batch = writeBatch(db);
  batch.update(cardRef(boardId, columnId, current.id), { order: partner.order });
  batch.update(cardRef(boardId, columnId, partner.id), { order: current.order });
  await batch.commit();
  await touchBoard(boardId);
}

/** Swap a column with its neighbour by exchanging `order`. dir "up" = previous
 *  in array (visually leading edge in RTL), "down" = next. */
export async function moveColumn(
  boardId: string,
  columnId: string,
  direction: MoveDirection,
) {
  const snap = await getDocs(
    query(collection(db, BOARDS, boardId, COLUMNS), orderBy("order", "asc")),
  );
  const cols = snap.docs.map((d) => docToObject<BoardColumn>(d));
  const idx = cols.findIndex((c) => c.id === columnId);
  if (idx < 0) return;
  const partner = direction === "up" ? cols[idx - 1] : cols[idx + 1];
  if (!partner) return;
  const current = cols[idx]!;
  const batch = writeBatch(db);
  batch.update(colRef(boardId, current.id), { order: partner.order });
  batch.update(colRef(boardId, partner.id), { order: current.order });
  await batch.commit();
  await touchBoard(boardId);
}

/** Drag-drop commit: rewrite every card's `order` to 1000, 2000, … */
export async function reorderCardsInColumn(
  boardId: string,
  columnId: string,
  orderedCardIds: string[],
) {
  if (orderedCardIds.length === 0) return;
  const batch = writeBatch(db);
  orderedCardIds.forEach((id, idx) => {
    batch.update(cardRef(boardId, columnId, id), { order: (idx + 1) * 1000 });
  });
  batch.update(colRef(boardId, columnId), { cardOrder: orderedCardIds });
  await batch.commit();
  await touchBoard(boardId);
}
