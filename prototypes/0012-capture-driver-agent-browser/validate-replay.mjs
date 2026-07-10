// Load the self-contained replay.html headlessly and confirm rrweb actually
// reconstructs the recorded app DOM inside the player's iframe.
//
// #5's validator did this with Playwright. This one drives the SAME agent-browser
// CLI used for capture — so the whole spike (capture + validate) needs no
// Playwright and no bundled-browser download, only system Chrome over CDP.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION = "cap-validate";
const ab = (...args) =>
  execFileSync("agent-browser", ["--session", SESSION, ...args], { encoding: "utf8" });
const evalJson = (js) => JSON.parse(ab("eval", js, "--json")).data.result;

const replay = "file://" + path.join(__dirname, "evidence/replay.html");
ab("open", replay);
ab("wait", "1500"); // let the player auto-play to the end so the toast is reconstructed

// rrweb's Replayer renders into an iframe inside #stage. Reach into it (same-origin file://).
const rebuilt = evalJson(`(() => {
  const doc = document.querySelector('#stage iframe')?.contentDocument;
  if (!doc) return { iframe: false };
  return {
    iframe: true,
    hasForm: !!doc.querySelector('#email'),
    heading: doc.querySelector('h1')?.textContent,
    toastText: doc.querySelector('#toast')?.textContent?.trim(),
  };
})()`);

ab("screenshot", "--full", path.join(__dirname, "evidence/05-replay-reconstructed.png"));
ab("close");

console.log("[validate] reconstructed DOM:", JSON.stringify(rebuilt));
const ok = rebuilt.iframe && rebuilt.hasForm && /Create your account/.test(rebuilt.heading || "");
console.log(ok ? "[validate] PASS — rrweb reconstructed the recorded app" : "[validate] FAIL");
process.exit(ok ? 0 : 1);
