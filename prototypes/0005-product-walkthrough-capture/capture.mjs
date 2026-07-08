// THROWAWAY SPIKE — product-walkthrough capture pipeline (wayfinder #5)
// Proves: rrweb session recording + static screenshots of a *running, served* app,
// driven headlessly by Playwright (the "agent drives the browser" model).
// Run: node capture.mjs
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.join(__dirname, "sample-app");
const OUT = path.join(__dirname, "evidence");
const RRWEB = fs.readFileSync(path.join(__dirname, "node_modules/rrweb/dist/rrweb.umd.min.cjs"), "utf8");

// --- 1. Stand in for "the dev server": a trivial static server -------------
const server = http.createServer((req, res) => {
  const f = req.url === "/" ? "/index.html" : req.url;
  const p = path.join(APP_DIR, f);
  if (!p.startsWith(APP_DIR) || !fs.existsSync(p)) { res.writeHead(404); return res.end("nf"); }
  res.writeHead(200, { "content-type": "text/html" });
  res.end(fs.readFileSync(p));
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const url = `http://localhost:${port}/`;
console.log(`[spike] dev server on ${url}`);

// --- 2. Launch the browser (agent-driven, headless) ------------------------
const browser = await chromium.launch({
  // pinned playwright build differs from the pre-installed browser; point at it directly
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const page = await browser.newPage({ viewport: { width: 480, height: 720 } });

const shots = [];
async function shot(name) {
  const file = path.join(OUT, `${String(shots.length + 1).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  shots.push({ name, file: path.basename(file), at: shots.length });
  console.log(`[spike] screenshot -> ${path.basename(file)}`);
}

await page.goto(url, { waitUntil: "networkidle" });

// --- 3. Inject rrweb and start recording -----------------------------------
await page.addScriptTag({ content: RRWEB });
await page.evaluate(() => {
  window.__events = [];
  window.rrweb.record({ emit: (e) => window.__events.push(e), recordCanvas: false });
});

// --- 4. Drive the flow like a reviewer walking through the change ----------
await shot("initial");
await page.fill("#email", "reviewer@docent.dev");
await page.fill("#pw", "short");        // triggers "Too short" validation
await shot("password-too-short");
await page.fill("#pw", "correct-horse-battery");
await shot("valid-ready-to-submit");
await page.click("#submit");
await page.waitForSelector(".toast.show");
await shot("success-toast");

// flush rrweb + pull events
await page.evaluate(() => window.rrweb.record.takeFullSnapshot?.());
await page.waitForTimeout(200);
const events = await page.evaluate(() => window.__events);

await browser.close();
server.close();

// --- 5. Persist the capture ------------------------------------------------
fs.writeFileSync(path.join(OUT, "events.json"), JSON.stringify(events));
const manifest = {
  capturedAt: new Date().toISOString(),
  source: url,
  driver: "playwright/chromium headless (agent-driven)",
  rrwebEvents: events.length,
  screenshots: shots,
};
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`[spike] wrote ${events.length} rrweb events + ${shots.length} screenshots to evidence/`);
