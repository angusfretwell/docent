---
schema: docent/walkthrough-section
id: sec_01JZFIXTURECODE00000000S04
title: "The dialog, opened natively"
ranges: [{ file: index.html, side: head, blobSha: {{blob change2 index.html}}, lines: [35, 41] }, { file: src/app.js, side: head, blobSha: {{blob change2 src/app.js}}, lines: [75, 79] }]
---

{{range:0}} The modal is a `<dialog>`. That one element choice is why there is no focus-trap code, no `Escape` key handler, no scroll lock and no backdrop element in this diff — `showModal()` brings all four with it, and `::backdrop` styles the dim without anything being rendered for it.

{{range:1}} So opening the export is two statements: fill the code block for the current format, then hand the dialog to the platform. Closing is one. In a dependency-free app the temptation is to hand-roll the modal; the interesting decision here was not to.
