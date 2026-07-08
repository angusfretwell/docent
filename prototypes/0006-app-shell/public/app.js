// PROTOTYPE client. Proves the data bridge end-to-end:
//   1. read  — GET /api/review  renders the `.review/` snapshot
//   2. live  — SSE /api/events   re-fetches when the server sees `.review/` change
//   3. write — POST a comment    drops an append-only file the watcher picks up
// Production swaps this hand-rolled DOM for the Vite/React app; the bridge is the point.

const root = document.getElementById("root");
let firstKey = null;

async function load(flash = false) {
  const data = await fetch("/api/review").then((r) => r.json());
  root.classList.remove("muted");
  root.innerHTML = "";

  for (const r of data.reviews) {
    firstKey = firstKey ?? r.key;
    const cur = r.review.currentChangeId;
    const changes = r.changes.map((c) => c.id).join(" → ");
    const card = document.createElement("div");
    card.className = "card" + (flash ? " flash" : "");
    card.innerHTML = `
      <div><b>${r.review.target.pr}</b> · <span class="muted">${r.review.status}</span></div>
      <div class="muted">rounds: ${changes} · current: ${cur}</div>
      <div style="margin-top:10px"><b>comments (${r.comments.length})</b></div>
      ${r.comments
        .map(
          (c) =>
            `<div class="cmt"><div class="muted">${c.front.id || c.file} · ${c.front.author || ""}</div>${c.body}</div>`
        )
        .join("")}
      <div style="margin-top:12px">
        <input id="body" placeholder="add a comment (writes an append-only file)…" />
        <button id="add">comment</button>
      </div>`;
    root.appendChild(card);
  }

  document.getElementById("add")?.addEventListener("click", async () => {
    const body = document.getElementById("body").value.trim();
    if (!body) return;
    await fetch(`/api/reviews/${firstKey}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body }),
    });
    // No manual refresh — the file write trips the watcher → SSE → reload.
  });
}

const es = new EventSource("/api/events");
es.onmessage = (e) => {
  if (e.data === "review-changed") load(true);
};

load();
