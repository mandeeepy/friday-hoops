# Verification record

## Completed locally
- Strict TypeScript compilation and Vite production build.
- 24 passing automated tests covering scoring, weighted defense, outsider context, completeness denominators, player identities, date boundaries, validation, SQL publication, revisions, rollback, backups, auth roles and concurrent budget reservations.
- Real Cloudflare workerd + local D1 smoke check: owner/friend authentication, denied unauthorized reads/writes, valid upload, atomic publication, duplicate no-op, public snapshot, private backup, paginated events and graceful unconfigured AI response.
- A 100,077-play / 1,037-game aggregation benchmark completed in approximately 52 ms on the development machine. The actual SQLite index query plus aggregation completed in 39 ms; EXPLAIN QUERY PLAN confirmed indexed date and event-sequence lookups. These are local benchmarks, not WAN latency or Cloudflare production CPU quotas.
- In-app Chromium checks of Offense, Defense, Ask AI, date/player filters, player details, model selection, JSON review, sample publication protection and 360px/390px/430px widths. No page-wide horizontal overflow in the checked views.
- Source formatting, ignored-secret checks and production bundle validation.

## Deployment boundaries
GitHub Pages is live at https://mandeeepy.github.io/friday-hoops/ and configured through .github/workflows/pages.yml. Without VITE_API_URL, the production frontend intentionally opens in labelled sample mode. Once a live Worker URL is configured, the frontend loads the real backend and never falls back silently to samples on failure.

Cloudflare remote deployment requires owner sign-in. Remote D1 provisioning and live DeepSeek calls have not been performed. The DeepSeek key, owner passphrase and friend code must be added as Worker secrets. The app's US$5 allowance is calculated at configured token prices; it is not a DeepSeek account-wide cap.

The GitHub workflow passed its 15 browser tests on desktop Chromium, Firefox and WebKit plus mobile Chromium and WebKit in run 34247825987. A subsequent 200% root-text-size check at 390px identified and fixed filter overflow; it is now included in the browser suite. Physical iPhone/Android hardware has not been tested.

## Reproduction
`npm ci && npm test && npm run build && npm run test:performance`

For isolated Worker smoke checks, copy .dev.vars.example to ignored .dev.vars with local-only credentials, run `npx wrangler d1 migrations apply hoops --local --persist-to .wrangler/test-state`, then `npx wrangler dev --port 8788 --persist-to .wrangler/test-state` and `node scripts/smoke.mjs`.

`npx playwright install --with-deps chromium firefox webkit && npm run test:e2e`
