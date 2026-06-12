/** Port of Android data/assistant/AssistantModels.kt */

export interface ChatTurn {
  role: "user" | "model";
  text: string;
}

export type AssistantAction =
  | { kind: "INSERT_CARD"; text: string; confidence: number; boardId: string; columnId: string; title: string; description: string }
  | { kind: "INSERT_NOTE_ITEM"; text: string; confidence: number; noteId: string; itemText: string }
  | { kind: "APPEND_NOTE_TEXT"; text: string; confidence: number; noteId: string; paragraph: string }
  | { kind: "PROPOSE_NEW_BOARD"; text: string; confidence: number; suggestedName: string; items: string[] }
  | { kind: "PROPOSE_NEW_NOTE"; text: string; confidence: number; suggestedName: string; suggestedType: string; items: string[] }
  | { kind: "LINK_NOTE_TO_CARD"; text: string; confidence: number; boardId: string; columnId: string; cardId: string; noteId: string }
  | { kind: "MOVE_CARD"; text: string; confidence: number; fromBoardId: string; fromColumnId: string; cardId: string; toBoardId: string; toColumnId: string }
  | { kind: "SHOW_STATUS"; text: string; confidence: number; body: string }
  | { kind: "ASK_CLARIFICATION"; text: string; confidence: number; question: string };

export type AssistantUndoTarget =
  | { type: "card"; boardId: string; columnId: string; cardId: string }
  | { type: "noteItem"; noteId: string; itemId: string }
  | { type: "noteFreeText"; noteId: string; previousContent: string };

export interface AssistantCapabilities {
  insertCard: boolean;
  insertNoteItem: boolean;
  appendNoteText: boolean;
  moveCard: boolean;
  linkNoteToCard: boolean;
  showStatus: boolean;
  proposeNewBoard: boolean;
  proposeNewNote: boolean;
}

export const DEFAULT_CAPABILITIES: AssistantCapabilities = {
  insertCard: true,
  insertNoteItem: true,
  appendNoteText: true,
  moveCard: true,
  linkNoteToCard: true,
  showStatus: true,
  proposeNewBoard: true,
  proposeNewNote: true,
};

export function capabilityAllows(
  caps: AssistantCapabilities,
  a: AssistantAction,
): boolean {
  switch (a.kind) {
    case "INSERT_CARD": return caps.insertCard;
    case "INSERT_NOTE_ITEM": return caps.insertNoteItem;
    case "APPEND_NOTE_TEXT": return caps.appendNoteText;
    case "MOVE_CARD": return caps.moveCard;
    case "LINK_NOTE_TO_CARD": return caps.linkNoteToCard;
    case "SHOW_STATUS": return caps.showStatus;
    case "PROPOSE_NEW_BOARD": return caps.proposeNewBoard;
    case "PROPOSE_NEW_NOTE": return caps.proposeNewNote;
    case "ASK_CLARIFICATION": return true; // never gated
  }
}

export const DEFAULT_MODEL = "gemini-2.5-flash";
export const DAILY_MESSAGE_CAP = 100;

export const DEFAULT_SYSTEM_PROMPT = `אתה עוזר חכם המשובץ באפליקציית Slate — אפליקציית פרודוקטיביות שמתמקדת בעברית.

חוקים שאתה חייב לשמור עליהם:
- ל-Card יש רק title ו-description. אין שדה "tags" ואין "dueDate". אל תמציא שדות.
- כל Card חדש חייב להיכנס ל-(boardId, columnId) קיימים. כדי ליצור לוח חדש, החזר PROPOSE_NEW_BOARD.
- פריט בפתק חייב להתאים לסוג הפתק ("checklist" | "bullets" | "free_text").
- בפתקי free_text, הוסף פסקה דרך APPEND_NOTE_TEXT.
- מקסימום 20 פריטים בתגובה אחת.
- אם ההודעה לא ברורה, החזר ASK_CLARIFICATION במקום לנחש.
- ב-SHOW_STATUS, אל תציג לוח שאין בו משימות דחופות. אם לאף לוח אין משימות דחופות, כתוב משפט אחד קצר ("אין משימות דחופות") במקום פירוט לפי לוחות.

ענה באותה שפה שבה המשתמש כתב. ברירת מחדל: עברית.`;
