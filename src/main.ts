import { APP_NAME, APP_TAGLINE, DAILY_COUNT, siteUrl } from "./constants";
import { formatUSD } from "./format";
import {
  countryLabel,
  dailyPairs,
  dailyScoreGrid,
  dailyShareText,
  hashSeed,
  isCorrect,
  monogram,
  nextBest,
  nextRound,
  pushRecent,
  shareText,
  validateValues,
  type Company,
  type Guess,
} from "./game";
import {
  loadBest,
  loadDaily,
  loadSettings,
  saveBest,
  saveDaily,
  saveSettings,
  track,
} from "./store";
import "./style.css";

type Mode = "home" | "endless" | "daily";
type Phase = "guess" | "reveal";

interface State {
  mode: Mode;
  items: Company[];
  asOf: string;
  streak: number;
  best: number;
  left: Company | null;
  right: Company | null;
  recent: string[];
  phase: Phase;
  dailyIndex: number;
  dailyResults: boolean[];
  dailyDone: boolean;
}

const state: State = {
  mode: "home",
  items: [],
  asOf: "",
  streak: 0,
  best: loadBest(),
  left: null,
  right: null,
  recent: [],
  phase: "guess",
  dailyIndex: 0,
  dailyResults: [],
  dailyDone: false,
};

let dailyRounds: { left: Company; right: Company }[] = [];
let vsTurns = 0;
let teaserTimer = 0;
let clockTimer = 0;

function el<T extends HTMLElement>(id: string): T {
  const n = document.getElementById(id);
  if (!n) throw new Error("missing #" + id);
  return n as T;
}

function todayISO(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function reducedMotion(): boolean {
  try {
    return (
      loadSettings().reducedMotion ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
}

function buzz(): void {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(10);
    }
  } catch {
    // unsupported — ignore
  }
}

/** Deep tint of the company's hashed colour for full-bleed panels. */
export function panelTint(id: string): string {
  const h = hashSeed(id) % 360;
  return `hsl(${h} 55% 12%)`;
}

/* ---------- odometer count-up (800 ms) ---------- */

function countUp(node: HTMLElement, from: number, to: number, done: () => void): void {
  node.classList.remove("rolling");
  if (reducedMotion()) {
    node.textContent = formatUSD(to);
    done();
    return;
  }
  // force reflow so the roll animation restarts
  void node.offsetWidth;
  node.classList.add("rolling");
  const dur = 800;
  const t0 = performance.now();
  function frame(t: number): void {
    const p = Math.min(1, (t - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    const v = from + (to - from) * eased;
    node.textContent = formatUSD(Math.max(1, v));
    if (p < 1) requestAnimationFrame(frame);
    else {
      node.textContent = formatUSD(to);
      done();
    }
  }
  requestAnimationFrame(frame);
}

/* ---------- data ---------- */

async function loadValues(): Promise<void> {
  const status = el("load-status");
  try {
    const res = await fetch("./values.json", { cache: "no-store" });
    if (!res.ok) throw new Error("http " + res.status);
    const data: unknown = await res.json();
    const v = validateValues(data);
    if (!v.ok) throw new Error(v.errors.join("; "));
    const d = data as { asOf: string; items: Company[] };
    const settings = loadSettings();
    state.items = settings.crypto ? d.items : d.items.filter((c) => !isCrypto(c));
    state.asOf = d.asOf;
    status.textContent = "";
    buildTape();
    renderAll();
  } catch (err) {
    status.textContent = "Could not load market data. Check your connection and reload.";
    void err;
  }
}

function isCrypto(c: Company): boolean {
  return (
    c.country === "CRYPTO" ||
    /^(BTC|ETH|SOL|BNB|XRP)-USD$/.test(c.id) ||
    c.sector.toLowerCase() === "crypto"
  );
}

/* ---------- ticker tape ---------- */

function buildTape(): void {
  const track = el("tape-track");
  while (track.firstChild) track.removeChild(track.firstChild);
  const top = [...state.items].sort((a, b) => b.usd - a.usd).slice(0, 24);
  if (top.length === 0) return;
  const frag = document.createDocumentFragment();
  for (let copy = 0; copy < 2; copy++) {
    top.forEach((c, i) => {
      const s = document.createElement("span");
      const prev = top[(i + 1) % top.length];
      const dir = c.usd >= prev.usd ? "▲" : "▼";
      const cls = c.usd >= prev.usd ? "tk-up" : "tk-down";
      const sym = document.createElement("span");
      sym.className = "tk-sym";
      sym.textContent = ` ${c.id.replace("-USD", "")} ${formatUSD(c.usd)} `;
      const arrow = document.createElement("span");
      arrow.className = cls;
      arrow.textContent = dir;
      const sep = document.createElement("span");
      sep.textContent = " · ";
      s.appendChild(sym);
      s.appendChild(arrow);
      s.appendChild(sep);
      frag.appendChild(s);
    });
  }
  track.appendChild(frag);
}

/* ---------- rendering ---------- */

function setScreen(name: Mode): void {
  state.mode = name;
  el("screen-home").hidden = name !== "home";
  el("screen-game").hidden = name === "home";
  if (name === "home") startTeaser();
  else stopTeaser();
  renderAll();
}

function panelInto(panelId: string, c: Company | null, showValue: boolean, kicker: string): void {
  const root = el(panelId);
  while (root.firstChild) root.removeChild(root.firstChild);
  if (!c) {
    const p = document.createElement("p");
    p.textContent = "Loading…";
    root.appendChild(p);
    return;
  }
  root.style.setProperty("--tint", panelTint(c.id));

  const wm = document.createElement("div");
  wm.className = "watermark";
  wm.setAttribute("aria-hidden", "true");
  wm.textContent = monogram(c.name);
  root.appendChild(wm);

  const kick = document.createElement("p");
  kick.className = "company-kicker";
  kick.textContent = kicker;
  root.appendChild(kick);

  const h = document.createElement("p");
  h.className = "company-name";
  h.textContent = c.name;
  root.appendChild(h);

  const pills = document.createElement("div");
  pills.className = "pill-row";
  const country = document.createElement("span");
  country.className = "pill";
  country.textContent = countryLabel(c.country).toUpperCase();
  const sector = document.createElement("span");
  sector.className = "pill";
  sector.textContent = c.sector.toUpperCase();
  pills.appendChild(country);
  pills.appendChild(sector);
  root.appendChild(pills);

  const val = document.createElement("div");
  val.className = "company-value" + (showValue ? "" : " mystery");
  val.id = panelId + "-value";
  val.textContent = showValue ? formatUSD(c.usd) : "?";
  root.appendChild(val);

  const note = document.createElement("div");
  note.className = "value-note";
  note.textContent = showValue ? `MARKET CAP · AS OF ${state.asOf}` : "MARKET CAP · GUESS";
  root.appendChild(note);

  if (panelId === "panel-mystery") {
    const row = document.createElement("div");
    row.className = "guess-row";
    const bigger = document.createElement("button");
    bigger.className = "guess-btn guess-bigger";
    bigger.id = "btn-bigger";
    bigger.type = "button";
    bigger.textContent = "▲ BIGGER";
    bigger.setAttribute("aria-label", "Bigger: the mystery company is worth more");
    const smaller = document.createElement("button");
    smaller.className = "guess-btn guess-smaller";
    smaller.id = "btn-smaller";
    smaller.type = "button";
    smaller.textContent = "▼ SMALLER";
    smaller.setAttribute("aria-label", "Smaller: the mystery company is worth less");
    const canGuess = state.phase === "guess";
    bigger.disabled = !canGuess;
    smaller.disabled = !canGuess;
    bigger.addEventListener("click", () => guess("bigger"));
    smaller.addEventListener("click", () => guess("smaller"));
    row.appendChild(bigger);
    row.appendChild(smaller);
    root.appendChild(row);
  }
}

function heatClass(streak: number): string {
  if (streak >= 20) return "heat-3";
  if (streak >= 10) return "heat-2";
  if (streak >= 5) return "heat-1";
  return "";
}

function renderAll(): void {
  el("best-value").textContent = String(state.best);
  el("best-chip-num").textContent = String(state.best);

  el("data-stamp").textContent = state.asOf
    ? `Data refreshed daily · as of ${state.asOf}`
    : "Data refreshed daily";

  document.title = `${APP_NAME}: ${APP_TAGLINE.toLowerCase()}`;
  tickClock();

  if (state.mode === "home") return;
  renderGame();
}

function renderGame(): void {
  const isDaily = state.mode === "daily";
  el("mode-label").textContent = isDaily
    ? `DAILY ${Math.min(state.dailyIndex + 1, DAILY_COUNT)}/${DAILY_COUNT}`
    : "ENDLESS";

  const chip = el("streak-pill");
  chip.classList.remove("heat-1", "heat-2", "heat-3");
  const n = isDaily ? state.dailyResults.filter(Boolean).length : state.streak;
  el("streak-num").textContent = String(n);
  if (!isDaily) {
    const heat = heatClass(state.streak);
    if (heat) chip.classList.add(heat);
  }

  const bar = el("daily-bar");
  if (isDaily) {
    bar.hidden = false;
    while (bar.firstChild) bar.removeChild(bar.firstChild);
    for (let i = 0; i < DAILY_COUNT; i++) {
      const seg = document.createElement("i");
      const r = state.dailyResults[i];
      if (r === true) seg.className = "hit";
      else if (r === false) seg.className = "miss";
      bar.appendChild(seg);
    }
  } else {
    bar.hidden = true;
  }

  panelInto("panel-known", state.left, true, "KNOWN");
  panelInto("panel-mystery", state.right, state.phase === "reveal", "MYSTERY");

  const live = el("result-live");
  if (state.phase === "guess") {
    live.textContent =
      state.left && state.right
        ? `${state.left.name} is ${formatUSD(state.left.usd)}. Is ${state.right.name} bigger or smaller?`
        : "Loading pair.";
  }
}

/* ---------- countdown ---------- */

function msToNextDaily(): number {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.max(0, next.getTime() - now.getTime());
}

function fmtCountdown(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

function tickClock(): void {
  const cd = fmtCountdown(msToNextDaily());
  const t = todayISO();
  const done = loadDaily(t);
  const ds = document.getElementById("daily-state");
  if (ds) {
    ds.textContent = done ? `DONE ✓ ${done.score}/${done.total}` : `PLAY · NEXT IN ${cd}`;
  }
  const dc = document.getElementById("daily-countdown");
  if (dc) dc.textContent = `Next daily in ${cd}`;
}

/* ---------- teaser ---------- */

function flipTeaser(): void {
  if (state.items.length < 2 || state.mode !== "home") return;
  const a = state.items[Math.floor(Math.random() * state.items.length)];
  let b = state.items[Math.floor(Math.random() * state.items.length)];
  if (b.id === a.id) b = state.items[(state.items.indexOf(a) + 7) % state.items.length];
  el("teaser-a").textContent = a.name;
  el("teaser-b").textContent = b.name;
  if (!reducedMotion()) {
    const tz = el("teaser");
    tz.classList.remove("swap");
    void tz.offsetWidth;
    tz.classList.add("swap");
  }
}

function startTeaser(): void {
  stopTeaser();
  flipTeaser();
  if (reducedMotion()) return;
  teaserTimer = window.setInterval(flipTeaser, 3000);
}

function stopTeaser(): void {
  if (teaserTimer) {
    window.clearInterval(teaserTimer);
    teaserTimer = 0;
  }
}

/* ---------- game flow ---------- */

function spinVs(): void {
  // Full 360° spin every round so the badge always lands upright reading "VS".
  vsTurns += 1;
  el("vs-badge").style.transform = `rotate(${vsTurns * 360}deg)`;
}

function startEndless(): void {
  if (state.items.length === 0) return;
  track("start_endless");
  buzz();
  state.streak = 0;
  state.recent = [];
  state.phase = "guess";
  state.dailyResults = [];
  state.dailyIndex = 0;
  const r = nextRound(state.items, null, 0, state.recent, Math.random);
  if (!r) return;
  state.left = r.left;
  state.right = r.right;
  state.recent = pushRecent(pushRecent(state.recent, r.left.id), r.right.id);
  hideSheet();
  setScreen("endless");
  spinVs();
  announceCards();
}

function startDaily(): void {
  if (state.items.length === 0) return;
  const t = todayISO();
  const existing = loadDaily(t);
  if (existing) {
    track("daily_view_done");
    state.dailyResults = existing.grid.split("").map((g) => g === "🟩");
    state.dailyDone = true;
    setScreen("daily");
    showDailyDoneSheet(existing.score, existing.total, existing.grid);
    return;
  }
  track("start_daily");
  buzz();
  dailyRounds = dailyPairs(state.items, t);
  if (dailyRounds.length === 0) return;
  state.dailyIndex = 0;
  state.dailyResults = [];
  state.dailyDone = false;
  state.phase = "guess";
  state.left = dailyRounds[0].left;
  state.right = dailyRounds[0].right;
  hideSheet();
  setScreen("daily");
  spinVs();
  announceCards();
}

function announceCards(): void {
  const live = el("result-live");
  if (state.left && state.right) {
    live.textContent =
      `${state.left.name} is ${formatUSD(state.left.usd)}. ` +
      `Is ${state.right.name} bigger or smaller?`;
  }
}

function guess(g: Guess): void {
  if (state.phase !== "guess" || !state.left || !state.right) return;
  buzz();
  const left = state.left;
  const right = state.right;
  const correct = isCorrect(left, right, g);
  state.phase = "reveal";
  renderGame();
  const live = el("result-live");
  live.textContent = `Revealing ${right.name}…`;

  const valNode = document.getElementById("panel-mystery-value");
  const arena = el("arena");
  const mystery = el("panel-mystery");
  arena.classList.remove("shake");
  mystery.classList.remove("flash", "slide-in");
  if (valNode) {
    countUp(valNode, Math.max(1, right.usd / 8), right.usd, () => {
      if (correct) {
        mystery.classList.add("flash");
        const chip = el("streak-pill");
        chip.classList.remove("pop");
        void chip.offsetWidth;
        chip.classList.add("pop");
        live.textContent = `Correct! ${right.name} is ${formatUSD(right.usd)}.`;
        showInlineResult(true, g, right, left);
        window.setTimeout(() => advanceAfterCorrect(), reducedMotion() ? 60 : 700);
      } else {
        void arena.offsetWidth;
        arena.classList.add("shake");
        live.textContent = `Wrong. ${right.name} is ${formatUSD(right.usd)}.`;
        showInlineResult(false, g, right, left);
        window.setTimeout(() => gameOver(left, right), reducedMotion() ? 60 : 850);
      }
    });
  }
}

function showInlineResult(ok: boolean, g: Guess, right: Company, left: Company): void {
  const line = el("result-line");
  while (line.firstChild) line.removeChild(line.firstChild);
  line.className = "result-line " + (ok ? "ok" : "bad");
  const arrow = g === "bigger" ? "▲" : "▼";
  line.textContent = ok
    ? `${arrow} Correct — ${right.name} ${formatUSD(right.usd)}`
    : `${arrow} Wrong — ${right.name} ${formatUSD(right.usd)} vs ${left.name} ${formatUSD(left.usd)}`;
}

function milestone(n: number): void {
  if (reducedMotion()) return;
  const m = el("milestone");
  el("milestone-text").textContent = `${n} IN A ROW`;
  m.hidden = false;
  window.setTimeout(() => {
    m.hidden = true;
  }, 900);
}

function advanceAfterCorrect(): void {
  if (!state.left || !state.right) return;
  if (state.mode === "daily") {
    state.dailyResults.push(true);
    const idx = state.dailyIndex;
    if (idx + 1 >= dailyRounds.length || idx + 1 >= DAILY_COUNT) {
      finishDaily();
      return;
    }
    state.dailyIndex = idx + 1;
    state.left = dailyRounds[state.dailyIndex].left;
    state.right = dailyRounds[state.dailyIndex].right;
    state.phase = "guess";
    el("panel-mystery").classList.add("slide-in");
    hideInlineResult();
    renderGame();
    spinVs();
    announceCards();
    return;
  }
  state.streak += 1;
  const prevBest = state.best;
  state.best = nextBest(state.best, state.streak);
  saveBest(state.best);
  if (state.streak === 10 || state.streak === 25 || state.streak === 50) {
    milestone(state.streak);
  }
  void prevBest;
  const newLeft = state.right;
  const r = nextRound(state.items, newLeft, state.streak, state.recent, Math.random);
  if (!r) {
    gameOver(state.left, state.right);
    return;
  }
  state.left = r.left;
  state.right = r.right;
  state.recent = pushRecent(state.recent, r.right.id);
  state.phase = "guess";
  el("panel-mystery").classList.add("slide-in");
  hideInlineResult();
  renderGame();
  spinVs();
  announceCards();
}

function handleWrongDaily(): void {
  state.dailyResults.push(false);
  const idx = state.dailyIndex;
  if (idx + 1 >= dailyRounds.length || idx + 1 >= DAILY_COUNT) {
    finishDaily();
    return;
  }
  state.dailyIndex = idx + 1;
  state.left = dailyRounds[state.dailyIndex].left;
  state.right = dailyRounds[state.dailyIndex].right;
  state.phase = "guess";
  hideInlineResult();
  renderGame();
  spinVs();
  announceCards();
}

function finishDaily(): void {
  const t = todayISO();
  const score = state.dailyResults.filter(Boolean).length;
  const grid = dailyScoreGrid(state.dailyResults);
  saveDaily({ date: t, score, total: state.dailyResults.length, grid });
  state.dailyDone = true;
  renderAll();
  showDailyDoneSheet(score, state.dailyResults.length, grid);
}

function hideInlineResult(): void {
  const line = el("result-line");
  line.className = "result-line";
  while (line.firstChild) line.removeChild(line.firstChild);
}

function ratioLine(a: Company, b: Company): string {
  const big = a.usd >= b.usd ? a : b;
  const small = a.usd >= b.usd ? b : a;
  const r = big.usd / small.usd;
  const shown = r >= 10 ? String(Math.round(r)) : (Math.round(r * 10) / 10).toString();
  return `${big.name} is ${shown}× bigger than ${small.name}`;
}

function gameOver(left: Company, right: Company): void {
  if (state.mode === "daily") {
    handleWrongDaily();
    return;
  }
  const finalStreak = state.streak;
  const prevBest = state.best;
  state.best = nextBest(state.best, finalStreak);
  saveBest(state.best);
  renderAll();
  showEndSheet(finalStreak, state.best, finalStreak > prevBest && finalStreak > 0, left, right);
}

/* ---------- sheets / modal ---------- */

function confettiInto(box: HTMLElement): void {
  if (reducedMotion()) return;
  const wrap = document.createElement("div");
  wrap.className = "confetti";
  wrap.setAttribute("aria-hidden", "true");
  const colors = ["#FACC15", "#22C55E", "#EF4444", "#F2F4F8"];
  for (let i = 0; i < 40; i++) {
    const p = document.createElement("i");
    p.style.setProperty("--x", `${(i * 97) % 100}%`);
    p.style.setProperty("--c", colors[i % colors.length]);
    p.style.setProperty("--d", `${1.2 + ((i * 37) % 100) / 100}s`);
    wrap.appendChild(p);
  }
  box.appendChild(wrap);
}

function showEndSheet(
  score: number,
  best: number,
  isRecord: boolean,
  left: Company,
  right: Company,
): void {
  const bd = el("sheet-backdrop");
  bd.hidden = false;
  const box = el("sheet");
  while (box.firstChild) box.removeChild(box.firstChild);
  if (isRecord) confettiInto(box);

  const h = document.createElement("h2");
  h.textContent = "GAME OVER";
  const sc = document.createElement("p");
  sc.className = "final-score";
  sc.id = "final-score";
  sc.textContent = String(score);
  const bst = document.createElement("p");
  bst.className = "final-best";
  bst.textContent = `BEST ${best}`;
  box.appendChild(h);
  box.appendChild(sc);
  box.appendChild(bst);
  if (isRecord) {
    const nb = document.createElement("p");
    nb.className = "final-newbest";
    nb.textContent = "▲ NEW BEST ▲";
    box.appendChild(nb);
  }

  const pair = document.createElement("p");
  pair.className = "final-pair";
  pair.id = "final-pair";
  pair.textContent = `${left.name} ${formatUSD(left.usd)} vs ${right.name} ${formatUSD(right.usd)}`;
  const ratio = document.createElement("p");
  ratio.className = "final-ratio";
  ratio.textContent = ratioLine(left, right);
  box.appendChild(pair);
  box.appendChild(ratio);

  if (right.fun) {
    const fun = document.createElement("p");
    fun.className = "fun-fact";
    fun.id = "final-fun";
    fun.textContent = right.fun;
    box.appendChild(fun);
  }

  const actions = document.createElement("div");
  actions.className = "sheet-actions";
  const share = document.createElement("button");
  share.className = "btn-gold";
  share.id = "btn-share";
  share.type = "button";
  share.textContent = "SHARE";
  share.addEventListener("click", () => shareScore(score));
  const again = document.createElement("button");
  again.className = "btn-ghost-dark";
  again.id = "btn-again";
  again.type = "button";
  again.textContent = "PLAY AGAIN";
  again.addEventListener("click", () => startEndless());
  actions.appendChild(share);
  actions.appendChild(again);
  box.appendChild(actions);
  el<HTMLButtonElement>("btn-again").focus();
}

function showDailyDoneSheet(score: number, total: number, grid: string): void {
  const bd = el("sheet-backdrop");
  bd.hidden = false;
  const box = el("sheet");
  while (box.firstChild) box.removeChild(box.firstChild);
  const h = document.createElement("h2");
  h.textContent = "DAILY RESULT";
  const sc = document.createElement("p");
  sc.className = "final-score";
  sc.id = "final-score";
  sc.textContent = `${score}/${total}`;
  const gp = document.createElement("p");
  gp.className = "daily-grid";
  gp.id = "final-grid";
  gp.textContent = grid;
  const note = document.createElement("p");
  note.className = "daily-count";
  note.id = "daily-countdown";
  note.textContent = "";
  box.appendChild(h);
  box.appendChild(sc);
  box.appendChild(gp);
  box.appendChild(note);
  const actions = document.createElement("div");
  actions.className = "sheet-actions";
  const share = document.createElement("button");
  share.className = "btn-gold";
  share.id = "btn-share-daily";
  share.type = "button";
  share.textContent = "SHARE";
  share.addEventListener("click", () => shareDaily(score, total, grid));
  const endless = document.createElement("button");
  endless.className = "btn-ghost-dark";
  endless.type = "button";
  endless.textContent = "PLAY ENDLESS";
  endless.addEventListener("click", () => startEndless());
  actions.appendChild(share);
  actions.appendChild(endless);
  box.appendChild(actions);
  tickClock();
}

function hideSheet(): void {
  el("sheet-backdrop").hidden = true;
}

async function shareScore(score: number): Promise<void> {
  await doShare(shareText(score, siteUrl()));
}

async function shareDaily(score: number, total: number, grid: string): Promise<void> {
  await doShare(dailyShareText(score, total, todayISO(), grid, siteUrl()));
}

async function doShare(text: string): Promise<void> {
  track("share");
  try {
    const nav = navigator as Navigator & {
      share?: (d: { text: string }) => Promise<void>;
      clipboard?: { writeText: (t: string) => Promise<void> };
    };
    if (nav.share && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)) {
      await nav.share({ text });
      return;
    }
    if (nav.clipboard && nav.clipboard.writeText) {
      await nav.clipboard.writeText(text);
      const live = el("result-live");
      live.textContent = "Copied to clipboard. Paste it anywhere to share!";
      return;
    }
  } catch {
    // fall through to prompt
  }
  window.prompt("Copy your score:", text);
}

/* ---------- settings ---------- */

function syncSwitches(): void {
  const s = loadSettings();
  el("toggle-crypto").setAttribute("aria-checked", String(s.crypto));
  const reduce = reducedMotion();
  el("toggle-motion").setAttribute("aria-checked", String(reduce));
  document.body.classList.toggle("reduce-motion", reduce);
}

function flipSwitch(id: "toggle-crypto" | "toggle-motion"): void {
  const s = loadSettings();
  if (id === "toggle-crypto") {
    s.crypto = !s.crypto;
    saveSettings(s);
    void loadValues();
  } else {
    s.reducedMotion = !reducedMotion();
    saveSettings(s);
    stopTeaser();
    if (state.mode === "home") startTeaser();
  }
  syncSwitches();
}

/* ---------- wiring ---------- */

function wire(): void {
  el<HTMLButtonElement>("btn-play").addEventListener("click", startEndless);
  el<HTMLButtonElement>("btn-daily").addEventListener("click", startDaily);
  el<HTMLButtonElement>("teaser").addEventListener("click", startEndless);
  el<HTMLButtonElement>("btn-home").addEventListener("click", () => {
    hideSheet();
    setScreen("home");
  });
  el("wordmark").addEventListener("click", (e) => {
    e.preventDefault();
    hideSheet();
    setScreen("home");
  });
  el<HTMLButtonElement>("nav-how").addEventListener("click", () => {
    el("how-backdrop").hidden = false;
  });
  el<HTMLButtonElement>("how-close").addEventListener("click", () => {
    el("how-backdrop").hidden = true;
  });
  el("how-backdrop").addEventListener("click", (e) => {
    if (e.target === el("how-backdrop")) el("how-backdrop").hidden = true;
  });
  el<HTMLButtonElement>("nav-settings").addEventListener("click", () => {
    syncSwitches();
    el("settings-backdrop").hidden = false;
  });
  el<HTMLButtonElement>("settings-close").addEventListener("click", () => {
    el("settings-backdrop").hidden = true;
  });
  el("settings-backdrop").addEventListener("click", (e) => {
    if (e.target === el("settings-backdrop")) el("settings-backdrop").hidden = true;
  });
  el<HTMLButtonElement>("toggle-crypto").addEventListener("click", () => flipSwitch("toggle-crypto"));
  el<HTMLButtonElement>("toggle-motion").addEventListener("click", () => flipSwitch("toggle-motion"));
  el("sheet-backdrop").addEventListener("click", (e) => {
    if (e.target === el("sheet-backdrop")) hideSheet();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      el("how-backdrop").hidden = true;
      el("settings-backdrop").hidden = true;
      return;
    }
    if (e.key === "Enter" && !el("sheet-backdrop").hidden) {
      const again = document.getElementById("btn-again") as HTMLButtonElement | null;
      if (again && document.activeElement !== again) {
        e.preventDefault();
        again.click();
        return;
      }
    }
    if (state.mode === "home") return;
    if ((e.target as HTMLElement).tagName === "BUTTON" && e.key === "Enter") return;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      guess("bigger");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      guess("smaller");
    }
  });

  clockTimer = window.setInterval(tickClock, 1000);
  void clockTimer;
  syncSwitches();
}

wire();
setScreen("home");
void loadValues();
