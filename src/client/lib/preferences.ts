import { atomWithStorage } from "jotai/utils";

export const findingsOpenAtom = atomWithStorage("findingsOpen", true);
export const findingsExpandedAtom = atomWithStorage("findingsExpanded", false);

export const diffLayoutAtom = atomWithStorage<"unified" | "split">(
  "diffLayout",
  "split"
);

export const diffTreeOpenAtom = atomWithStorage("diffTreeOpen", true);
