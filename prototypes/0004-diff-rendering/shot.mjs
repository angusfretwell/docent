import { chromium } from "playwright";

const b = await chromium.launch({
  ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
  args: ["--no-sandbox"],
});
const p = await b.newPage({ viewport: { height: 900, width: 1440 } });
await p.addInitScript(
  `window.__sr=()=>document.querySelector('diffs-container')?.shadowRoot;`
);
await p.goto(
  "http://localhost:4173/?fixture=three&worker=1&style=unified&annotate=1",
  { waitUntil: "load" }
);
await p.waitForTimeout(4000);
// scroll a touch so annotated lines (10,20) are in view near top
await p.screenshot({ path: "results/annotate.png" });
console.log(
  "annotations rendered:",
  await p.evaluate(
    () =>
      document
        .querySelector("diffs-container")
        ?.shadowRoot?.querySelectorAll("slot").length
  )
);
await b.close();
