import type { LogLine } from "../App";

// The "This session" panel lives in sessionStorage, so a reload keeps it and closing the tab clears it.
// It holds only short titles such as "Resend · test call", never a key, a prompt or an answer.
const LOG = "convex-weflayr-demo:log";

export function readLog(): LogLine[] {
  try {
    const raw = sessionStorage.getItem(LOG);
    return raw ? (JSON.parse(raw) as LogLine[]) : [];
  } catch {
    return [];
  }
}

export function writeLog(lines: LogLine[]) {
  try {
    sessionStorage.setItem(LOG, JSON.stringify(lines));
  } catch {
    // Storage is blocked. The panel still works until the page reloads.
  }
}
