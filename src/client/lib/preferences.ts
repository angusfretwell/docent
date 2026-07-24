import { atomWithStorage } from "jotai/utils";

export const commentsOpenAtom = atomWithStorage("commentsOpen", true);

export const diffLayoutAtom = atomWithStorage<"unified" | "split">(
  "diffLayout",
  "split"
);

export const diffTreeOpenAtom = atomWithStorage("diffTreeOpen", true);
