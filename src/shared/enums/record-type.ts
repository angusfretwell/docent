/**
 * The record types, derived from the `NNN-<type>.md` filename. Two kinds:
 * `open`, `reply`, and `edit` carry prose; `action`, `resolve`, and `reopen`
 * carry none and exist only to move the Finding's status.
 */
export const RecordType = {
  Action: "action",
  Edit: "edit",
  Open: "open",
  Reopen: "reopen",
  Reply: "reply",
  Resolve: "resolve",
} as const;

export type RecordType = (typeof RecordType)[keyof typeof RecordType];

export const recordTypes = Object.values(RecordType);
