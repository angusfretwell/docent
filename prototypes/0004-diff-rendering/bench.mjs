// Playwright driver for the diffs.com perf prototype (docent #4).
// Loads the built app against a fixture, measures time-to-render, proves
// virtualization (bounded DOM — piercing the diffs-container shadow root),
// samples scroll frame times, and screenshots.

import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:4173";
const OUT = process.env.OUT_DIR ?? "results";
await mkdir(OUT, { recursive: true });

const runs = [
  { fixture: "three", style: "unified", worker: "1" },
  { fixture: "three", style: "unified", worker: "0" },
  { fixture: "three-xl", style: "unified", worker: "1" },
  { fixture: "three-xl", style: "split", worker: "1" },
];

// Shared browser-side helpers, injected into every evaluate.
const HELPERS = `
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
    // The CodeView is its own scroll container. Pick the largest element that
    // is *actually scrollable* — computed overflow-y auto|scroll AND content
    // that overflows. (A prior version keyed only on scrollHeight>clientHeight;
    // that also matches overflow:visible elements, and setting scrollTop on
    // those is a no-op — so it "scrolled" a page that never moved. Require a
    // real scroller, piercing shadow roots.)
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
    // Min/max of the materialized [data-line] rows — the window of lines the
    // virtualizer currently has in the DOM. If this shifts as we scroll, the
    // virtualizer is tracking the scroll (not stuck on the first viewport).
    const sr = window.__sr();
    if (!sr) return null;
    const nums = [...sr.querySelectorAll('[data-line]')]
      .map((r) => Number(r.getAttribute('data-line')))
      .filter((n) => Number.isFinite(n));
    return nums.length ? [Math.min(...nums), Math.max(...nums)] : null;
  };
`;

const browser = await chromium.launch({
  // Use $CHROME_BIN when set (e.g. the build container's system chromium);
  // otherwise fall back to Playwright's bundled browser so this runs locally.
  ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
  args: ["--no-sandbox", "--enable-precise-memory-info"],
});

const results = [];
for (const run of runs) {
  const label = `${run.fixture}·worker=${run.worker}·${run.style}`;
  const page = await browser.newPage({
    viewport: { height: 900, width: 1440 },
  });
  await page.addInitScript(HELPERS);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("console", (m) => {
    if (m.type() === "error") {
      errors.push(m.text().slice(0, 200));
    }
  });

  const url = `${BASE}/?fixture=${run.fixture}&worker=${run.worker}&style=${run.style}`;
  await page.goto(url, { waitUntil: "load" });

  const measured = await page.evaluate(async () => {
    const t0 = window.__meta?.t0 ?? performance.now();

    // Time to first rendered rows (structure painted).
    let firstRowsMs = null;
    while (firstRowsMs == null) {
      if (window.__rows() > 0) {
        firstRowsMs = performance.now() - t0;
      }
      await new Promise((r) => requestAnimationFrame(r));
      if (performance.now() - t0 > 30_000) {
        break;
      }
    }

    // Settle: no shadow-DOM mutations for 600ms (structure + async worker
    // tokenization/highlighting done).
    await new Promise((resolve) => {
      const sr = window.__sr();
      if (!sr) {
        return resolve();
      }
      let timer = setTimeout(done, 600);
      const obs = new MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(done, 600);
      });
      obs.observe(sr, { characterData: true, childList: true, subtree: true });
      function done() {
        obs.disconnect();
        resolve();
      }
      setTimeout(done, 30_000);
    });
    const settledMs = performance.now() - t0;

    const el = window.__scroller();
    const mem = performance.memory
      ? Math.round(performance.memory.usedJSHeapSize / 1_048_576)
      : null;
    return {
      clientHeight: el?.clientHeight ?? 0,
      deepNodes: window.__deepCount(),
      firstRowsMs: Math.round(firstRowsMs ?? -1),
      heapMB: mem,
      meta: window.__meta,
      rowNodes: window.__rows(),
      scrollHeight: el?.scrollHeight ?? 0,
      settledMs: Math.round(settledMs),
    };
  });

  // Scroll sampling: jump through the whole diff, record frame intervals and
  // confirm the node count stays bounded while scrolling.
  const scrollStats = await page.evaluate(async () => {
    const el = window.__scroller();
    if (!el) {
      return null;
    }
    el.scrollTop = 0;
    await new Promise((r) => requestAnimationFrame(r));
    const rangeTop = window.__lineRange();
    const max = el.scrollHeight - el.clientHeight;
    const steps = 40;
    const frames = [];
    const nodeSamples = [];
    let last = performance.now();
    for (let i = 1; i <= steps; i++) {
      el.scrollTop = (max * i) / steps;
      await new Promise((r) => requestAnimationFrame(r));
      const now = performance.now();
      frames.push(now - last);
      last = now;
      if (i % 10 === 0) {
        nodeSamples.push(window.__deepCount());
      }
    }
    // Let the virtualizer settle its DOM after the final jump before sampling
    // the bottom window (worker-off can still be tokenizing mid-scroll).
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => setTimeout(r, 100));
    const rangeBottom = window.__lineRange();
    const sorted = [...frames].sort((a, b) => a - b);
    const pct = (p) => sorted[Math.floor((sorted.length - 1) * p)];
    return {
      longFrames: frames.filter((f) => f > 50).length,
      maxFrameMs: Math.round(Math.max(...frames) * 10) / 10,
      medianFrameMs: Math.round(pct(0.5) * 10) / 10,
      nodesWhileScrolling: nodeSamples,
      p95FrameMs: Math.round(pct(0.95) * 10) / 10,
      rangeBottom,
      rangeTop,
      // Proof the scroll actually moved and the virtualizer tracked it: the
      // materialized line window must shift between top and bottom.
      scrolledPx: Math.round(el.scrollTop),
      virtualizationFollows:
        !!rangeTop &&
        !!rangeBottom &&
        JSON.stringify(rangeTop) !== JSON.stringify(rangeBottom),
    };
  });

  await page.evaluate(() => {
    const el = window.__scroller();
    if (el) {
      el.scrollTop = 0;
    }
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${label.replace(/[·=]/g, "_")}.png` });

  results.push({ label, ...run, ...measured, errors, scroll: scrollStats });
  console.log(
    `${label.padEnd(28)} first=${measured.firstRowsMs}ms settled=${measured.settledMs}ms ` +
      `deepNodes=${measured.deepNodes} rows=${measured.rowNodes} heap=${measured.heapMB}MB ` +
      `scroll p95=${scrollStats?.p95FrameMs}ms long50=${scrollStats?.longFrames} ` +
      `follows=${scrollStats?.virtualizationFollows} ` +
      `range=${JSON.stringify(scrollStats?.rangeTop)}->${JSON.stringify(scrollStats?.rangeBottom)} ` +
      `nodesScrolling=${JSON.stringify(scrollStats?.nodesWhileScrolling)}` +
      (errors.length ? ` ERRORS=${errors.length}` : "")
  );
  await page.close();
}

await browser.close();
await writeFile(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log(`\nwrote ${OUT}/results.json`);
