---
schema: docent/walkthrough-section
id: sec_01JZFIXTUREPROD00000000S04
title: Copying, and the part that stays silent
captures: [cap_01JZFIXTUREPROD00000000C4, cap_01JZFIXTUREPROD00000000C5]
callouts: [{anchor: {capture: cap_01JZFIXTUREPROD00000000C4,kind: screenshot-region,rect: [0.343, 0.6775, 0.047, 0.0338]},body: "The entire confirmation. Visual only — nothing announces it."},{anchor: {capture: cap_01JZFIXTUREPROD00000000C5,fromMs: 700,kind: recording-timestamp,toMs: 2000},body: "The dialog opens on CSS variables, already filled for the current palette."},{anchor: {capture: cap_01JZFIXTUREPROD00000000C5,fromMs: 1970,kind: recording-timestamp,toMs: 3000},body: "Tailwind, then Figma tokens — the block re-renders with no reload and no request."},{anchor: {capture: cap_01JZFIXTUREPROD00000000C5,fromMs: 3874,kind: recording-timestamp,toMs: 5476},body: "Copy lands, the toast appears, and it clears itself a second and a half later."}]
---

Copy puts the text on the clipboard and confirms it with a small pill in the footer {{capture:0}}. It is the lightest possible acknowledgement, and for a sighted user it is enough.

It is also the one unfinished thing in the branch: the toast is a `hidden` attribute being toggled, so a screen reader hears nothing at all when the copy succeeds. That is an open comment on this review rather than a decision.

{{capture:1}} End to end it is four interactions — open, tab, tab, copy — with no navigation and no network in any of them. Every byte the modal shows was built in the tab from the palette on screen.
