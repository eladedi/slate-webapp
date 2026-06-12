import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import { ROLE_EDITOR, type Note, type NoteItem, type NoteType } from "../types";

const NOTES = "notes";

function docToObject<T>(snap: { id: string; data: () => any }): T {
  return { id: snap.id, ...snap.data() } as T;
}

const noteRef = (noteId: string) => doc(db, NOTES, noteId);

// -------------------- Reads --------------------

/** Active (non-archived) notes for a user. Archived filter is client-side
 *  to avoid needing a composite Firestore index. */
export function observeNotes(
  uid: string,
  onChange: (notes: Note[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, NOTES),
    where("memberIds", "array-contains", uid),
    orderBy("updatedAt", "desc"),
  );
  return onSnapshot(
    q,
    (snap) =>
      onChange(
        snap.docs.map((d) => docToObject<Note>(d)).filter((n) => n.archivedAt == null),
      ),
    onError,
  );
}

export function observeArchivedNotes(
  uid: string,
  onChange: (notes: Note[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, NOTES),
    where("memberIds", "array-contains", uid),
    orderBy("updatedAt", "desc"),
  );
  return onSnapshot(
    q,
    (snap) =>
      onChange(
        snap.docs.map((d) => docToObject<Note>(d)).filter((n) => n.archivedAt != null),
      ),
    onError,
  );
}

export function observeNote(
  noteId: string,
  onChange: (note: Note | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    noteRef(noteId),
    (snap) => onChange(snap.exists() ? docToObject<Note>(snap) : null),
    onError,
  );
}

// -------------------- Note CRUD --------------------

export async function createNote(
  name: string,
  type: NoteType,
  ownerUid: string,
): Promise<string> {
  const ref = doc(collection(db, NOTES));
  await setDoc(ref, {
    name,
    type,
    ownerId: ownerUid,
    members: [{ userId: ownerUid, role: ROLE_EDITOR }],
    memberIds: [ownerUid],
    content: "",
    items: [],
    archivedAt: null,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  return ref.id;
}

export const renameNote = (noteId: string, name: string) =>
  updateDoc(noteRef(noteId), { name, updatedAt: serverTimestamp() });

export const deleteNote = (noteId: string) => deleteDoc(noteRef(noteId));

export const archiveNote = (noteId: string) =>
  updateDoc(noteRef(noteId), { archivedAt: serverTimestamp(), updatedAt: serverTimestamp() });

export const restoreNote = (noteId: string) =>
  updateDoc(noteRef(noteId), { archivedAt: null, updatedAt: serverTimestamp() });

// -------------------- Free-text body --------------------

export const updateFreeTextContent = (noteId: string, content: string) =>
  updateDoc(noteRef(noteId), { content, updatedAt: serverTimestamp() });

export async function appendFreeText(noteId: string, text: string) {
  const ref = noteRef(noteId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const current = (snap.data() as Note).content ?? "";
  const newContent = current.length === 0 ? text : current + "\n" + text;
  await updateDoc(ref, { content: newContent, updatedAt: serverTimestamp() });
}

// -------------------- Items (checklist / bullets) --------------------

export async function addItem(noteId: string, text: string): Promise<string> {
  const item: NoteItem = { id: crypto.randomUUID(), text, checked: false };
  await updateDoc(noteRef(noteId), {
    items: arrayUnion(item),
    updatedAt: serverTimestamp(),
  });
  return item.id;
}

async function mutateItems(
  noteId: string,
  transform: (items: NoteItem[]) => NoteItem[],
) {
  const ref = noteRef(noteId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const next = transform((snap.data() as Note).items ?? []);
  await updateDoc(ref, { items: next, updatedAt: serverTimestamp() });
}

export const updateItem = (noteId: string, itemId: string, text: string, checked: boolean) =>
  mutateItems(noteId, (list) =>
    list.map((i) => (i.id === itemId ? { ...i, text, checked } : i)),
  );

export const toggleItem = (noteId: string, itemId: string) =>
  mutateItems(noteId, (list) =>
    list.map((i) => (i.id === itemId ? { ...i, checked: !i.checked } : i)),
  );

export const deleteItem = (noteId: string, itemId: string) =>
  mutateItems(noteId, (list) => list.filter((i) => i.id !== itemId));

export async function reorderItems(noteId: string, orderedIds: string[]) {
  await mutateItems(noteId, (current) => {
    const byId = new Map(current.map((i) => [i.id, i]));
    const reordered = orderedIds.map((id) => byId.get(id)).filter((x): x is NoteItem => !!x);
    return reordered.length === current.length ? reordered : current;
  });
}

// -------------------- Membership --------------------

export async function addNoteMember(noteId: string, uid: string, role: string = ROLE_EDITOR) {
  const ref = noteRef(noteId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const current = snap.data() as Note;
  if (current.memberIds?.includes(uid)) return;
  await updateDoc(ref, {
    memberIds: arrayUnion(uid),
    members: [...(current.members ?? []), { userId: uid, role }],
    updatedAt: serverTimestamp(),
  });
}

export async function selfJoinNote(noteId: string, uid: string, role: string = ROLE_EDITOR) {
  await updateDoc(noteRef(noteId), {
    memberIds: arrayUnion(uid),
    members: arrayUnion({ userId: uid, role }),
    updatedAt: serverTimestamp(),
  });
}
