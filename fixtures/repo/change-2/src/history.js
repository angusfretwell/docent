const HISTORY_LIMIT = 12;

/**
 * A bounded, most-recent-first log of generated palettes. Entries are copied on
 * the way in so a later mutation of the caller's array can't rewrite history.
 */
export function createHistory(limit = HISTORY_LIMIT) {
  let entries = [];

  return {
    push(colors) {
      entries = [[...colors], ...entries].slice(0, limit);
      return entries.length;
    },

    at(index) {
      const found = entries[index];
      return found === undefined ? undefined : [...found];
    },

    entries() {
      return entries.map((colors) => [...colors]);
    },

    clear() {
      entries = [];
    },

    get size() {
      return entries.length;
    },
  };
}
