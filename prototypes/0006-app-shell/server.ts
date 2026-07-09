// PROTOTYPE — throwaway skeleton for wayfinder ticket #6 (App shell architecture).
// Demonstrates the docent app shell: a Bun-native local server that serves the
// browser UI and bridges it to `.review/` over an HTTP file API + SSE live-reload.
// Not production code. See README.md for the question this answers.

import { watch } from "node:fs";
import { join } from "node:path";

// The client is imported as text so `bun build --compile` embeds it directly in
// the standalone binary — the distribution model chosen for #6. In dev these are
// read from disk; in the compiled binary they travel inside the executable.
import indexHtml from "./public/index.html" with { type: "text" };
import appJs from "./public/app.js" with { type: "text" };

type ServerOpts = { root: string; port?: number };

// --- read side: walk `.review/` into a plain JSON snapshot the UI renders ------

async function readReview(root: string) {
  const reviewsDir = join(root, ".review", "reviews");
  const reviews: unknown[] = [];

  const glob = new Bun.Glob("*/review.json");
  for await (const rel of glob.scan({ cwd: reviewsDir })) {
    const key = rel.split("/")[0];
    const dir = join(reviewsDir, key);
    const review = await Bun.file(join(dir, "review.json")).json();

    const changes: unknown[] = [];
    const changeGlob = new Bun.Glob("changes/*.json");
    for await (const c of changeGlob.scan({ cwd: dir })) {
      changes.push(await Bun.file(join(dir, c)).json());
    }

    const comments: unknown[] = [];
    const cmtGlob = new Bun.Glob("comments/*.md");
    for await (const c of cmtGlob.scan({ cwd: dir })) {
      comments.push(parseComment(await Bun.file(join(dir, c)).text(), c));
    }

    reviews.push({ key, review, changes, comments });
  }

  return { reviews };
}

// Deliberately loose frontmatter parse — the real comment schema is #7's job.
function parseComment(raw: string, file: string) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const front: Record<string, string> = {};
  if (m) {
    for (const line of m[1].split("\n")) {
      const i = line.indexOf(":");
      if (i > 0) front[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return { file, front, body: (m ? m[2] : raw).trim() };
}

// --- write side: append-only comment file (mirrors #2's agent write pattern) ---

async function addComment(root: string, key: string, body: string) {
  const id = `cmt_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const file = join(root, ".review", "reviews", key, "comments", `${id}.md`);
  const doc = `---
schema: docent/comment@1
id: ${id}
author: { kind: human }
anchor: { file: src/parser/stream.ts, side: head, lines: [42, 47] }
createdAt: ${new Date().toISOString()}
resolved: false
---
${body}
`;
  await Bun.write(file, doc);
  return { id };
}

export function startServer({ root, port = 0 }: ServerOpts) {
  const clients = new Set<ReadableStreamDefaultController>();
  const enc = new TextEncoder();
  const broadcast = (event: string) => {
    for (const c of clients) c.enqueue(enc.encode(`data: ${event}\n\n`));
  };

  // Watch `.review/` and push a live-reload event — #2's "server watches, UI
  // re-renders live". Debounced so a burst of file writes collapses to one push.
  let t: Timer | undefined;
  watch(join(root, ".review"), { recursive: true }, () => {
    clearTimeout(t);
    t = setTimeout(() => broadcast("review-changed"), 40);
  });

  const server = Bun.serve({
    port,
    idleTimeout: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const { pathname } = url;

      if (pathname === "/")
        return new Response(indexHtml, { headers: { "content-type": "text/html" } });
      if (pathname === "/app.js")
        return new Response(appJs, { headers: { "content-type": "text/javascript" } });

      if (pathname === "/api/review")
        return Response.json(await readReview(root));

      // Context-expansion seam (#4): the viewer needs full blobs, not just the
      // patch. Real impl shells `git cat-file`; stubbed here to mark the seam.
      if (pathname === "/api/blob")
        return Response.json({ sha: url.searchParams.get("sha"), note: "git cat-file seam (#4)" });

      const post = pathname.match(/^\/api\/reviews\/([^/]+)\/comments$/);
      if (post && req.method === "POST") {
        const { body } = await req.json();
        return Response.json(await addComment(root, post[1], body));
      }

      if (pathname === "/api/events") {
        let self: ReadableStreamDefaultController;
        const stream = new ReadableStream({
          start(controller) {
            self = controller;
            clients.add(controller);
            controller.enqueue(enc.encode("data: connected\n\n"));
          },
          cancel() {
            clients.delete(self);
          },
        });
        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
          },
        });
      }

      return new Response("not found", { status: 404 });
    },
  });

  return { url: server.url.href, stop: () => server.stop(true) };
}
