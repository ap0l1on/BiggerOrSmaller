/**
 * Daily market-cap builder. Runs ONLY in GitHub Actions (or manually).
 *
 * 1. Reads data/companies.json (hand-curated tickers).
 * 2. Fetches marketCap + currency per ticker via yahoo-finance2 quote().
 *    Retry 3x with backoff, ~300ms between calls.
 * 3. Converts to USD with same-day Yahoo FX (USDTRY=X, EURUSD=X, ...).
 * 4. Drops missing/zero/suspicious (>60% move vs previous run), logs to
 *    data/build-report.md.
 * 5. Writes public/values.json { asOf, items[] } rounded to 3 sig figs.
 * 6. Exits non-zero (keeping yesterday's file) when <200 valid entries.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { convertToUSD, isSuspiciousMove, round3sig } from "../src/format";
import { validateValues } from "../src/game";

interface CompanyDef {
  ticker: string;
  name: string;
  country: string;
  sector: string;
  fun?: string;
  kind?: string;
}

interface ValueItem {
  id: string;
  name: string;
  country: string;
  sector: string;
  usd: number;
  fun?: string;
  kind?: string;
}

const COMPANIES_PATH = new URL("../data/companies.json", import.meta.url);
const VALUES_PATH = new URL("../public/values.json", import.meta.url);
const REPORT_PATH = new URL("../data/build-report.md", import.meta.url);

const MIN_VALID = 200;
const DELAY_MS = 300;

function todayISO(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T | null> {
  let last: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      const backoff = 500 * Math.pow(2, attempt - 1);
      console.warn(`retry ${attempt}/3 ${label}: ${String(err).slice(0, 160)}`);
      await sleep(backoff);
    }
  }
  console.warn(`drop ${label} after 3 attempts: ${String(last).slice(0, 160)}`);
  return null;
}

interface Quote {
  marketCap?: number;
  currency?: string;
}

async function main(): Promise<void> {
  const defs = JSON.parse(readFileSync(COMPANIES_PATH, "utf8")) as CompanyDef[];
  console.log(`tickers: ${defs.length}`);
  const asOf = todayISO();

  const { default: yahooFinance } = await import("yahoo-finance2");

  // Previous values for the >60% drop rule.
  let prev = new Map<string, number>();
  try {
    if (existsSync(VALUES_PATH)) {
      const old = JSON.parse(readFileSync(VALUES_PATH, "utf8")) as {
        items?: { id: string; usd: number }[];
      };
      for (const it of old.items ?? []) {
        if (it.id && Number.isFinite(it.usd)) prev.set(it.id, it.usd);
      }
    }
  } catch {
    prev = new Map();
  }

  // 1. Fetch quotes one by one (~300ms apart to be polite).
  const quotes = new Map<string, Quote>();
  const currencies = new Set<string>();
  for (const def of defs) {
    const q = await withRetry(
      () =>
        yahooFinance.quote(def.ticker, {}, { validateResult: false }) as Promise<Quote>,
      def.ticker,
    );
    if (q && Number.isFinite(q.marketCap) && (q.marketCap as number) > 0) {
      quotes.set(def.ticker, { marketCap: q.marketCap, currency: q.currency ?? "USD" });
      const cur = (q.currency ?? "USD").toUpperCase();
      if (cur !== "USD") currencies.add(cur);
    } else {
      quotes.set(def.ticker, {});
    }
    await sleep(DELAY_MS);
  }

  // 2. Fetch FX rates for every foreign currency seen.
  const fx: Record<string, number> = {};
  for (const cur of [...currencies].sort()) {
    // Try direct (EURUSD=X) then indirect (USDTRY=X).
    const symbols = [`${cur}USD=X`, `USD${cur}=X`];
    for (const sym of symbols) {
      const q = await withRetry(
        () => yahooFinance.quote(sym, {}, { validateResult: false }) as Promise<{ regularMarketPrice?: number }>,
        sym,
      );
      const px = q?.regularMarketPrice;
      if (Number.isFinite(px) && (px as number) > 0) {
        const key = sym.replace("=X", "");
        fx[key] = px as number;
      }
      await sleep(DELAY_MS);
    }
  }
  console.log(`fx: ${JSON.stringify(fx)}`);

  // 3. Convert + drop rules.
  const items: ValueItem[] = [];
  const dropped: { id: string; reason: string }[] = [];
  for (const def of defs) {
    const q = quotes.get(def.ticker);
    const cap = q?.marketCap;
    const cur = (q?.currency ?? "").toUpperCase() || "USD";
    if (!Number.isFinite(cap) || (cap as number) <= 0) {
      dropped.push({ id: def.ticker, reason: `missing/zero marketCap (currency=${cur || "?"})` });
      continue;
    }
    const usdRaw = convertToUSD(cap as number, cur, fx);
    if (!Number.isFinite(usdRaw) || (usdRaw as number) <= 0) {
      dropped.push({ id: def.ticker, reason: `no FX path for ${cur}` });
      continue;
    }
    const usd = round3sig(usdRaw as number);
    if (!Number.isFinite(usd) || usd <= 0) {
      dropped.push({ id: def.ticker, reason: "rounding produced non-positive value" });
      continue;
    }
    const p = prev.get(def.ticker);
    if (p !== undefined && isSuspiciousMove(p, usd)) {
      dropped.push({
        id: def.ticker,
        reason: `moved >60% since last run (prev=${p}, next=${usd}); dropped without confirmed reason`,
      });
      continue;
    }
    const item: ValueItem = {
      id: def.ticker,
      name: def.name,
      country: def.country,
      sector: def.sector,
      usd,
    };
    if (def.fun) item.fun = def.fun;
    if (def.kind === "crypto") item.kind = "crypto";
    items.push(item);
  }

  items.sort((a, b) => b.usd - a.usd);

  // 4. Gate: keep yesterday's file when <200 valid.
  const reportLines = [
    `# Build report — ${asOf}`,
    ``,
    `- Tickers attempted: ${defs.length}`,
    `- Valid: ${items.length}`,
    `- Dropped: ${dropped.length}`,
    `- FX pairs: ${Object.keys(fx).length}`,
    ``,
    dropped.length === 0 ? `No drops.` : `## Drops`,
    ...dropped.map((d) => `- ${d.id}: ${d.reason}`),
    ``,
  ];
  writeFileSync(REPORT_PATH, reportLines.join("\n"));

  if (items.length < MIN_VALID) {
    console.error(
      `FAIL: only ${items.length} valid entries (<${MIN_VALID}); keeping previous values.json`,
    );
    process.exit(1);
  }

  const out = { asOf, items };
  const check = validateValues(out);
  if (!check.ok) {
    console.error("FAIL: schema invalid: " + check.errors.join("; "));
    process.exit(1);
  }
  writeFileSync(VALUES_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log(`wrote ${items.length} items as of ${asOf}`);
}

await main();
