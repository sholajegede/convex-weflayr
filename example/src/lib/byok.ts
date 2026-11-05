// The visitor's own Weflayr key lives in this browser's localStorage and nowhere else.
const KEY = "convex-weflayr-demo:key";
const VISITOR = "convex-weflayr-demo:visitor";

let memoryVisitor: string | null = null;

export function readKey(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveKey(key: string) {
  try {
    localStorage.setItem(KEY, key);
  } catch {
    // Storage is blocked. The key stays in memory until the page closes.
  }
}

export function removeKey() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to remove.
  }
}

/** A random id for this browser. It keeps one visitor's calls and budgets apart from everyone else's. */
export function visitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR);
    if (!id) {
      id = crypto.randomUUID().slice(0, 8);
      localStorage.setItem(VISITOR, id);
    }
    return id;
  } catch {
    memoryVisitor ??= crypto.randomUUID().slice(0, 8);
    return memoryVisitor;
  }
}
