---
schema: docent/walkthrough-section
id: sec_01JZFIXTUREPROD00000000S04
title: Copying, and the part that stays silent
captures: [cap_01JZFIXTUREPROD00000000C4, cap_01JZFIXTUREPROD00000000C5]
callouts: [{anchor: {capture: cap_01JZFIXTUREPROD00000000C4,kind: screenshot-region,rect: [0.4813, 0.6333, 0.0656, 0.04]},body: "The entire confirmation. Visual only — nothing announces it."},{anchor: {capture: cap_01JZFIXTUREPROD00000000C5,fromMs: 700,kind: recording-timestamp,toMs: 1900},body: "The dialog opens on CSS variables, already filled for the current palette."},{anchor: {capture: cap_01JZFIXTUREPROD00000000C5,fromMs: 1950,kind: recording-timestamp,toMs: 3800},body: "Tailwind, then Figma tokens — the block re-renders with no reload and no request."},{anchor: {capture: cap_01JZFIXTUREPROD00000000C5,fromMs: 4500,kind: recording-timestamp,toMs: 7369},body: "Copy lands and the button renames itself, then puts the old label back two seconds later."}]
---

Copy puts the text on the clipboard and confirms it by renaming itself {{capture:0}}. Nothing appears and nothing shifts — the button is already sized for the longer word, so the footer stays exactly where your cursor left it. It is the lightest possible acknowledgement, and for a sighted user it is enough.

It is also the one unfinished thing in the branch: the new label is dropped into the button with nothing attached to announce it, so a screen reader hears silence when the copy succeeds. That is an open comment on this review rather than a decision.

{{capture:1}} End to end it is four interactions — open, tab, tab, copy — with no navigation and no network in any of them. Every byte the modal shows was built in the tab from the palette on screen.
