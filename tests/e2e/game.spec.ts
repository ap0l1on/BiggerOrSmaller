import { test, expect } from "@playwright/test";

/** Deterministic ladder: each company is 4x the previous, so the picker
 *  always has valid easy-band pairs and answers are unambiguous. */
const fixture = {
  asOf: "2026-10-20",
  items: Array.from({ length: 12 }, (_, i) => ({
    id: "T" + String(i).padStart(2, "0"),
    name: "TestCo " + "ABCDEFGHIJKL"[i],
    country: i % 2 ? "US" : "DE",
    sector: i % 2 ? "Technology" : "Energy",
    usd: 100_000_000 * Math.pow(4, i),
    fun: i === 0 ? "The first test company." : undefined,
  })),
};

async function serveFixture(page) {
  await page.route("**/values.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixture) }),
  );
  // Analytics beacon has no test double — stub it so tests stay hermetic.
  // (Aborting would itself log a resource error; fulfil with empty 200.)
  await page.route(/cloudflareinsights\.com/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "/* stubbed for tests */",
    }),
  );
}

function usdOf(name: string): number {
  const found = fixture.items.find((c) => c.name === name);
  if (!found) throw new Error("unknown " + name);
  return found.usd;
}

async function leftName(page) {
  return (await page.locator("#card-left .company-name").textContent())?.trim() ?? "";
}

async function rightName(page) {
  return (await page.locator("#card-right .company-name").textContent())?.trim() ?? "";
}

function isAppError(text: string): boolean {
  // Third-party analytics beacon noise — not app errors.
  if (text.includes("cloudflareinsights.com")) return false;
  if (text.includes("beacon.min.js")) return false;
  if (text.includes("ERR_INTERNET_DISCONNECTED")) return false;
  return true;
}

test("3 right guesses then a wrong one ends the run", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && isAppError(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await serveFixture(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Play endless" }).click();
  await expect(page.locator("#card-left .company-name")).not.toBeEmpty();

  for (let i = 0; i < 3; i++) {
    const l = await leftName(page);
    const r = await rightName(page);
    const correct = usdOf(r) > usdOf(l) ? "Bigger" : "Smaller";
    await page.getByRole("button", { name: new RegExp(correct, "i") }).click();
    // wait for the next round (streak pill updates)
    await expect(page.locator("#streak-pill")).toContainText(`Streak ${i + 1}`, { timeout: 5000 });
  }

  // Now deliberately answer wrong.
  const l = await leftName(page);
  const r = await rightName(page);
  const wrong = usdOf(r) > usdOf(l) ? "Smaller" : "Bigger";
  await page.getByRole("button", { name: new RegExp(wrong, "i") }).click();
  await expect(page.locator("#sheet")).toBeVisible({ timeout: 8000 });
  await expect(page.locator("#final-score")).toContainText("Score 3");
  await expect(page.locator("#final-pair")).toContainText("vs");
  expect(errors).toEqual([]);
});

test("daily challenge locks after finishing", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && isAppError(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await serveFixture(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.getByRole("button", { name: /Daily challenge/ }).click();
  await expect(page.locator("#card-left .company-name")).not.toBeEmpty();

  for (let i = 0; i < 10; i++) {
    const l = await leftName(page);
    const r = await rightName(page);
    const correct = usdOf(r) > usdOf(l) ? "Bigger" : "Smaller";
    await page.getByRole("button", { name: new RegExp(correct, "i") }).click();
    if (i < 9) {
      await expect(page.locator("#mode-label")).toContainText(`Daily · ${i + 2}/10`, { timeout: 5000 });
    }
  }
  await expect(page.locator("#sheet")).toBeVisible({ timeout: 10000 });
  await expect(page.locator("#final-score")).toContainText("10/10");

  await page.goto("/");
  await expect(page.getByRole("button", { name: /Done today/ })).toBeVisible();
  expect(errors).toEqual([]);
});
