import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import type { User as FirebaseUser } from "firebase/auth";
import { db } from "../firebase";
import type { User } from "../types";

const USERS = "users";

function snapToUser(uid: string, data: any): User {
  return {
    uid,
    email: (data?.email ?? "") as string,
    displayName: (data?.displayName ?? "") as string,
    photoUrl: (data?.photoUrl ?? null) as string | null,
  };
}

export function observeUser(
  uid: string,
  onChange: (user: User | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, USERS, uid),
    (snap) => onChange(snap.exists() ? snapToUser(snap.id, snap.data()) : null),
    onError,
  );
}

export async function getUser(uid: string): Promise<User | null> {
  const snap = await getDoc(doc(db, USERS, uid));
  return snap.exists() ? snapToUser(snap.id, snap.data()) : null;
}

/**
 * Upsert the signed-in user's profile doc. Mirrors `AuthRepository` on Android:
 * email is stored lowercased so `findUserByEmail` (and pendingInvites email
 * matching) works regardless of how the inviter typed it. Safe to call on
 * every sign-in — `setDoc({merge: true})` won't clobber unrelated fields like
 * `seededAt`.
 */
export async function upsertUserProfile(user: FirebaseUser): Promise<void> {
  if (!user.uid) return;
  await setDoc(
    doc(db, USERS, user.uid),
    {
      email: (user.email ?? "").toLowerCase(),
      displayName: user.displayName ?? "",
      photoUrl: user.photoURL ?? null,
    },
    { merge: true },
  );
}

// -------------------- markedUrgentCardIds --------------------
//
// User-flagged urgent cards live on `users/{uid}.markedUrgentCardIds: string[]`
// so the flag syncs across devices (was localStorage before — per-device only).
// The cards `update` rule isn't touched: only the user themself reads/writes
// this field, and `users/{uid}` already allows self-write.
//
// NOTE: Android currently writes the same concept to DataStore (per-device).
// For full cross-device parity, mobile needs a parallel migration to write
// `users/{uid}.markedUrgentCardIds` instead. Documented in §34 follow-up.

export function observeMarkedUrgentCardIds(
  uid: string,
  onChange: (cardIds: string[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, USERS, uid),
    (snap) => {
      const data = snap.data() as { markedUrgentCardIds?: unknown } | undefined;
      const raw = data?.markedUrgentCardIds;
      onChange(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : []);
    },
    onError,
  );
}

export async function setCardMarkedUrgent(uid: string, cardId: string, marked: boolean) {
  await updateDoc(doc(db, USERS, uid), {
    markedUrgentCardIds: marked ? arrayUnion(cardId) : arrayRemove(cardId),
  });
}

/** Case-insensitive email lookup. Mirrors `findUserByEmail` in Android. */
export async function findUserByEmail(email: string): Promise<User | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const q = query(collection(db, USERS), where("email", "==", normalized), limit(1));
  const snap = await getDocs(q);
  const doc0 = snap.docs[0];
  if (!doc0) return null;
  return snapToUser(doc0.id, doc0.data());
}
