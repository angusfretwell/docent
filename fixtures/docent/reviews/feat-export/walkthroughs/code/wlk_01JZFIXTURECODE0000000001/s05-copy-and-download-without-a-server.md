---
schema: docent/walkthrough-section
id: sec_01JZFIXTURECODE00000000S05
title: "Copy and download without a server"
ranges: [{ file: src/app.js, side: head, blobSha: {{blob change2 src/app.js}}, lines: [43, 52] }, { file: src/app.js, side: head, blobSha: {{blob change2 src/app.js}}, lines: [54, 64] }]
---

Both buttons serialize the same way and then diverge only in what they do with the result. {{range:0}} Copy takes the `text` and drops the other two fields; the confirmation that follows is the button's own label and a timer that puts it back. Nothing is inserted and nothing is torn down, so there is no state to reconcile beyond the pending timeout — but there is also nothing an assistive technology can read, which is an open comment on this branch and the one genuinely unfinished thing in the feature.

{{range:1}} Download uses all three: the `mime` types the blob, the `filename` names it, and a detached `<a>` is clicked to trigger the save. There is no server anywhere in this path — the file is minted in the tab and handed straight to the browser. The revoke on the last line matters: the click is dispatched synchronously, so by the time the URL stops resolving the browser already holds the bytes.
