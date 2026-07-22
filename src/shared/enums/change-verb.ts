/** What a milestone record did to the Finding (diff-review.md §7). */
export const ChangeVerb = {
  Opened: "opened",
  Reopened: "reopened",
  Replied: "replied",
  Resolved: "resolved",
} as const;

export type ChangeVerb = (typeof ChangeVerb)[keyof typeof ChangeVerb];

export const changeVerbs = Object.values(ChangeVerb);
