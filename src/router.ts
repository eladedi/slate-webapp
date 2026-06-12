import { useEffect, useState } from "react";

/**
 * Minimal hash router. URL shapes:
 *   #/home
 *   #/boards/<boardId>            (also supports ?card=<cardId>)
 *   #/notes/<noteId>
 *   #/archive
 *   #/settings
 *
 * No deps, no nested routes. We chose hash routing over the `pathname` to
 * keep Firebase Hosting + Tauri shell happy without any rewrite config
 * beyond the existing SPA fallback.
 */

export type Destination = "home" | "boards" | "notes" | "archive" | "settings";

export interface Route {
  dest: Destination;
  boardId: string | null;
  noteId: string | null;
  openCardId: string | null;
}

const DEFAULT_ROUTE: Route = {
  dest: "home",
  boardId: null,
  noteId: null,
  openCardId: null,
};

export function parseHash(hash: string): Route {
  // Strip leading `#`, then split off the query (?card=…).
  const raw = hash.replace(/^#/, "");
  const [pathPart, queryPart] = raw.split("?");
  const segments = (pathPart ?? "").split("/").filter(Boolean);
  const params = new URLSearchParams(queryPart ?? "");
  const openCardId = params.get("card");

  if (segments.length === 0) return { ...DEFAULT_ROUTE, openCardId };

  const head = segments[0];
  if (head === "boards") {
    return { dest: "boards", boardId: segments[1] ?? null, noteId: null, openCardId };
  }
  if (head === "notes") {
    return { dest: "notes", boardId: null, noteId: segments[1] ?? null, openCardId };
  }
  if (head === "archive" || head === "settings" || head === "home") {
    return { dest: head as Destination, boardId: null, noteId: null, openCardId };
  }
  return { ...DEFAULT_ROUTE, openCardId };
}

export function buildHash(route: Partial<Route>): string {
  const dest = route.dest ?? "home";
  let path = `#/${dest}`;
  if (dest === "boards" && route.boardId) path = `#/boards/${route.boardId}`;
  else if (dest === "notes" && route.noteId) path = `#/notes/${route.noteId}`;
  if (route.openCardId) path += `?card=${route.openCardId}`;
  return path;
}

/** Imperatively change the route (also fires a hashchange so subscribers update). */
export function navigate(route: Partial<Route>) {
  const next = buildHash(route);
  if (window.location.hash === next) return;
  window.location.hash = next;
}

/** Replace the current URL without pushing a new history entry. Used to clear
 *  one-shot params like `?card=` after the deep-link has been consumed. */
export function replaceRoute(route: Partial<Route>) {
  const next = buildHash(route);
  if (window.location.hash === next) return;
  const url = window.location.pathname + window.location.search + next;
  window.history.replaceState({}, "", url);
  // hashchange doesn't fire on replaceState; nudge listeners manually.
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

/** React hook: returns the current parsed route, re-renders on hashchange. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const handler = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", handler);
    // First render — ensure default if URL was bare.
    if (!window.location.hash) handler();
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  return route;
}
