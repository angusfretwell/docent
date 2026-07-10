// Stand-in for "the dev server": a trivial static server for sample-app/.
// The capture pipeline's contract (#5) is only "app served over HTTP at a known
// URL, reachable from the driver" — booting it is upstream of the driver.
// Run: node serve.mjs [port]   (prints the URL, stays up until killed)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.join(__dirname, "sample-app");
const port = Number(process.argv[2] || 5599);

http
  .createServer((req, res) => {
    const f = req.url === "/" ? "/index.html" : req.url.split("?")[0];
    const p = path.join(APP_DIR, f);
    if (!p.startsWith(APP_DIR) || !fs.existsSync(p)) {
      res.writeHead(404);
      return res.end("nf");
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(fs.readFileSync(p));
  })
  .listen(port, () => console.log(`http://localhost:${port}/`));
