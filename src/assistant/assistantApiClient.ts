import type { AssistantAction, ChatTurn } from "./assistantModels";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta";

export type AssistantErrorKind =
  | "MISSING_KEY"
  | "AUTH"
  | "QUOTA"
  | "NETWORK"
  | "SERVER"
  | "PARSE"
  | "UNKNOWN";

export class AssistantApiError extends Error {
  constructor(public kind: AssistantErrorKind, public httpCode?: number, public body?: string) {
    super(`Assistant API failure: ${kind} (http=${httpCode ?? "-"})`);
  }
}

/**
 * Direct Gemini generateContent call. BYO key (?key=). Multi-turn via
 * `contents`. Tolerant JSON parse — bad actions are dropped, not fatal.
 * Port of Android AssistantApiClient.kt.
 */
export async function generate(
  apiKey: string,
  model: string,
  systemInstruction: string,
  conversation: ChatTurn[],
): Promise<AssistantAction[]> {
  if (!apiKey.trim()) throw new AssistantApiError("MISSING_KEY");
  if (conversation.length === 0) return [];

  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: conversation.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
  };

  let resp: Response;
  try {
    resp = await fetch(`${ENDPOINT}/models/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AssistantApiError("NETWORK");
  }

  const text = await resp.text();
  if (!resp.ok) {
    const kind: AssistantErrorKind =
      resp.status === 401 || resp.status === 403
        ? "AUTH"
        : resp.status === 429
          ? "QUOTA"
          : resp.status >= 500
            ? "SERVER"
            : "UNKNOWN";
    throw new AssistantApiError(kind, resp.status, text.slice(0, 2000));
  }
  return parseResponse(text);
}

function parseResponse(rawBody: string): AssistantAction[] {
  let root: any;
  try {
    root = JSON.parse(rawBody);
  } catch {
    throw new AssistantApiError("PARSE", undefined, rawBody);
  }
  const firstText: string | undefined =
    root?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!firstText) return [];
  return parseActions(firstText);
}

function parseActions(modelText: string): AssistantAction[] {
  let parsed: any;
  try {
    parsed = JSON.parse(modelText);
  } catch {
    return [];
  }
  const arr: any[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.items)
      ? parsed.items
      : [];
  const out: AssistantAction[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const text = typeof item.text === "string" ? item.text : "";
    const confidence = typeof item.confidence === "number" ? item.confidence : 0;
    const s = (k: string): string | undefined =>
      typeof item[k] === "string" ? item[k] : undefined;
    switch (item.kind) {
      case "INSERT_CARD": {
        const boardId = s("boardId"), columnId = s("columnId"), title = s("title");
        if (!boardId || !columnId || !title?.trim()) break;
        out.push({ kind: "INSERT_CARD", text, confidence, boardId, columnId, title, description: s("description") ?? "" });
        break;
      }
      case "INSERT_NOTE_ITEM": {
        const noteId = s("noteId"), itemText = s("itemText") ?? s("text");
        if (!noteId || !itemText) break;
        out.push({ kind: "INSERT_NOTE_ITEM", text, confidence, noteId, itemText });
        break;
      }
      case "APPEND_NOTE_TEXT": {
        const noteId = s("noteId"), paragraph = s("paragraph");
        if (!noteId || !paragraph) break;
        out.push({ kind: "APPEND_NOTE_TEXT", text, confidence, noteId, paragraph });
        break;
      }
      case "PROPOSE_NEW_BOARD": {
        const name = s("suggested_name") ?? s("suggestedName");
        if (!name) break;
        const items = Array.isArray(item.items) ? item.items.filter((x: unknown) => typeof x === "string") : [];
        out.push({ kind: "PROPOSE_NEW_BOARD", text, confidence, suggestedName: name, items });
        break;
      }
      case "PROPOSE_NEW_NOTE": {
        const name = s("suggested_name") ?? s("suggestedName");
        if (!name) break;
        const type = s("suggested_type") ?? s("suggestedType") ?? "checklist";
        const items = Array.isArray(item.items) ? item.items.filter((x: unknown) => typeof x === "string") : [];
        out.push({ kind: "PROPOSE_NEW_NOTE", text, confidence, suggestedName: name, suggestedType: type, items });
        break;
      }
      case "MOVE_CARD": {
        const fromBoardId = s("fromBoardId"), fromColumnId = s("fromColumnId"),
          cardId = s("cardId"), toBoardId = s("toBoardId"), toColumnId = s("toColumnId");
        if (!fromBoardId || !fromColumnId || !cardId || !toBoardId || !toColumnId) break;
        out.push({ kind: "MOVE_CARD", text, confidence, fromBoardId, fromColumnId, cardId, toBoardId, toColumnId });
        break;
      }
      case "LINK_NOTE_TO_CARD": {
        const boardId = s("boardId"), columnId = s("columnId"), cardId = s("cardId"), noteId = s("noteId");
        if (!boardId || !columnId || !cardId || !noteId) break;
        out.push({ kind: "LINK_NOTE_TO_CARD", text, confidence, boardId, columnId, cardId, noteId });
        break;
      }
      case "SHOW_STATUS": {
        const bodyText = s("body");
        if (!bodyText?.trim()) break;
        out.push({ kind: "SHOW_STATUS", text, confidence, body: bodyText });
        break;
      }
      case "ASK_CLARIFICATION": {
        const question = s("question");
        if (!question?.trim()) break;
        out.push({ kind: "ASK_CLARIFICATION", text, confidence, question });
        break;
      }
    }
  }
  return out;
}
