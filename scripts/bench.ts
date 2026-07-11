#!/usr/bin/env bun
/**
 * Perf gate for the Diff view — holds the built client to the #4 bar
 * (docs/spec/diff-review.md §1): bounded live DOM at any diff size, smooth
 * full-length scroll with zero long frames, virtualization tracking the
 * scroll. Serves the real `dist/client` build with a large fixture patch
 * canned as `/api/diff` (the server side just shells git and needs no bench),
 * then measures in headless Chromium, piercing the renderer's shadow DOM.
 *
 *   bun run build && bun scripts/bench.ts [path/to/fixture.diff]
 */

import path from "node:path";
import { chromium } from "playwright";
import { Change } from "../src/shared/schemas/change";

const repoRoot = path.join(import.meta.dir, "..");
const fixturePath =
  process.argv[2] ??
  path.join(repoRoot, "prototypes/0004-diff-rendering/public/fixtures/three-xl.diff");
const clientDir = path.join(repoRoot, "dist", "client");

const patch = await Bun.file(fixturePath).text();
if (!(await Bun.file(path.join(clientDir, "index.html")).exists())) {
  console.error("client assets not built — run `bun run build` first");
  process.exit(1);
}

// Canned /api/diff with the fixture patch; static assets are the real build.
const server = Bun.serve({
  async fetch(req) {
    const { pathname } = new URL(req.url);
    if (pathname === "/api/diff") {
      return Response.json(
        Change.make({
          baseSha: "0".repeat(40),
          branch: "bench-fixture",
          defaultBranch: "main",
          generated: [],
          headSha: "1".repeat(40),
          patch,
          root: repoRoot,
        }),
      );
    }
    const file = Bun.file(
      path.join(clientDir, pathname === "/" ? "index.html" : pathname.slice(1)),
    );
    return (await file.exists()) ? new Response(file) : new Response("not found", { status: 404 });
  },
  port: 0,
});

// Browser-side helpers (from the #4 harness): pierce the diffs-container
// shadow root, find the real scroll container, read the materialized window.
const HELPERS = `
  window.__nextFrame = () => new Promise((resolve) => { requestAnimationFrame(() => resolve(null)); });
  window.__sleep = (ms) => new Promise((resolve) => { setTimeout(() => resolve(null), ms); });
  window.__host = () => document.querySelector('diffs-container');
  window.__sr = () => window.__host()?.shadowRoot ?? null;
  window.__rows = () => window.__sr()?.querySelectorAll('[data-line]').length ?? 0;
  window.__deepCount = () => {
    let n = 0;
    const walk = (root) => {
      const kids = root.querySelectorAll ? root.querySelectorAll('*') : [];
      for (const el of kids) { n++; if (el.shadowRoot) walk(el.shadowRoot); }
    };
    walk(document);
    return n;
  };
  window.__scroller = () => {
    // Require a real scroll container — computed overflow-y auto|scroll AND
    // overflowing content — so a non-scrolling page can never pass as smooth.
    let best = null;
    const consider = (el) => {
      const oy = getComputedStyle(el).overflowY;
      if (oy !== 'auto' && oy !== 'scroll') return;
      const over = el.scrollHeight - el.clientHeight;
      if (over > 200 && (!best || over > best.scrollHeight - best.clientHeight)) best = el;
    };
    const walk = (root) => {
      for (const el of root.querySelectorAll('*')) { consider(el); if (el.shadowRoot) walk(el.shadowRoot); }
    };
    walk(document);
    return best;
  };
  window.__lineRange = () => {
    const sr = window.__sr();
    if (!sr) return null;
    const nums = [...sr.querySelectorAll('[data-line]')]
      .map((r) => Number(r.getAttribute('data-line')))
      .filter((n) => Number.isFinite(n));
    return nums.length ? [Math.min(...nums), Math.max(...nums)] : null;
  };
`;

const browser = await chromium.launch({
  args: ["--no-sandbox", "--enable-precise-memory-info"],
});
const page = await browser.newPage({ viewport: { height: 900, width: 1440 } });
await page.addInitScript(HELPERS);
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
page.on("console", (m) => {
  if (m.type() === "error") {
    errors.push(m.text().slice(0, 200));
  }
});

await page.goto(server.url.href, { waitUntil: "load" });

const measured = await page.evaluate(async () => {
  const t0 = performance.now();
  let firstRowsMs: number | null = null;
  while (firstRowsMs === null) {
    if (window.__rows() > 0) {
      firstRowsMs = performance.now() - t0;
    }
    await window.__nextFrame();
    if (performance.now() - t0 > 30_000) {
      break;
    }
  }
  // Settle: no shadow-DOM mutations for 600 ms — structure and async worker
  // highlighting done. Capped at 30 s.
  const sr = window.__sr();
  if (sr) {
    const settleStart = performance.now();
    let lastMutation = performance.now();
    const obs = new MutationObserver(() => {
      lastMutation = performance.now();
    });
    obs.observe(sr, { characterData: true, childList: true, subtree: true });
    while (performance.now() - lastMutation < 600 && performance.now() - settleStart < 30_000) {
      await window.__sleep(50);
    }
    obs.disconnect();
  }
  const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1_048_576) : null;
  return {
    deepNodesAtRest: window.__deepCount(),
    firstRowsMs: Math.round(firstRowsMs ?? -1),
    heapMB: mem,
    rowNodes: window.__rows(),
    settledMs: Math.round(performance.now() - t0),
  };
});

const scroll = await page.evaluate(async () => {
  const el = window.__scroller();
  if (!el) {
    return null;
  }
  el.scrollTop = 0;
  await window.__nextFrame();
  const rangeTop = window.__lineRange();
  const max = el.scrollHeight - el.clientHeight;
  const steps = 40;
  const frames: number[] = [];
  const nodeSamples: number[] = [];
  let last = performance.now();
  for (let i = 1; i <= steps; i += 1) {
    el.scrollTop = (max * i) / steps;
    await window.__nextFrame();
    const now = performance.now();
    frames.push(now - last);
    last = now;
    if (i % 10 === 0) {
      nodeSamples.push(window.__deepCount());
    }
  }
  await window.__sleep(150);
  const rangeBottom = window.__lineRange();
  const sorted = [...frames].toSorted((a, b) => a - b);
  function pct(p: number) {
    return sorted[Math.floor((sorted.length - 1) * p)] ?? 0;
  }
  return {
    longFrames: frames.filter((f) => f > 50).length,
    maxFrameMs: Math.round(Math.max(...frames) * 10) / 10,
    medianFrameMs: Math.round(pct(0.5) * 10) / 10,
    nodesWhileScrolling: nodeSamples,
    p95FrameMs: Math.round(pct(0.95) * 10) / 10,
    rangeBottom,
    rangeTop,
    scrolledPx: Math.round(el.scrollTop),
    virtualizationFollows:
      !!rangeTop && !!rangeBottom && JSON.stringify(rangeTop) !== JSON.stringify(rangeBottom),
  };
});

const shotPath = process.env.BENCH_SHOT;
if (shotPath) {
  await page.evaluate(() => {
    const el = window.__scroller();
    if (el) {
      el.scrollTop = 0;
    }
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: shotPath });
}

await browser.close();
server.stop(true);

const report = { errors, fixture: fixturePath, ...measured, scroll };
console.log(JSON.stringify(report, null, 2));

// The #4 bar (docs/spec/diff-review.md §1), with headroom over the measured
// ~550-node / 0-long-frame baseline so the gate flags regressions, not noise.
const failures: string[] = [];
if (measured.firstRowsMs < 0 || measured.firstRowsMs > 2000) {
  failures.push(`first rows ${measured.firstRowsMs}ms (bar: <2000ms)`);
}
if (measured.deepNodesAtRest > 1500) {
  failures.push(`live DOM at rest ${measured.deepNodesAtRest} nodes (bar: ≤1500)`);
}
if (scroll) {
  if (!scroll.virtualizationFollows) {
    failures.push("virtualizer did not track the scroll");
  }
  // #4 measured zero long frames on an idle machine, but a loaded machine
  // adds an occasional borderline 50–60 ms frame even to the validated
  // prototype (same-machine control, 2026-07-10). The worker-off pathology
  // this guards against is 15 long frames at p95 225 ms — so allow noise,
  // fail pathology.
  if (scroll.longFrames > 3) {
    failures.push(`${scroll.longFrames} long frames >50ms (bar: ≤3)`);
  }
  if (scroll.p95FrameMs > 50) {
    failures.push(`scroll p95 ${scroll.p95FrameMs}ms (bar: ≤50ms)`);
  }
  if (Math.max(...scroll.nodesWhileScrolling) > 2000) {
    failures.push(
      `live DOM while scrolling peaked at ${Math.max(...scroll.nodesWhileScrolling)} nodes (bar: ≤2000)`,
    );
  }
} else {
  failures.push("no scroll container found");
}
if (errors.length > 0) {
  failures.push(`page errors: ${errors.join(" | ")}`);
}

if (failures.length > 0) {
  console.error(`\nPERF BAR FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.error("\nPERF BAR HELD");

declare global {
  interface Window {
    __deepCount: () => number;
    __lineRange: () => [number, number] | null;
    __nextFrame: () => Promise<null>;
    __rows: () => number;
    __scroller: () => HTMLElement | null;
    __sleep: (ms: number) => Promise<null>;
    __sr: () => ShadowRoot | null;
  }
  interface Performance {
    memory?: { usedJSHeapSize: number };
  }
}
