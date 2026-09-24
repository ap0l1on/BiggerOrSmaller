import { STORAGE_PREFIX } from "./constants";

/** localStorage wrapper: try/catch + schema checks. Hostile values reset cleanly. */

function key(name: string): string {
  return `${STORAGE_PREFIX}:${name}`;
}

function safeGet(keyName: string): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(key(keyName));
  } catch {
    return null;
  }
}

function safeSet(keyName: string, value: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key(keyName), value);
  } catch {
    // storage full / blocked — ignore, game still works in-memory
  }
}

export function loadBest(): number {
  const raw = safeGet("best");
  if (raw === null) return 0;
  try {
    const v = JSON.parse(raw);
    if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100000) {
      return Math.floor(v);
    }
    return 0;
  } catch {
    return 0;
  }
}

export function saveBest(best: number): void {
  safeSet("best", JSON.stringify(Math.max(0, Math.floor(best))));
}

export interface Settings {
  reducedMotion: boolean;
  crypto: boolean;
}

const DEFAULT_SETTINGS: Settings = { reducedMotion: false, crypto: false };

export function loadSettings(): Settings {
  const raw = safeGet("settings");
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const v = JSON.parse(raw) as Partial<Settings>;
    return {
      reducedMotion: v.reducedMotion === true,
      crypto: v.crypto === true,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  safeSet("settings", JSON.stringify({ reducedMotion: !!s.reducedMotion, crypto: !!s.crypto }));
}

export interface DailyResult {
  date: string;
  score: number;
  total: number;
  grid: string;
}

export function loadDaily(dateISO: string): DailyResult | null {
  const raw = safeGet("daily:" + dateISO);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<DailyResult>;
    if (v.date !== dateISO) return null;
    if (typeof v.score !== "number" || typeof v.total !== "number" || typeof v.grid !== "string")
      return null;
    if (!Number.isFinite(v.score) || !Number.isFinite(v.total)) return null;
    if (v.grid.length > 20) return null;
    return { date: v.date, score: v.score, total: v.total, grid: v.grid };
  } catch {
    return null;
  }
}

export function saveDaily(r: DailyResult): void {
  safeSet("daily:" + r.date, JSON.stringify(r));
}

/** No-op analytics hook. Cloudflare beacon handles page views. */
export function track(_event: string, _data?: Record<string, unknown>): void {
  // intentionally empty — kept so future events have one call site.
}
