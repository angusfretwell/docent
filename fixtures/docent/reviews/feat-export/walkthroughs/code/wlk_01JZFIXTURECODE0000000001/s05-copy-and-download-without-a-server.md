---
schema: docent/walkthrough-section
id: sec_01JZFIXTURECODE00000000S05
title: "Copy and download without a server"
ranges: [{ file: src/app.js, side: head, blobSha: {{blob change2 src/app.js}}, lines: [44, 53] }, { file: src/app.js, side: head, blobSha: {{blob change2 src/app.js}}, lines: [55, 65] }]
---

Both buttons serialize the same way and then diverge only in what they do with the result. {{range:0}} Copy takes the `text` and drops the other two fields; the toast that follows is a `hidden` attribute and a timer. It is announced to nobody, which is an open comment on this branch and the one genuinely unfinished thing in the feature.

{{range:1}} Download uses all three: the `mime` types the blob, the `filename` names it, and a detached `<a>` is clicked to trigger the save. There is no server anywhere in this path — the file is minted in the tab and handed straight to the browser. The revoke on the last line matters: the click is dispatched synchronously, so by the time the URL stops resolving the browser already holds the bytes.
