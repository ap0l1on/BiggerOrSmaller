/** Number formatting + pipeline math. Pure functions, fully tested. */

/** Round to 3 significant figures. */
export function round3sig(n: number): number {
  if (!Number.isFinite(n) || n === 0) return 0;
  const sign = Math.sign(n);
  const abs = Math.abs(n);
  const exp = Math.floor(Math.log10(abs));
  const factor = Math.pow(10, exp - 2);
  return sign * Math.round(abs / factor) * factor;
}

/** Format a USD market cap: $3.42T, $812B, $4.70B, $950M, $12.3M, $… */
export function formatUSD(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return "$—";
  const T = 1e12;
  const B = 1e9;
  const M = 1e6;
  if (usd >= T) return "$" + trim3(usd / T) + "T";
  if (usd >= B) return "$" + trim3(usd / B) + "B";
  if (usd >= M) return "$" + trim3(usd / M) + "M";
  if (usd >= 1e3) return "$" + trim3(usd / 1e3) + "K";
  return "$" + trim3(usd);
}

/** Keep 3 significant figures for display, US separators where relevant. */
function trim3(n: number): string {
  if (n >= 100) {
    return String(Math.round(n));
  }
  if (n >= 10) {
    const r = Math.round(n * 10) / 10;
    return r.toFixed(1).replace(/\.0$/, "");
  }
  const r = Math.round(n * 100) / 100;
  // Keep up to 2 decimals, strip trailing zeros.
  return String(r);
}

/** Convert a market cap in local currency to USD. */
export function convertToUSD(
  marketCap: number,
  currency: string,
  fx: Record<string, number>,
): number | null {
  if (!Number.isFinite(marketCap) || marketCap <= 0) return null;
  const cur = (currency || "USD").toUpperCase();
  if (cur === "USD" || cur === "USUSD" || cur === "USDT") return marketCap;
  // fx maps e.g. { EURUSD: 1.08, USDTRY: 34.1, ... } — value of 1 unit of
  // foreign currency expressed two ways; we normalise to "units per USD"
  // via explicit XXXUSD (foreign per USD?) — actually we store both forms.
  // Supported forms:
  //   - "{CUR}USD=X" style direct: EURUSD = USD per EUR
  //   - "USD{CUR}=X" style indirect: USDTRY = TRY per USD
  const direct = fx[cur + "USD"];
  if (Number.isFinite(direct) && direct > 0) {
    return marketCap * (direct as number);
  }
  const indirect = fx["USD" + cur];
  if (Number.isFinite(indirect) && indirect > 0) {
    return marketCap / (indirect as number);
  }
  // Some Yahoo currency codes need mapping.
  const aliases: Record<string, string> = {
    GBp: "GBP", // pence -> pounds handled below
    ILA: "ILS",
    ZAc: "ZAR",
  };
  const mapped = aliases[cur];
  if (mapped) {
    if (cur === "GBp") {
      const gbp = marketCap / 100;
      const d = fx["GBPUSD"];
      if (Number.isFinite(d) && (d as number) > 0) return gbp * (d as number);
      const ind = fx["USDGBP"];
      if (Number.isFinite(ind) && (ind as number) > 0) return gbp / (ind as number);
      return null;
    }
    return convertToUSD(marketCap, mapped, fx);
  }
  return null;
}

/** Drop rule: true when a move of >60% vs previous value is suspicious. */
export function isSuspiciousMove(prev: number, next: number): boolean {
  if (!Number.isFinite(prev) || prev <= 0) return false;
  if (!Number.isFinite(next) || next <= 0) return true;
  const ratio = next / prev;
  return ratio < 0.4 || ratio > 1.6;
}
