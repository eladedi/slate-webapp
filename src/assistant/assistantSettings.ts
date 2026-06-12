import {
  DEFAULT_CAPABILITIES,
  DEFAULT_MODEL,
  DEFAULT_SYSTEM_PROMPT,
  type AssistantCapabilities,
} from "./assistantModels";

/**
 * BYO Gemini config persisted in localStorage. Never written to Firestore,
 * never bundled. Mirrors the Android DataStore keys conceptually.
 */
const K = {
  apiKey: "slate.assistant.apiKey",
  model: "slate.assistant.model",
  prompt: "slate.assistant.systemPrompt",
  caps: "slate.assistant.capabilities",
  usageDate: "slate.assistant.usageDate",
  usageCount: "slate.assistant.usageCount",
  privacyAck: "slate.assistant.privacyAck",
};

export const assistantSettings = {
  getApiKey: () => localStorage.getItem(K.apiKey) ?? "",
  setApiKey: (v: string) => localStorage.setItem(K.apiKey, v),

  getModel: () => localStorage.getItem(K.model) || DEFAULT_MODEL,
  setModel: (v: string) => localStorage.setItem(K.model, v),

  getPrompt: () => localStorage.getItem(K.prompt)?.trim() || DEFAULT_SYSTEM_PROMPT,
  setPrompt: (v: string) => localStorage.setItem(K.prompt, v),

  getCapabilities: (): AssistantCapabilities => {
    try {
      const raw = localStorage.getItem(K.caps);
      if (!raw) return DEFAULT_CAPABILITIES;
      return { ...DEFAULT_CAPABILITIES, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_CAPABILITIES;
    }
  },
  setCapabilities: (c: AssistantCapabilities) =>
    localStorage.setItem(K.caps, JSON.stringify(c)),

  getPrivacyAck: () => localStorage.getItem(K.privacyAck) === "true",
  setPrivacyAck: () => localStorage.setItem(K.privacyAck, "true"),

  /** @returns null if under cap (and bumped), or the count if over cap. */
  checkAndBumpUsage: (cap: number): number | null => {
    const today = new Date().toISOString().slice(0, 10);
    const storedDate = localStorage.getItem(K.usageDate);
    const count = storedDate === today ? Number(localStorage.getItem(K.usageCount) || 0) : 0;
    if (count >= cap) return count;
    localStorage.setItem(K.usageDate, today);
    localStorage.setItem(K.usageCount, String(count + 1));
    return null;
  },
  getUsageToday: (): number => {
    const today = new Date().toISOString().slice(0, 10);
    return localStorage.getItem(K.usageDate) === today
      ? Number(localStorage.getItem(K.usageCount) || 0)
      : 0;
  },
};
