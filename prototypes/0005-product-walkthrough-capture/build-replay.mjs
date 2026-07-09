// Build a single self-contained replay.html from the captured rrweb events.
// Uses rrweb's core Replayer (the reconstruction engine) + its CSS — no network,
// opens straight in a browser. A play/restart button drives it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NM = path.join(__dirname, "node_modules");
const rrwebJs = fs.readFileSync(path.join(NM, "rrweb/dist/rrweb.umd.min.cjs"), "utf8");
const rrwebCss = fs.readFileSync(path.join(NM, "rrweb/dist/style.css"), "utf8");
const events = fs.readFileSync(path.join(__dirname, "evidence/events.json"), "utf8");

const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Product walkthrough replay — spike</title>
<style>${rrwebCss}
body{margin:0;background:#0b0d12;color:#e6e6e6;font-family:system-ui;display:flex;flex-direction:column;align-items:center;padding:20px;gap:12px}
button{padding:8px 16px;border:0;border-radius:8px;background:#4f7cff;color:#fff;cursor:pointer}
#stage{width:480px;height:720px;background:#fff;border-radius:8px;overflow:hidden}</style>
</head><body>
<button id="play">▶ Play walkthrough</button>
<div id="stage"></div>
<script>${rrwebJs}</script>
<script>
  const events = ${events};
  const replayer = new rrweb.Replayer(events, { root: document.getElementById('stage'), speed: 1 });
  document.getElementById('play').onclick = () => { replayer.pause(); replayer.play(0); };
  replayer.play(0);
</script>
</body></html>`;

fs.writeFileSync(path.join(__dirname, "evidence/replay.html"), html);
console.log(`[spike] wrote evidence/replay.html (${(html.length / 1024).toFixed(0)} KB, self-contained)`);
