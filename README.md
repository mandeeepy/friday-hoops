# Friday Hoops

[Open the dashboard](https://mandeeepy.github.io/friday-hoops/) · Starts in labelled sample mode until the live backend is connected.

A mobile-first basketball dashboard for a rotating Friday group. Three public tabs: Offense, Defense, Ask AI. Includes a separate owner workspace for reusable players, game rosters, AI preparation packs, validated imports, and revision restoration.

```sh
npm ci
npm run dev
```

Open the printed local URL with `?demo=1` for fictional sample games. For real data, follow [deployment and operations](docs/OPERATIONS.md). The API and all data stay on Cloudflare Worker + D1; the static app deploys to GitHub Pages. No DeepSeek key is needed to explore the sample dashboard.

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
