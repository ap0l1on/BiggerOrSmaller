// Captures README screenshots: 360 / 768 / 1280 px across
// home, mid-game, reveal (correct), game over, daily result.
// Run: npm run build && (preview on :4173) && node scripts/screenshots.mjs
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const BASE = "http://localhost:4173/BiggerOrSmaller/";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "screenshots");
mkdirSync(OUT, { recursive: true });
const shot = (name) => join(OUT, name);

const fixture = {
  asOf: "2026-10-20",
  items: Array.from({ length: 12 }, (_, i) => ({
    id: "T" + String(i).padStart(2, "0"),
    name: "TestCo " + "ABCDEFGHIJKL"[i],
    country: i % 2 ? "US" : "DE",
    sector: i % 2 ? "Technology" : "Energy",
    usd: 100_000_000 * Math.pow(4, i),
  })),
};

async function newPage(browser, width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.route("**/values.json", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(fixture),
    }),
  );
  await page.route(/cloudflareinsights\.com/, (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: "" }),
  );
  return page;
}

const usdOf = (name) => fixture.items.find((c) => c.name === name).usd;
const leftName = (page) =>
  page.locator("#panel-known .company-name").textContent().then((t) => (t ?? "").trim());
const rightName = (page) =>
  page.locator("#panel-mystery .company-name").textContent().then((t) => (t ?? "").trim());

async function guessCorrect(page) {
  const l = await leftName(page);
  const r = await rightName(page);
  await page.getByRole("button", { name: new RegExp(usdOf(r) > usdOf(l) ? "Bigger" : "Smaller", "i") }).click();
}

async function guessWrong(page) {
  const l = await leftName(page);
  const r = await rightName(page);
  await page.getByRole("button", { name: new RegExp(usdOf(r) > usdOf(l) ? "Smaller" : "Bigger", "i") }).click();
}

const browser = await chromium.launch();

for (const [w, h] of [[360, 740], [768, 900], [1280, 800]]) {
  // home
  {
    const page = await newPage(browser, w, h);
    await page.goto(BASE);
    await page.locator("#teaser-a").waitFor();
    await page.screenshot({ path: shot(`home-${w}.png`) });
    await page.close();
  }
  // mid-game
  {
    const page = await newPage(browser, w, h);
    await page.goto(BASE);
    await page.locator("#btn-play").click();
    await page.locator("#panel-known .company-name").waitFor();
    await page.screenshot({ path: shot(`game-${w}.png`) });
    await page.close();
  }
}

// reveal (correct) + game over on 360 and 1280
for (const w of [360, 1280]) {
  const h = w === 360 ? 740 : 800;
  const page = await newPage(browser, w, h);
  await page.goto(BASE);
  await page.locator("#btn-play").click();
  await page.locator("#panel-known .company-name").waitFor();
  await guessCorrect(page);
  await page.waitForTimeout(450);
  await page.screenshot({ path: shot(`reveal-${w}.png`) });
  await page.locator("#streak-num").getByText("1").waitFor({ timeout: 8000 });
  await guessWrong(page);
  await page.locator("#sheet").waitFor({ timeout: 8000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot(`gameover-${w}.png`) });
  await page.close();
}

// daily result on 1280
{
  const page = await newPage(browser, 1280, 800);
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.locator("#btn-daily").click();
  await page.locator("#panel-known .company-name").waitFor();
  for (let i = 0; i < 10; i++) {
    await guessCorrect(page);
    if (i < 9) {
      await page.locator("#mode-label").getByText(`DAILY ${i + 2}/10`).waitFor({ timeout: 8000 });
    }
  }
  await page.locator("#sheet").waitFor({ timeout: 10000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot("daily-1280.png") });
  await page.close();
}

await browser.close();
console.log("screenshots done");
