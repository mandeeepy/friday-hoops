# Friday Hoops

[Open the dashboard](https://mandeeepy.github.io/friday-hoops/) · Real game stats hosted on GitHub Pages.

A mobile-first basketball dashboard for a rotating Friday group. Three public tabs: Offense, Defense, Ask AI. Includes a separate owner workspace for reusable players, game rosters, AI preparation packs, validated imports, and revision restoration.

```sh
npm ci
npm run dev
```

The published site reads sanitized game data from `public/stats.json`, with filters, player history, comparisons, and game logs calculated in the browser. GitHub Pages needs no separate backend or Cloudflare account. Website uploads and AI chat are disabled in this mode. Private transcripts and access codes stay out of the public repository.

To publish a reviewed session, run `npm run stats:publish -- path/to/session.import.json`, review `public/stats.json`, then commit and push it. The export preserves existing games and rejects stale revisions. The Pages workflow builds with `VITE_STATIC_DATA=true`. To preview real data locally, run `VITE_STATIC_DATA=true npm run dev`.

Open the local URL with `?demo=1` for fictional sample games. The optional Cloudflare API remains available for a future setup with browser uploads and AI; see [deployment and operations](docs/OPERATIONS.md). An explicitly configured `VITE_API_URL` takes precedence over the published file.

- [Commentary and AI extraction SOP](docs/COMMENTARY-AND-AI.md)
- [Operations, upload, correction, hosting and backup SOP](docs/OPERATIONS.md)
- [Import JSON Schema](public/import.schema.json)
- [Sample session](public/examples/friday-session.json)

## Checks

`npm test` — stat and contract tests.

`npm run build` — strict TypeScript and production frontend build.

`npm run schema` — regenerate schema, example, and commentary guide.

`npm run test:performance` — 100,000+ play aggregation benchmark.

`npm run test:e2e` — Chromium, Firefox and WebKit desktop/mobile tests (requires installed Playwright browser binaries).

See docs/VERIFICATION.md for actual checks completed and deployment status. Live owner/friend credentials and the DeepSeek key are configured only as Worker secrets.
