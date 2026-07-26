import { atomWithStorage } from "jotai/utils";

/** Whether a walkthrough's target pane follows the reader down the prose. */
export const autoScrollAtom = atomWithStorage("autoScroll", true);

export const commentsOpenAtom = atomWithStorage("commentsOpen", true);

export const diffLayoutAtom = atomWithStorage<"unified" | "split">(
  "diffLayout",
  "unified"
);

export const diffTreeOpenAtom = atomWithStorage("diffTreeOpen", true);

/** Whether comment threads render against their anchored line, or panel-only. */
export const inlineCommentsAtom = atomWithStorage("inlineComments", true);

export const wordWrapAtom = atomWithStorage("wordWrap", false);
