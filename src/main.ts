import { APP_NAME, APP_TAGLINE, DAILY_COUNT, siteUrl } from "./constants";
import { formatUSD } from "./format";
import {
  dailyPairs,
  dailyScoreGrid,
  dailyShareText,
  isCorrect,
  nextBest,
  nextRound,
  pushRecent,
  shareText,
  validateValues,
  countryLabel,
  countryToFlag,
  monogram,
  tileColor,
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

function prefersReducedMotion(): boolean {
  try {
    return (
      loadSettings().reducedMotion ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
}

/* ---------- count-up ---------- */

function countUp(
  node: HTMLElement,
  from: number,
  to: number,
  done: () => void,
): void {
  if (prefersReducedMotion()) {
    node.textContent = formatUSD(to);
    done();
    return;
  }
  const dur = 700;
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
    renderAll();
  } catch (err) {
    status.textContent =
      "Could not load market data. Check your connection and reload.";
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

/* ---------- rendering ---------- */

function setScreen(name: Mode): void {
  state.mode = name;
  (document.querySelectorAll(".nav-btn") as unknown as HTMLElement[]).forEach(
    (b) => {
      const m = b.getAttribute("data-mode");
      if (m === "how") return;
      if (m === name || (name === "home" && m === "home")) {
        b.setAttribute("aria-current", "page");
      } else {
        b.removeAttribute("aria-current");
      }
    },
  );
  el("screen-home").hidden = name !== "home";
  el("screen-game").hidden = name === "home";
  renderAll();
}

function cardInto(
  rootId: string,
  c: Company | null,
  showValue: boolean,
  asOf: string,
): void {
  const root = el(rootId);
  // clear
  while (root.firstChild) root.removeChild(root.firstChild);
  if (!c) {
    const p = document.createElement("p");
    p.textContent = "Loading…";
    root.appendChild(p);
    return;
  }
  const top = document.createElement("div");
  top.className = "card-top";
  const tile = document.createElement("div");
  tile.className = "tile";
  tile.textContent = monogram(c.name);
  tile.style.background = tileColor(c.id);
  tile.setAttribute("aria-hidden", "true");
  const nameWrap = document.createElement("div");
  const h = document.createElement("p");
  h.className = "company-name";
  h.textContent = c.name;
  const meta = document.createElement("div");
  meta.className = "company-meta";
  meta.textContent = `${countryToFlag(c.country)} ${countryLabel(c.country)} · ${c.sector}`;
  nameWrap.appendChild(h);
  nameWrap.appendChild(meta);
  top.appendChild(tile);
  top.appendChild(nameWrap);

  const val = document.createElement("div");
  val.className = "company-value" + (showValue ? "" : " mystery");
  val.id = rootId + "-value";
  val.textContent = showValue ? formatUSD(c.usd) : "?";
  const note = document.createElement("div");
  note.className = "value-note";
  note.textContent = showValue ? `Market cap · as of ${asOf}` : "Market cap · make your guess";

  root.appendChild(top);
  root.appendChild(val);
  root.appendChild(note);
}

function renderAll(): void {
  // header best
  const bestLine = el("best-line");
  while (bestLine.firstChild) bestLine.removeChild(bestLine.firstChild);
  const s1 = document.createElement("span");
  s1.textContent = "Best streak: ";
  const strong = document.createElement("strong");
  strong.textContent = String(state.best);
  strong.id = "best-value";
  bestLine.appendChild(s1);
  bestLine.appendChild(strong);

  // footer stamp
  el("data-stamp").textContent = state.asOf
    ? `Market data via public sources, refreshed daily · As of ${state.asOf}`
    : "Market data via public sources, refreshed daily";

  // daily button state
  const t = todayISO();
  const done = loadDaily(t);
  const dailyBtn = el<HTMLButtonElement>("btn-daily");
  dailyBtn.disabled = false;
  if (done) {
    dailyBtn.textContent = `Daily challenge — Done today ✓ (${done.score}/${done.total})`;
  } else {
    dailyBtn.textContent = "Daily challenge — 10 pairs today";
  }

  document.title = `${APP_NAME} — ${APP_TAGLINE}`;

  if (state.mode === "home") return;
  renderGame();
}

function renderGame(): void {
  const isDaily = state.mode === "daily";
  el("mode-label").textContent = isDaily
    ? `Daily · ${Math.min(state.dailyIndex + 1, DAILY_COUNT)}/${DAILY_COUNT}`
    : "Endless";
  el("streak-pill").textContent = isDaily
    ? `Score ${state.dailyResults.filter(Boolean).length}/${DAILY_COUNT}`
    : `Streak ${state.streak} · Best ${state.best}`;
  if (isDaily) {
    el("daily-progress").textContent = dailyScoreGrid(state.dailyResults);
    (el("daily-progress") as HTMLElement).hidden = false;
  } else {
    (el("daily-progress") as HTMLElement).hidden = true;
  }

  cardInto("card-left", state.left, true, state.asOf);
  cardInto(
    "card-right",
    state.right,
    state.phase === "reveal",
    state.asOf,
  );

  const bigger = el<HTMLButtonElement>("btn-bigger");
  const smaller = el<HTMLButtonElement>("btn-smaller");
  const canGuess = state.phase === "guess" && !!state.left && !!state.right;
  bigger.disabled = !canGuess;
  smaller.disabled = !canGuess;

  const live = el("result-live");
  if (state.phase === "guess") {
    live.textContent = state.left && state.right
      ? `${state.left.name} is ${formatUSD(state.left.usd)}. Is ${state.right.name} bigger or smaller?`
      : "Loading pair.";
  }
}

/* ---------- game flow ---------- */

function startEndless(): void {
  if (state.items.length === 0) return;
  track("start_endless");
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
  announceCards();
}

function startDaily(): void {
  if (state.items.length === 0) return;
  const t = todayISO();
  const existing = loadDaily(t);
  if (existing) {
    // show completed state
    track("daily_view_done");
    state.dailyResults = existing.grid.split("").map((g) => g === "🟩");
    state.dailyDone = true;
    showDailyDoneSheet(existing.score, existing.total, existing.grid);
    setScreen("daily");
    return;
  }
  track("start_daily");
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
  const left = state.left;
  const right = state.right;
  const correct = isCorrect(left, right, g);
  state.phase = "reveal";
  renderGame();
  const live = el("result-live");
  live.textContent = `Revealing ${right.name}…`;

  const valNode = document.getElementById("card-right-value");
  const arena = el("arena");
  arena.classList.remove("pulse-ok", "pulse-bad", "slide-in");
  if (valNode) {
    countUp(valNode, Math.max(1, right.usd / 8), right.usd, () => {
      if (correct) {
        arena.classList.add("pulse-ok");
        live.textContent = `Correct! ${right.name} is ${formatUSD(right.usd)}.`;
        el("result-line").textContent = "";
        showInlineResult(true, right, left);
        window.setTimeout(() => advanceAfterCorrect(), prefersReducedMotion() ? 60 : 650);
      } else {
        arena.classList.add("pulse-bad");
        live.textContent = `Wrong. ${right.name} is ${formatUSD(right.usd)}.`;
        showInlineResult(false, right, left);
        window.setTimeout(() => gameOver(left, right), prefersReducedMotion() ? 60 : 900);
      }
    });
  }
}

function showInlineResult(ok: boolean, right: Company, left: Company): void {
  const line = el("result-line");
  while (line.firstChild) line.removeChild(line.firstChild);
  line.className = "result-line " + (ok ? "ok" : "bad");
  const icon = document.createElement("span");
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = ok ? "✓" : "✕";
  const words = document.createElement("span");
  words.textContent = ok
    ? `Correct — ${right.name} ${formatUSD(right.usd)}`
    : `Not quite — ${right.name} ${formatUSD(right.usd)} vs ${left.name} ${formatUSD(left.usd)}`;
  line.appendChild(icon);
  line.appendChild(words);
}

function advanceAfterCorrect(): void {
  if (!state.left || !state.right) return;
  if (state.mode === "daily") {
    state.dailyResults.push(true);
    const idx = state.dailyIndex;
    if (idx + 1 >= dailyRounds.length || idx + 1 >= DAILY_COUNT) {
      finishDaily(true);
      return;
    }
    state.dailyIndex = idx + 1;
    state.left = dailyRounds[state.dailyIndex].left;
    // keep streak continuity visual: slide right to left
    state.right = dailyRounds[state.dailyIndex].right;
    state.phase = "guess";
    el("arena").classList.add("slide-in");
    hideInlineResult();
    renderGame();
    announceCards();
    return;
  }
  state.streak += 1;
  state.best = nextBest(state.best, state.streak);
  saveBest(state.best);
  // right slides left
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
  el("arena").classList.add("slide-in");
  hideInlineResult();
  renderGame();
  announceCards();
}

function handleWrongDaily(): void {
  state.dailyResults.push(false);
  const idx = state.dailyIndex;
  if (idx + 1 >= dailyRounds.length || idx + 1 >= DAILY_COUNT) {
    finishDaily(false);
    return;
  }
  state.dailyIndex = idx + 1;
  state.left = dailyRounds[state.dailyIndex].left;
  state.right = dailyRounds[state.dailyIndex].right;
  state.phase = "guess";
  hideInlineResult();
  renderGame();
  announceCards();
}

function finishDaily(_lastCorrect: boolean): void {
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

function gameOver(left: Company, right: Company): void {
  if (state.mode === "daily") {
    // daily never "ends" on a wrong answer — it moves on
    handleWrongDaily();
    return;
  }
  const finalStreak = state.streak;
  state.best = nextBest(state.best, finalStreak);
  saveBest(state.best);
  renderAll();
  showEndSheet(finalStreak, state.best, left, right);
}

/* ---------- sheets / modal ---------- */

function showEndSheet(
  score: number,
  best: number,
  left: Company,
  right: Company,
): void {
  const bd = el("sheet-backdrop");
  bd.hidden = false;
  const box = el("sheet");
  while (box.firstChild) box.removeChild(box.firstChild);

  const h = document.createElement("h2");
  h.textContent = "Run over";
  const sc = document.createElement("p");
  sc.className = "score-big";
  sc.id = "final-score";
  sc.textContent = `Score ${score} · Best ${best}`;
  const pair = document.createElement("p");
  pair.id = "final-pair";
  pair.textContent = `${left.name} ${formatUSD(left.usd)} vs ${right.name} ${formatUSD(right.usd)}`;
  box.appendChild(h);
  box.appendChild(sc);
  box.appendChild(pair);

  const loser = score === 0 ? right : right;
  if (loser.fun) {
    const fun = document.createElement("p");
    fun.className = "fun-fact";
    fun.id = "final-fun";
    fun.textContent = loser.fun;
    box.appendChild(fun);
  }

  const actions = document.createElement("div");
  actions.className = "sheet-actions";
  const share = document.createElement("button");
  share.className = "btn btn-primary";
  share.id = "btn-share";
  share.type = "button";
  share.textContent = "Share";
  share.addEventListener("click", () => shareScore(score));
  const again = document.createElement("button");
  again.className = "btn btn-ghost";
  again.id = "btn-again";
  again.type = "button";
  again.textContent = "Play again";
  again.addEventListener("click", () => startEndless());
  const home = document.createElement("button");
  home.className = "btn btn-ghost";
  home.type = "button";
  home.textContent = "Home";
  home.addEventListener("click", () => {
    hideSheet();
    setScreen("home");
  });
  actions.appendChild(share);
  actions.appendChild(again);
  actions.appendChild(home);
  box.appendChild(actions);
  el<HTMLButtonElement>("btn-again").focus();
}

function showDailyDoneSheet(score: number, total: number, grid: string): void {
  const bd = el("sheet-backdrop");
  bd.hidden = false;
  const box = el("sheet");
  while (box.firstChild) box.removeChild(box.firstChild);
  const h = document.createElement("h2");
  h.textContent = "Daily complete";
  const sc = document.createElement("p");
  sc.className = "score-big";
  sc.id = "final-score";
  sc.textContent = `Score ${score}/${total}`;
  const gp = document.createElement("p");
  gp.className = "daily-progress";
  gp.id = "final-grid";
  gp.textContent = grid;
  const note = document.createElement("p");
  note.textContent = "One attempt per day. Come back tomorrow for new pairs.";
  box.appendChild(h);
  box.appendChild(sc);
  box.appendChild(gp);
  box.appendChild(note);
  const actions = document.createElement("div");
  actions.className = "sheet-actions";
  const share = document.createElement("button");
  share.className = "btn btn-primary";
  share.id = "btn-share-daily";
  share.type = "button";
  share.textContent = "Share";
  share.addEventListener("click", () => shareDaily(score, total, grid));
  const endless = document.createElement("button");
  endless.className = "btn btn-ghost";
  endless.type = "button";
  endless.textContent = "Play endless";
  endless.addEventListener("click", () => startEndless());
  actions.appendChild(share);
  actions.appendChild(endless);
  box.appendChild(actions);
}

function hideSheet(): void {
  el("sheet-backdrop").hidden = true;
}

async function shareScore(score: number): Promise<void> {
  const text = shareText(score, siteUrl());
  await doShare(text);
}

async function shareDaily(score: number, total: number, grid: string): Promise<void> {
  const text = dailyShareText(score, total, todayISO(), grid, siteUrl());
  await doShare(text);
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

/* ---------- wiring ---------- */

function wire(): void {
  el<HTMLButtonElement>("btn-play").addEventListener("click", startEndless);
  el<HTMLButtonElement>("btn-daily").addEventListener("click", startDaily);
  el<HTMLButtonElement>("btn-bigger").addEventListener("click", () => guess("bigger"));
  el<HTMLButtonElement>("btn-smaller").addEventListener("click", () => guess("smaller"));
  el<HTMLButtonElement>("nav-endless").addEventListener("click", () => {
    hideSheet();
    if (state.items.length > 0 && state.mode !== "endless") startEndless();
    else setScreen("endless");
  });
  el<HTMLButtonElement>("nav-daily").addEventListener("click", () => {
    hideSheet();
    setScreen("home");
    startDaily();
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
  el("sheet-backdrop").addEventListener("click", (e) => {
    if (e.target === el("sheet-backdrop")) hideSheet();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      el("how-backdrop").hidden = true;
      return;
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

  const crypto = el<HTMLInputElement>("opt-crypto");
  crypto.checked = loadSettings().crypto;
  crypto.addEventListener("change", () => {
    const s = loadSettings();
    s.crypto = crypto.checked;
    saveSettings(s);
    void loadValues();
  });
  const motion = el<HTMLInputElement>("opt-motion");
  try {
    motion.checked =
      loadSettings().reducedMotion ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    motion.checked = false;
  }
  motion.addEventListener("change", () => {
    const s = loadSettings();
    s.reducedMotion = motion.checked;
    saveSettings(s);
  });

  el("wordmark").textContent = "";
  const mark = document.createElement("span");
  mark.className = "wordmark-mark";
  mark.textContent = "O";
  mark.setAttribute("aria-hidden", "true");
  el("wordmark").appendChild(mark);
  el("wordmark").appendChild(document.createTextNode(APP_NAME));
}

wire();
setScreen("home");
void loadValues();
