// Checks the gzipped JS budget (<80 KB). Run after `vite build`.
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const dir = new URL("../dist/assets", import.meta.url);
let total = 0;
try {
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".js")) continue;
    const p = join(dir.pathname, f);
    const raw = readFileSync(p);
    const gz = gzipSync(raw);
    total += gz.length;
    console.log(`${f}: ${(gz.length / 1024).toFixed(1)} KB gzipped`);
  }
} catch {
  console.error("dist/assets not found — run `npm run build` first");
  process.exit(1);
}
console.log(`total JS gzipped: ${(total / 1024).toFixed(1)} KB (budget 80 KB)`);
if (total > 80 * 1024) {
  console.error("JS budget exceeded");
  process.exit(1);
}
