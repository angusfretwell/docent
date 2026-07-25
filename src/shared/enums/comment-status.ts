export const CommentStatus = {
  Actioned: "actioned",
  Open: "open",
  Resolved: "resolved",
} as const;

export type CommentStatus = (typeof CommentStatus)[keyof typeof CommentStatus];

export const commentStatuses = Object.values(CommentStatus);

export const STATUS_LABEL: Record<CommentStatus, string> = {
  actioned: "Actioned",
  open: "Open",
  resolved: "Resolved",
};
