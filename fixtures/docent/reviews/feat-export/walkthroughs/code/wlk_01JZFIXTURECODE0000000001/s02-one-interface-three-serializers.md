---
schema: docent/walkthrough-section
id: sec_01JZFIXTURECODE00000000S02
title: "One interface, three serializers"
ranges: [{ file: src/export.js, side: head, blobSha: {{blob change2 src/export.js}}, lines: [1, 10] }, { file: src/export.js, side: head, blobSha: {{blob change2 src/export.js}}, lines: [37, 45] }]
---

Every format answers the same question — what file would you hand someone? — so every serializer returns the same three fields: a filename, a MIME type, and the text. {{range:0}} `toCssVariables` is the shape all three follow: palette in, file out, no arguments it didn't ask for and nothing touched on the way through.

{{range:1}} `serialize` is the only dispatch in the feature. The tab's `data-format` attribute is the key, so adding a fourth format is one function and one row here — the modal, the copy handler and the download handler all keep working without being told.
