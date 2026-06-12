import type { Timestamp } from "firebase/firestore";

export type CardStatus = "active" | "completed" | "irrelevant";

export const ROLE_EDITOR = "editor";
export const ROLE_VIEWER = "viewer";

export interface BoardMember {
  userId: string;
  role: string;
}

export interface Board {
  id: string;
  name: string;
  ownerId: string;
  members: BoardMember[];
  memberIds: string[];
  columnOrder: string[];
  activeCardCount: number;
  color: string;
  urgentColumnId: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface BoardColumn {
  id: string;
  name: string;
  order: number;
  color: string;
  cardOrder: string[];
}

export interface Subtask {
  id: string;
  title: string;
  description: string;
  done: boolean;
}

export interface Card {
  id: string;
  title: string;
  description: string;
  order: number;
  status: CardStatus;
  archivedAt: Timestamp | null;
  createdAt: Timestamp;
  createdBy: string;
  assigneeId: string;
  assigneeIds: string[];
  subtasks: Subtask[];
  linkedNoteIds: string[];
  completedAt: Timestamp | null;
  completedBy: string | null;
}

/** Mirror of Kotlin Card.effectiveAssignees — prefer the new array, fall back
 *  to the legacy single field. `assigneeIds` may be missing entirely on cards
 *  created before that field landed, so guard with optional chaining. */
export function effectiveAssignees(card: Card): string[] {
  if (card.assigneeIds && card.assigneeIds.length > 0) return card.assigneeIds;
  return card.assigneeId ? [card.assigneeId] : [];
}

// -------------------- Notes --------------------

export const NOTE_TYPE_CHECKLIST = "checklist";
export const NOTE_TYPE_BULLETS = "bullets";
export const NOTE_TYPE_FREE_TEXT = "free_text";

export type NoteType =
  | typeof NOTE_TYPE_CHECKLIST
  | typeof NOTE_TYPE_BULLETS
  | typeof NOTE_TYPE_FREE_TEXT;

export interface NoteItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface Note {
  id: string;
  name: string;
  type: NoteType;
  ownerId: string;
  members: BoardMember[];
  memberIds: string[];
  content: string;
  items: NoteItem[];
  archivedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export const isItemBasedNote = (type: NoteType) =>
  type === NOTE_TYPE_CHECKLIST || type === NOTE_TYPE_BULLETS;

// -------------------- Users / Sharing --------------------

export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoUrl: string | null;
}

export const RESOURCE_TYPE_BOARD = "board";
export const RESOURCE_TYPE_NOTE = "note";
export type ResourceType = typeof RESOURCE_TYPE_BOARD | typeof RESOURCE_TYPE_NOTE;

export interface ShareLink {
  id: string;
  resourceType: ResourceType;
  resourceId: string;
  role: string;
  createdBy: string;
  createdAt: Timestamp;
  expiresAt: Timestamp | null;
  usedBy: string[];
}

export interface PendingInvite {
  id: string;
  email: string;
  resourceType: ResourceType;
  resourceId: string;
  resourceName: string;
  role: string;
  invitedBy: string;
  invitedAt: Timestamp;
}

export type MoveDirection = "up" | "down";
