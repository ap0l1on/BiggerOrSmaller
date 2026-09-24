import { DAILY_COUNT, NEAR_TIE_RATIO, RECENT_MEMORY } from "./constants";
import { APP_NAME, SHARE_EMOJI_UP } from "./constants";

export interface Company {
  id: string;
  name: string;
  country: string;
  sector: string;
  usd: number;
  fun?: string;
}

export interface ValuesFile {
  asOf: string;
  items: Company[];
}

/* ---------- seeded RNG (mulberry32 + string hash) ---------- */

export function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- pair picker ---------- */

export type Rng = () => number;

export function ratioBand(streak: number): [number, number] {
  if (streak <= 4) return [3, Infinity];
  if (streak <= 14) return [1.5, 3];
  return [1.1, 1.5];
}

function ratio(a: number, b: number): number {
  return Math.max(a, b) / Math.min(a, b);
}

export interface PickOptions {
  rng?: Rng;
  recentIds?: string[];
  excludeId?: string;
  preferMix?: boolean;
}

/** Pick the right card given the left card + streak. Returns null if impossible. */
export function pickNext(
  items: Company[],
  left: Company,
  streak: number,
  opts: PickOptions = {},
): Company | null {
  const rng = opts.rng ?? Math.random;
  const recent = new Set(opts.recentIds ?? []);
  const [lo, hi] = ratioBand(streak);

  const candidates = items.filter((c) => {
    if (c.id === left.id) return false;
    if (opts.excludeId && c.id === opts.excludeId) return false;
    if (recent.has(c.id)) return false;
    if (!Number.isFinite(c.usd) || c.usd <= 0) return false;
    const r = ratio(left.usd, c.usd);
    if (r < NEAR_TIE_RATIO) return false; // no near-ties (within 3%)
    if (r < lo) return false;
    if (r > hi) return false;
    return true;
  });

  if (candidates.length === 0) {
    // Fallback: relax ratio band but keep no-tie + no-repeat.
    const loose = items.filter((c) => {
      if (c.id === left.id) return false;
      if (recent.has(c.id)) return false;
      if (!Number.isFinite(c.usd) || c.usd <= 0) return false;
      if (ratio(left.usd, c.usd) < NEAR_TIE_RATIO) return false;
      return true;
    });
    if (loose.length === 0) return null;
    return loose[Math.floor(rng() * loose.length)];
  }

  const preferMix = opts.preferMix ?? true;
  if (preferMix) {
    const mixed = candidates.filter(
      (c) => c.country !== left.country || c.sector !== left.sector,
    );
    const pool = mixed.length > 0 ? mixed : candidates;
    return pool[Math.floor(rng() * pool.length)];
  }
  return candidates[Math.floor(rng() * candidates.length)];
}

/** Random company from the top 150 by value (used for run start). */
export function pickStart(items: Company[], rng: Rng = Math.random): Company | null {
  if (items.length === 0) return null;
  const sorted = [...items]
    .filter((c) => Number.isFinite(c.usd) && c.usd > 0)
    .sort((a, b) => b.usd - a.usd);
  const top = sorted.slice(0, Math.min(150, sorted.length));
  if (top.length === 0) return null;
  return top[Math.floor(rng() * top.length)];
}

export interface Round {
  left: Company;
  right: Company;
}

/** Build one endless round: left is given (or picked), right via picker. */
export function nextRound(
  items: Company[],
  current: Company | null,
  streak: number,
  recentIds: string[],
  rng: Rng = Math.random,
): Round | null {
  const left = current ?? pickStart(items, rng);
  if (!left) return null;
  const right = pickNext(items, left, streak, { rng, recentIds });
  if (!right) return null;
  return { left, right };
}

export function pushRecent(recent: string[], id: string): string[] {
  const out = [...recent, id].slice(-RECENT_MEMORY);
  return out;
}

/* ---------- answer + streak ---------- */

export type Guess = "bigger" | "smaller";

export function isCorrect(left: Company, right: Company, guess: Guess): boolean {
  if (right.usd === left.usd) return false;
  if (guess === "bigger") return right.usd > left.usd;
  return right.usd < left.usd;
}

export function nextStreak(streak: number, correct: boolean): number {
  return correct ? streak + 1 : 0;
}

export function nextBest(best: number, streak: number): number {
  return Math.max(best, streak);
}

/* ---------- daily challenge ---------- */

export function dailySeed(dateISO: string): number {
  return hashSeed("outweigh-daily-" + dateISO);
}

/** Same 10 pairs for everyone on a given UTC date. Deterministic. */
export function dailyPairs(items: Company[], dateISO: string): Round[] {
  const rng = mulberry32(dailySeed(dateISO));
  const rounds: Round[] = [];
  if (items.length < 12) return rounds;
  let recent: string[] = [];
  let current: Company | null = pickStart(items, rng);
  if (!current) return rounds;
  recent = pushRecent(recent, current.id);
  for (let i = 0; i < DAILY_COUNT; i++) {
    const r = ratioBand(i);
    void r;
    const nxt = pickNext(items, current, i, { rng, recentIds: recent });
    if (!nxt) break;
    rounds.push({ left: current, right: nxt });
    recent = pushRecent(recent, nxt.id);
    current = nxt;
  }
  return rounds;
}

export function dailyScoreGrid(results: boolean[]): string {
  return results.map((r) => (r ? "🟩" : "🟥")).join("");
}

/* ---------- share ---------- */

export function shareText(score: number, site: string): string {
  return `${APP_NAME}: ${score} in a row ${SHARE_EMOJI_UP}\nCan you beat it? ${site}`;
}

export function dailyShareText(
  score: number,
  total: number,
  dateISO: string,
  grid: string,
  site: string,
): string {
  return `${APP_NAME} daily ${dateISO}: ${score}/${total}\n${grid}\nCan you beat it? ${site}`;
}

/* ---------- validation ---------- */

export function validateValues(data: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (typeof data !== "object" || data === null) {
    return { ok: false, errors: ["root must be an object"] };
  }
  const d = data as Record<string, unknown>;
  if (typeof d.asOf !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d.asOf)) {
    errors.push("asOf must be YYYY-MM-DD");
  }
  if (!Array.isArray(d.items)) {
    errors.push("items must be an array");
    return { ok: false, errors };
  }
  const items = d.items as unknown[];
  if (items.length === 0) errors.push("items must not be empty");
  const seen = new Set<string>();
  items.forEach((raw, i) => {
    if (typeof raw !== "object" || raw === null) {
      errors.push(`items[${i}] must be an object`);
      return;
    }
    const c = raw as Record<string, unknown>;
    if (typeof c.id !== "string" || !c.id) errors.push(`items[${i}].id missing`);
    else if (seen.has(c.id)) errors.push(`duplicate id ${c.id}`);
    else seen.add(c.id);
    if (typeof c.name !== "string" || !c.name) errors.push(`items[${i}].name missing`);
    if (typeof c.country !== "string" || !c.country) errors.push(`items[${i}].country missing`);
    if (typeof c.sector !== "string" || !c.sector) errors.push(`items[${i}].sector missing`);
    if (typeof c.usd !== "number" || !Number.isFinite(c.usd) || c.usd <= 0)
      errors.push(`items[${i}].usd must be a positive number`);
    if (c.fun !== undefined && typeof c.fun !== "string")
      errors.push(`items[${i}].fun must be a string`);
  });
  return { ok: errors.length === 0, errors };
}

/* ---------- country flag + monogram ---------- */

export function countryToFlag(iso: string): string {
  const code = (iso || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (code.length !== 2) return "🏳️";
  const base = 0x1f1e6;
  const chars = [...code].map((ch) => String.fromCodePoint(base + ch.charCodeAt(0) - 65));
  return chars.join("");
}

export function monogram(name: string): string {
  const words = name
    .replace(/[^A-Za-z0-9& ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Deterministic tile colour (HSL) hashed from ticker id. */
export function tileColor(id: string): string {
  const h = hashSeed(id) % 360;
  return `hsl(${h} 55% 42%)`;
}

/** Country ISO -> readable label fallback (ISO itself when unknown). */
export function countryLabel(iso: string): string {
  const map: Record<string, string> = {
    US: "USA",
    CN: "China",
    JP: "Japan",
    DE: "Germany",
    FR: "France",
    GB: "UK",
    IN: "India",
    SA: "Saudi Arabia",
    KR: "South Korea",
    TW: "Taiwan",
    TR: "Türkiye",
    NL: "Netherlands",
    CH: "Switzerland",
    CA: "Canada",
    AU: "Australia",
    BR: "Brazil",
    ES: "Spain",
    IT: "Italy",
    SE: "Sweden",
    DK: "Denmark",
    NO: "Norway",
    FI: "Finland",
    IE: "Ireland",
    BE: "Belgium",
    AT: "Austria",
    AE: "UAE",
    SG: "Singapore",
    HK: "Hong Kong",
    KRX: "South Korea",
    CRYPTO: "Crypto",
  };
  return map[(iso || "").toUpperCase()] ?? iso;
}
