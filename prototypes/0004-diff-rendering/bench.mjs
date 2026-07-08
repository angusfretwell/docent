// Playwright driver for the diffs.com perf prototype (docent #4).
// Loads the built app against a fixture, measures time-to-render, proves
// virtualization (bounded DOM — piercing the diffs-container shadow root),
// samples scroll frame times, and screenshots.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "http://localhost:4173";
const OUT = process.env.OUT_DIR ?? "results";
await mkdir(OUT, { recursive: true });

const runs = [
  { fixture: "three", worker: "1", style: "unified" },
  { fixture: "three", worker: "0", style: "unified" },
  { fixture: "three-xl", worker: "1", style: "unified" },
  { fixture: "three-xl", worker: "1", style: "split" },
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
    // The CodeView owns an internal native scroller; pick the largest
    // scrollable element that isn't our outer #scroll wrapper.
    let best = null;
    for (const el of document.querySelectorAll('*')) {
      if (el.id === 'scroll') continue;
      const over = el.scrollHeight - el.clientHeight;
      if (over > 200 && (!best || over > best.scrollHeight - best.clientHeight)) best = el;
    }
    return best;
  };
`;

const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_BIN ??
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--enable-precise-memory-info"],
});

const results = [];
for (const run of runs) {
  const label = `${run.fixture}·worker=${run.worker}·${run.style}`;
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(HELPERS);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 200));
  });

  const url = `${BASE}/?fixture=${run.fixture}&worker=${run.worker}&style=${run.style}`;
  await page.goto(url, { waitUntil: "load" });

  const measured = await page.evaluate(async () => {
    const t0 = window.__meta?.t0 ?? performance.now();

    // Time to first rendered rows (structure painted).
    let firstRowsMs = null;
    while (firstRowsMs == null) {
      if (window.__rows() > 0) firstRowsMs = performance.now() - t0;
      await new Promise((r) => requestAnimationFrame(r));
      if (performance.now() - t0 > 30000) break;
    }

    // Settle: no shadow-DOM mutations for 600ms (structure + async worker
    // tokenization/highlighting done).
    await new Promise((resolve) => {
      const sr = window.__sr();
      if (!sr) return resolve();
      let timer = setTimeout(done, 600);
      const obs = new MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(done, 600);
      });
      obs.observe(sr, { childList: true, subtree: true, characterData: true });
      function done() {
        obs.disconnect();
        resolve();
      }
      setTimeout(done, 30000);
    });
    const settledMs = performance.now() - t0;

    const el = window.__scroller();
    const mem = performance.memory
      ? Math.round(performance.memory.usedJSHeapSize / 1048576)
      : null;
    return {
      meta: window.__meta,
      firstRowsMs: Math.round(firstRowsMs ?? -1),
      settledMs: Math.round(settledMs),
      deepNodes: window.__deepCount(),
      rowNodes: window.__rows(),
      scrollHeight: el?.scrollHeight ?? 0,
      clientHeight: el?.clientHeight ?? 0,
      heapMB: mem,
    };
  });

  // Scroll sampling: jump through the whole diff, record frame intervals and
  // confirm the node count stays bounded while scrolling.
  const scrollStats = await page.evaluate(async () => {
    const el = window.__scroller();
    if (!el) return null;
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
      if (i % 10 === 0) nodeSamples.push(window.__deepCount());
    }
    const sorted = [...frames].sort((a, b) => a - b);
    const pct = (p) => sorted[Math.floor((sorted.length - 1) * p)];
    return {
      medianFrameMs: Math.round(pct(0.5) * 10) / 10,
      p95FrameMs: Math.round(pct(0.95) * 10) / 10,
      maxFrameMs: Math.round(Math.max(...frames) * 10) / 10,
      longFrames: frames.filter((f) => f > 50).length,
      nodesWhileScrolling: nodeSamples,
    };
  });

  await page.evaluate(() => {
    const el = window.__scroller();
    if (el) el.scrollTop = 0;
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${label.replace(/[·=]/g, "_")}.png` });

  results.push({ label, ...run, ...measured, scroll: scrollStats, errors });
  console.log(
    `${label.padEnd(28)} first=${measured.firstRowsMs}ms settled=${measured.settledMs}ms ` +
      `deepNodes=${measured.deepNodes} rows=${measured.rowNodes} heap=${measured.heapMB}MB ` +
      `scroll p95=${scrollStats?.p95FrameMs}ms long50=${scrollStats?.longFrames} ` +
      `nodesScrolling=${JSON.stringify(scrollStats?.nodesWhileScrolling)}` +
      (errors.length ? ` ERRORS=${errors.length}` : "")
  );
  await page.close();
}

await browser.close();
await writeFile(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log(`\nwrote ${OUT}/results.json`);
