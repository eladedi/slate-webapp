import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  RESOURCE_TYPE_BOARD,
  RESOURCE_TYPE_NOTE,
  type PendingInvite,
  type ResourceType,
  type ShareLink,
} from "../types";
import { addBoardMember, selfJoinBoard } from "./boardRepository";
import { addNoteMember, selfJoinNote } from "./noteRepository";
import { findUserByEmail } from "./userRepository";

const SHARE_LINKS = "shareLinks";
const PENDING_INVITES = "pendingInvites";

// -------------------- Share links --------------------

export function observeShareLink(
  linkId: string,
  onChange: (link: ShareLink | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, SHARE_LINKS, linkId),
    (snap) => onChange(snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as ShareLink) : null),
    onError,
  );
}

export async function getShareLink(linkId: string): Promise<ShareLink | null> {
  const snap = await getDoc(doc(db, SHARE_LINKS, linkId));
  return snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as ShareLink) : null;
}

export async function createShareLink(
  resourceType: ResourceType,
  resourceId: string,
  role: string,
  createdBy: string,
): Promise<string> {
  const ref = doc(collection(db, SHARE_LINKS));
  await setDoc(ref, {
    resourceType,
    resourceId,
    role,
    createdBy,
    createdAt: Timestamp.now(),
    expiresAt: null,
    usedBy: [],
  });
  return ref.id;
}

export interface Redemption {
  resourceType: ResourceType;
  resourceId: string;
}

/**
 * Redeem a share link: add the user as member with the link's role and mark
 * usedBy. Returns the resource pointer for navigation, or null if the link is
 * invalid/expired/the user is the creator (no-op).
 */
export async function redeemShareLink(linkId: string, uid: string): Promise<Redemption | null> {
  const link = await getShareLink(linkId);
  if (!link) return null;
  if (link.expiresAt && link.expiresAt.toMillis() < Date.now()) return null;

  if (link.createdBy !== uid) {
    if (link.resourceType === RESOURCE_TYPE_BOARD) {
      await addBoardMember(link.resourceId, uid, link.role);
    } else if (link.resourceType === RESOURCE_TYPE_NOTE) {
      await addNoteMember(link.resourceId, uid, link.role);
    }
    await updateDoc(doc(db, SHARE_LINKS, linkId), { usedBy: arrayUnion(uid) });
  }

  return { resourceType: link.resourceType, resourceId: link.resourceId };
}

// -------------------- Email invite --------------------

export type ShareByEmailResult =
  | { kind: "granted"; uid: string; displayName: string }
  | { kind: "pending" }
  | { kind: "invalidEmail" }
  | { kind: "selfInvite" }
  | { kind: "error"; message: string };

/**
 * Share a board/note with someone by email.
 *  - Path A: invitee already has a `users/{uid}` doc → addMember directly.
 *  - Path B: invitee not registered → queue a `pendingInvites/{autoId}`, which
 *    they'll consume on their next sign-in via consumePendingInvitesFor.
 */
export async function shareByEmail(
  resourceType: ResourceType,
  resourceId: string,
  resourceName: string,
  email: string,
  role: string,
  invitedBy: string,
): Promise<ShareByEmailResult> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) return { kind: "invalidEmail" };

  let existing: Awaited<ReturnType<typeof findUserByEmail>> = null;
  try {
    existing = await findUserByEmail(normalized);
  } catch {
    /* fall through to pending */
  }

  if (existing) {
    if (existing.uid === invitedBy) return { kind: "selfInvite" };
    try {
      if (resourceType === RESOURCE_TYPE_BOARD) await addBoardMember(resourceId, existing.uid, role);
      else await addNoteMember(resourceId, existing.uid, role);
      return {
        kind: "granted",
        uid: existing.uid,
        displayName: existing.displayName || existing.email,
      };
    } catch (e) {
      return { kind: "error", message: (e as Error).message || "addMember failed" };
    }
  }

  try {
    const ref = doc(collection(db, PENDING_INVITES));
    await setDoc(ref, {
      email: normalized,
      resourceType,
      resourceId,
      resourceName,
      role,
      invitedBy,
      invitedAt: Timestamp.now(),
    });
    return { kind: "pending" };
  } catch (e) {
    return { kind: "error", message: (e as Error).message || "pending invite failed" };
  }
}

/**
 * Best-effort consumer for pending invites on sign-in. Looks up invites for
 * this user's email, self-joins each resource, deletes the invite. Failures
 * per-invite are swallowed so one bad invite can't block the rest.
 *
 * Call this once after sign-in.
 */
export async function consumePendingInvitesFor(uid: string, email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;
  let snap;
  try {
    snap = await getDocs(query(collection(db, PENDING_INVITES), where("email", "==", normalized)));
  } catch {
    return;
  }
  for (const d of snap.docs) {
    const invite = { id: d.id, ...(d.data() as any) } as PendingInvite;
    try {
      if (invite.resourceType === RESOURCE_TYPE_BOARD) {
        await selfJoinBoard(invite.resourceId, uid, invite.role);
      } else {
        await selfJoinNote(invite.resourceId, uid, invite.role);
      }
      await deleteDoc(d.ref);
    } catch (e) {
      console.warn("[Slate] pending-invite consume failed", d.id, e);
    }
  }
}
