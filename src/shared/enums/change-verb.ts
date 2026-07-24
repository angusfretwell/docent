export const ChangeVerb = {
  Opened: "opened",
  Reopened: "reopened",
  Replied: "replied",
  Resolved: "resolved",
} as const;

export type ChangeVerb = (typeof ChangeVerb)[keyof typeof ChangeVerb];

export const changeVerbs = Object.values(ChangeVerb);
