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
