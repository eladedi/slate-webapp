import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { db } from "../firebase";
import {
  addLinkedNote,
  createBoard,
  createCard,
  moveCardBetweenBoards,
  moveCardToColumn,
  setCardStatus,
} from "../repositories/boardRepository";
import {
  addItem,
  appendFreeText,
  createNote,
  deleteItem,
  observeNote,
  updateFreeTextContent,
} from "../repositories/noteRepository";
import {
  capabilityAllows,
  type AssistantAction,
  type AssistantCapabilities,
  type AssistantUndoTarget,
  type ChatTurn,
} from "./assistantModels";
import { generate } from "./assistantApiClient";
import { assistantSettings } from "./assistantSettings";

/** Build the boards/notes context JSON the model sees each turn. */
async function buildContext(uid: string): Promise<string> {
  const boardsSnap = await getDocs(
    query(collection(db, "boards"), where("memberIds", "array-contains", uid)),
  );
  const boards = [];
  for (const b of boardsSnap.docs) {
    const data = b.data() as any;
    const colsSnap = await getDocs(
      query(collection(db, "boards", b.id, "columns"), orderBy("order", "asc")),
    );
    const columns = [];
    for (const c of colsSnap.docs) {
      const cardsSnap = await getDocs(
        query(
          collection(db, "boards", b.id, "columns", c.id, "cards"),
          orderBy("order", "asc"),
        ),
      );
      const cards = cardsSnap.docs
        .map((cd) => ({ id: cd.id, ...(cd.data() as any) }))
        .filter((cd: any) => cd.status === "active")
        .slice(0, 10)
        .map((cd: any) => ({ id: cd.id, title: cd.title }));
      columns.push({ id: c.id, name: (c.data() as any).name, cards });
    }
    boards.push({
      id: b.id,
      name: data.name,
      ...(data.urgentColumnId ? { urgentColumnId: data.urgentColumnId } : {}),
      columns,
    });
  }

  const notesSnap = await getDocs(
    query(collection(db, "notes"), where("memberIds", "array-contains", uid)),
  );
  const notes = notesSnap.docs
    .map((n) => ({ id: n.id, ...(n.data() as any) }))
    .filter((n: any) => n.archivedAt == null)
    .map((n: any) => ({
      id: n.id,
      name: n.name,
      type: n.type,
      ...(n.type === "checklist" || n.type === "bullets"
        ? { items: (n.items ?? []).slice(0, 10).map((i: any) => i.text) }
        : {}),
    }));

  return JSON.stringify({ boards, notes });
}

function buildSystemPrompt(
  instructions: string,
  contextJson: string,
  caps: AssistantCapabilities,
): string {
  const kinds: string[] = [];
  const fields: string[] = [];
  if (caps.insertCard) {
    kinds.push("INSERT_CARD");
    fields.push("- INSERT_CARD → boardId, columnId, title (required); description (optional)");
  }
  if (caps.insertNoteItem) {
    kinds.push("INSERT_NOTE_ITEM");
    fields.push("- INSERT_NOTE_ITEM → noteId, itemText");
  }
  if (caps.appendNoteText) {
    kinds.push("APPEND_NOTE_TEXT");
    fields.push("- APPEND_NOTE_TEXT → noteId, paragraph");
  }
  if (caps.moveCard) {
    kinds.push("MOVE_CARD");
    fields.push("- MOVE_CARD → fromBoardId, fromColumnId, cardId, toBoardId, toColumnId (pick IDs from context)");
  }
  if (caps.linkNoteToCard) {
    kinds.push("LINK_NOTE_TO_CARD");
    fields.push("- LINK_NOTE_TO_CARD → boardId, columnId, cardId, noteId (pick IDs from context)");
  }
  if (caps.showStatus) {
    kinds.push("SHOW_STATUS");
    fields.push("- SHOW_STATUS → body (Hebrew multi-line string)");
  }
  if (caps.proposeNewBoard) {
    kinds.push("PROPOSE_NEW_BOARD");
    fields.push("- PROPOSE_NEW_BOARD → suggested_name (required); items[] (optional)");
  }
  if (caps.proposeNewNote) {
    kinds.push("PROPOSE_NEW_NOTE");
    fields.push('- PROPOSE_NEW_NOTE → suggested_name, suggested_type ("checklist"|"bullets"|"free_text"); items[]');
  }
  kinds.push("ASK_CLARIFICATION");
  fields.push("- ASK_CLARIFICATION → question");

  const kindsLine = kinds.map((k) => `"${k}"`).join(" | ");

  return `${instructions}

[USER STRUCTURE — read-only context]
${contextJson}

[ENABLED ACTIONS — only emit these kinds]
${kindsLine}

[OUTPUT FORMAT — DO NOT IGNORE]
Return ONLY a single JSON object, no prose, no markdown fences:

{
  "items": [
    { "kind": ${kindsLine}, "text": "<short Hebrew echo>", "confidence": <0..100>, ...kind-specific fields... }
  ]
}

Kind-specific fields:
${fields.join("\n")}

SHOW_STATUS body format (Hebrew, plain text, blank line between sections):
לוח X (Y משימות בסה״כ):

A משימות דחופות:
• כותרת 1

B משימות מתוכננות:
• כותרת 1`;
}

/** Calls Gemini with the full session conversation; returns filtered actions. */
export async function planActions(
  uid: string,
  conversation: ChatTurn[],
): Promise<AssistantAction[]> {
  const apiKey = assistantSettings.getApiKey();
  const model = assistantSettings.getModel();
  const instructions = assistantSettings.getPrompt();
  const caps = assistantSettings.getCapabilities();
  const systemPrompt = buildSystemPrompt(instructions, await buildContext(uid), caps);
  const raw = await generate(apiKey, model, systemPrompt, conversation);
  return raw.filter((a) => capabilityAllows(caps, a));
}

/** Execute an action. Returns an undo target if reversible within 30s. */
export async function executeAction(
  uid: string,
  action: AssistantAction,
): Promise<AssistantUndoTarget | null> {
  switch (action.kind) {
    case "INSERT_CARD": {
      const cardId = await createCard(
        action.boardId,
        action.columnId,
        action.title,
        action.description,
        uid,
      );
      return { type: "card", boardId: action.boardId, columnId: action.columnId, cardId };
    }
    case "INSERT_NOTE_ITEM": {
      const itemId = await addItem(action.noteId, action.itemText);
      return { type: "noteItem", noteId: action.noteId, itemId };
    }
    case "APPEND_NOTE_TEXT": {
      const before = await readNoteContent(action.noteId);
      await appendFreeText(action.noteId, action.paragraph);
      return { type: "noteFreeText", noteId: action.noteId, previousContent: before };
    }
    case "MOVE_CARD": {
      if (action.fromBoardId === action.toBoardId) {
        await moveCardToColumn(action.fromBoardId, action.fromColumnId, action.toColumnId, action.cardId);
      } else {
        await moveCardBetweenBoards(
          action.fromBoardId,
          action.fromColumnId,
          action.cardId,
          action.toBoardId,
          action.toColumnId,
        );
      }
      return null;
    }
    case "LINK_NOTE_TO_CARD": {
      await addLinkedNote(action.boardId, action.columnId, action.cardId, action.noteId);
      return null;
    }
    case "SHOW_STATUS":
    case "PROPOSE_NEW_BOARD":
    case "PROPOSE_NEW_NOTE":
    case "ASK_CLARIFICATION":
      return null;
  }
}

export async function executeProposeNewBoard(
  uid: string,
  action: Extract<AssistantAction, { kind: "PROPOSE_NEW_BOARD" }>,
): Promise<void> {
  const boardId = await createBoard(action.suggestedName, uid);
  // createBoard seeds 4 columns; drop items into the first (urgent) column.
  const colsSnap = await getDocs(
    query(collection(db, "boards", boardId, "columns"), orderBy("order", "asc")),
  );
  const firstCol = colsSnap.docs[0]?.id;
  if (!firstCol) return;
  for (const title of action.items) {
    await createCard(boardId, firstCol, title, "", uid);
  }
}

export async function executeProposeNewNote(
  uid: string,
  action: Extract<AssistantAction, { kind: "PROPOSE_NEW_NOTE" }>,
): Promise<void> {
  const type = action.suggestedType as any;
  const noteId = await createNote(action.suggestedName, type, uid);
  if (type === "checklist" || type === "bullets") {
    for (const t of action.items) await addItem(noteId, t);
  } else if (type === "free_text") {
    const joined = action.items.join("\n").trim();
    if (joined) await appendFreeText(noteId, joined);
  }
}

export async function undoAction(target: AssistantUndoTarget): Promise<void> {
  try {
    if (target.type === "card") {
      await setCardStatus(target.boardId, target.columnId, target.cardId, "irrelevant", "");
    } else if (target.type === "noteItem") {
      await deleteItem(target.noteId, target.itemId);
    } else if (target.type === "noteFreeText") {
      await updateFreeTextContent(target.noteId, target.previousContent);
    }
  } catch (e) {
    console.warn("[Slate] assistant undo failed", e);
  }
}

function readNoteContent(noteId: string): Promise<string> {
  return new Promise((resolve) => {
    const unsub = observeNote(noteId, (n) => {
      unsub();
      resolve(n?.content ?? "");
    });
  });
}
