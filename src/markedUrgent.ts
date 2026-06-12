import { useEffect, useState } from "react";
import {
  observeMarkedUrgentCardIds,
  setCardMarkedUrgent,
} from "./repositories/userRepository";

/**
 * User-flagged urgent card IDs, persisted to `users/{uid}.markedUrgentCardIds`
 * in Firestore so the flag syncs across the user's devices. Separate from
 * each board's column-based urgency (`Board.urgentColumnId`) — this is a
 * personal highlight layered on top, used by Home's `UrgentTaskRow`.
 *
 * Until Android migrates from DataStore to the same Firestore field, marks
 * are NOT shared with mobile yet — see §34 follow-up.
 */
export function useMarkedUrgent(uid: string | undefined): Set<string> {
  const [set, setSet] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!uid) {
      setSet(new Set());
      return;
    }
    return observeMarkedUrgentCardIds(uid, (ids) => setSet(new Set(ids)));
  }, [uid]);
  return set;
}

export function toggleMarkedUrgent(uid: string, cardId: string, currentlyMarked: boolean) {
  return setCardMarkedUrgent(uid, cardId, !currentlyMarked).catch((e) =>
    console.warn("[Slate] toggleMarkedUrgent failed", e),
  );
}
