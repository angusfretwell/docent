import { atomWithStorage } from "jotai/utils";

/** Whether a walkthrough's target pane follows the reader down the prose. */
export const autoScrollAtom = atomWithStorage("autoScroll", true);

export const commentsOpenAtom = atomWithStorage("commentsOpen", true);

export const diffLayoutAtom = atomWithStorage<"unified" | "split">(
  "diffLayout",
  "unified"
);

export const diffTreeOpenAtom = atomWithStorage("diffTreeOpen", true);
