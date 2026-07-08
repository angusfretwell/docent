// Load the self-contained replay.html headlessly and confirm rrweb actually
// reconstructs the recorded app DOM inside the player's iframe.
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: 560, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto("file://" + path.join(__dirname, "evidence/replay.html"), { waitUntil: "networkidle" });

// drive the player to the end so the final DOM (toast) is reconstructed
await page.evaluate(() => document.querySelector(".rr-progress")?.click());
await page.waitForTimeout(500);

const frame = page.frames().find((f) => f !== page.mainFrame());
const rebuilt = frame
  ? await frame.evaluate(() => ({
      hasForm: !!document.querySelector("#email"),
      heading: document.querySelector("h1")?.textContent,
      toastText: document.querySelector("#toast")?.textContent,
    }))
  : null;

await page.screenshot({ path: path.join(__dirname, "evidence/05-replay-rendered.png"), fullPage: true });
await browser.close();

console.log("[validate] player pageerrors:", errors.length ? errors : "none");
console.log("[validate] iframe present:", !!frame);
console.log("[validate] reconstructed DOM:", JSON.stringify(rebuilt));
const ok = frame && rebuilt?.hasForm && /Create your account/.test(rebuilt.heading || "");
console.log(ok ? "[validate] PASS — rrweb reconstructed the recorded app" : "[validate] FAIL");
process.exit(ok ? 0 : 1);
