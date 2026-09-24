# Outweigh

Which company is worth more? Guess **Bigger** or **Smaller** and see how long
your streak lasts. Endless mode plus a 10-pair Daily Challenge.

Live site: enable GitHub Pages (Source: GitHub Actions) and run the
**Build values** workflow once — the URL will be
`https://<owner>.github.io/<repo>/`.

## How to play

1. The left company shows its market value. The right one is a mystery (`?`).
2. Guess whether the right company is **Bigger** (↑) or **Smaller** (↓).
3. Right answers build your streak and slide the card left. Pairs get closer
   the further you go. One wrong guess ends the run.
4. Daily Challenge: the same 10 pairs for everyone, one attempt per day.
   Share your grid (`🟩🟩🟥…`) and challenge friends.

Best scores and settings live in your browser (`localStorage`) — no accounts,
no cookies.

## How the data is built

- `data/companies.json` is the hand-curated ticker list (~320 companies:
  global top caps, household names, Turkish companies, optional Big 5 crypto).
- `.github/workflows/build-values.yml` runs daily at 02:00 UTC (and on ticker
  changes, plus a manual Run button). It fetches `marketCap` + `currency` per
  ticker with the open-source `yahoo-finance2` library (no API key), converts
  to USD with same-day Yahoo FX rates, rounds to 3 significant figures, and
  writes `public/values.json` with an `As of {date}` stamp.
- Entries with missing/zero values or moves over 60% since the last run are
  dropped and logged in `data/build-report.md`. The job fails (keeping
  yesterday's file) when fewer than 200 valid entries remain.
- Never invent or hand-type market values: every production number comes from
  this pipeline. The file committed alongside the code is a clearly-marked
  synthetic bootstrap, replaced on the first workflow run.

## Project layout

- `index.html` — shell, CSP, Cloudflare snippet, footer
- `src/` — vanilla TypeScript: `main.ts` (UI), `game.ts` (picker, daily,
  share, validation), `format.ts` (formatting, FX math), `store.ts`
  (safe localStorage), `constants.ts` (rename the app in one place)
- `scripts/build-values.ts` — the data pipeline
- `tests/unit` (Vitest) and `tests/e2e` (Playwright)
- `public/values.json` — generated market data (do not edit by hand)

## Develop

```sh
npm ci
npm run dev      # local dev server
npm test         # unit tests
npm run build    # typecheck + production build to dist/
npm run test:e2e # end-to-end (needs a build first)
```

Rename the project by editing `APP_NAME` in `src/constants.ts`.

## Not investment advice

A game about company size. Values are approximate and delayed.
Not investment advice.

## License

MIT — see `LICENSE`.
