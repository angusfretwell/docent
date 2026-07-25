---
schema: docent/walkthrough-section
id: sec_01JZFIXTURECODE00000000S01
title: "The palette, out of the closure"
ranges: [{ file: src/state.js, side: head, blobSha: {{blob change2 src/state.js}}, lines: [3, 12] }, { file: src/state.js, side: head, blobSha: {{blob change2 src/state.js}}, lines: [14, 20] }]
---

Start here, because everything downstream is a function of it. The palette on screen used to live in `app.js`'s closure, where the only way to read it was to be `app.js`. {{range:0}} It is now a module with two functions and no cleverness — no store, no events, no subscribers.

That is the whole reason the export code can be pure. A serializer takes the palette as an argument instead of going looking for it in the DOM, and the modal's format is remembered the same plain way. {{range:1}} Two pieces of state, four functions, and nothing in this file knows that a `<dialog>` exists.
