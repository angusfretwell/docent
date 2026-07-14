const STORAGE_KEY = "palette:last";

/**
 * Persistence is best-effort: a page opened from `file://` or with storage
 * disabled still has to render, so every access swallows its own failure.
 */
export function saveLast(colors) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
    return true;
  } catch {
    return false;
  }
}

export function loadLast() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}
