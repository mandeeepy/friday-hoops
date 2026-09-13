# Friday Hoops operating guide

## Architecture
The current public site uses GitHub Pages only. It loads `public/stats.json` and uses the same shared statistics functions in the browser. No Cloudflare account is needed. `VITE_STATIC_DATA=true` enables this mode; `VITE_API_URL`, if set, selects the optional API instead. Explicit `?demo=1` still opens fictional sample data.

### Publish on GitHub Pages
1. Produce and review the complete import JSON using the commentary guide. Keep private imports and transcripts under ignored `data/`.
2. Run `npm run stats:publish -- data/YYYY-MM-DD/game.import.json`. The exporter validates relationships, rejects stale revisions, removes private source commentary, merges games by ID, and keeps games omitted from the import.
3. Review the generated `public/stats.json`. Run `npm test` and `VITE_STATIC_DATA=true npm run build`.
4. Commit the public data and intended code changes, then push to `main`. The GitHub workflow builds and checks the site before deployment. Private transcripts, backups, and production access codes must never be committed.
5. Open the published site and verify the latest date, players, and game score. For corrections use the game's current revision as `base_revision` and preserve event IDs.

The published website supports public statistics, filters, teammate combinations, player history, and game logs. Website uploads and AI chat require the optional backend described below. Updating the published data is an owner operation in the local project.

### Optional backend
React/TypeScript/Vite on GitHub Pages; a Cloudflare Worker exposes `/api`; D1 stores players, sessions, games, participants, plays, shot defenders, derived player-game rows, import history, and revisions. All statistics and AI tools use `shared/stats.ts`. Browsers never receive database credentials or the DeepSeek key. Outsider identities are anonymous within each roster. Public visitors may read all published statistics and game logs; source commentary and old imports are owner-only.

## Weekly recording
1. Open Manage data and unlock with the owner passphrase.
2. Create or edit canonical names. Aliases must be unique across people. Reuse IDs; changing the display name does not create a new player.
3. Choose the session date. Add each game, assign tracked players to A or B, and add anonymous outsiders to the appropriate team. A reshuffle starts a new game. Sitting-out players are omitted.
4. Export the preparation pack and player directory. Download the commentary/AI instructions. Read `COMMENTARY-AND-AI.md` for the counting rules.
5. Watch your video and transcribe plays. Optional timestamps refer to the video. Every tracked player's makes AND misses matter. Explicitly name assistants and defenders when known. Silence is unknown, not proof of zero.
6. Feed the pack plus commentary to an external AI. It must output the supplied JSON structure and list any unresolved identities or plays. The AI cannot publish through the public chat.
7. Upload the JSON, then Validate & preview. Correct errors directly in the editor. Check roster IDs, makes/misses, assisted points, equal defensive shares, completeness, and changed event counts. Review the expandable play list.
8. Publish reviewed games. Publication is atomic. Keep your original JSON. Download a backup after each session.

## Completeness and statistics
Coverage has a separate boolean for shooting, assists, oreb, turnovers, defense, deflections, steals, blocks, dreb. True means complete observation for all tracked players in that game. Per-game averages use only complete games for that metric; a player who participated but had no events still contributes a zero and a game. Totals include known recorded actions, with partial tracking marked. Shooting percentages use combined numerators and denominators. No attempts shows a dash.

For a shot with N recorded defenders, each gets 1/N of the opponent attempt and, on a make, 1/N of the opponent make. Named outsider defenders take a share but have no personal stat sheet. Unassigned shots remain unassigned; matchup coverage refers to recorded shots, not unrecorded attempts. Do not treat low opponent FG% as a complete defensive rating.

Scored points plus assisted points measures individual contribution. An assisted basket appears for its scorer and passer, so player contributions cannot be added into team scores. Blocks and steals are distinct explicit events. A steal does not automatically imply a deflection. Rebounds can reference a preceding miss. Free throws, minutes, possessions, shot coordinates and automatic video analysis are not collected.

Only a completed game with scoring_complete=true has a final score. If outsider scoring was only partly counted, leave scoring_complete false. No winner is inferred from partial stats.

## Corrections and restoration
Load revision history. Edit current exports the latest game with its current base_revision. Edit the FULL game, preserving event IDs, then validate and publish. Games absent from an upload are unchanged. Never increment base_revision yourself: use the exported current revision. A stale revision produces a conflict and no partial writes. Re-uploading the exact same file is a no-op.

Restore previews the chosen historical revision and requires an explicit Restore click. It creates a fresh revision containing the earlier game data; existing history is retained. Current player names remain current. Restore affects only that game. Backups contain private transcripts and should be kept privately.

## Hosting setup
1. Run `npm ci`, `npm test`, `npm run schema`, and `npm run build`.
2. Sign in to Cloudflare with `npx wrangler login` and create the database with `npx wrangler d1 create hoops`.
3. Replace database_id in wrangler.toml with the returned real ID. Keep the database binding DB and name hoops. Run `npm run db:remote`.
4. Set ALLOWED_ORIGIN in wrangler.toml to the exact GitHub Pages origin, for example `https://YOURNAME.github.io`. The origin has no repository path. Separate explicitly allowed origins by commas for local development. Do not use `*`.
5. Create a long unique OWNER_PASSPHRASE and a separate FRIEND_ACCESS_CODE as Worker secrets. In the Cloudflare dashboard: Workers & Pages → friday-hoops-api → Settings → Variables and Secrets → Add → Secret. Add DEEPSEEK_API_KEY in the same place. Never put any of these in a VITE_ variable, source file, GitHub commit, or public chat. Rotating a code invalidates existing sessions for that role.
6. Verify current DeepSeek model availability and pricing against the official API documentation. The configured model IDs are deepseek-v4-flash and deepseek-v4-pro. Input/output prices are conservative peak uncached USD per million tokens. Do not lower them without checking the provider. AI_MONTHLY_USD=5 is this app's tracked allowance, not an account-wide provider spending cap.
7. `npm run worker:deploy`. Set the GitHub repository Actions variable VITE_API_URL to the resulting Worker origin, for example `https://friday-hoops-api.ACCOUNT.workers.dev`.
8. Enable GitHub Pages with source GitHub Actions. Push to main to deploy. The workflow sets BASE_PATH to the repository path; hash navigation survives reloads on Pages.
9. Visit `/api/health`, then the website. Verify the live empty state. Unlock Manage data, upload your reviewed first session, then test both AI models with the friend code. Keep fictional samples separate from real games.

## Local development
`npm ci`. Create ignored `.dev.vars` with OWNER_PASSPHRASE and FRIEND_ACCESS_CODE; optionally add DEEPSEEK_API_KEY only for deliberate live model testing. Run `npm run db:local`, `npm run worker:dev`, and `npm run dev` in separate terminals. Vite proxies /api to port 8787. Use `?demo=1` to explore fictional data without a backend or paid calls. Demo manager edits are temporary. With no backend the app shows an error and an explicit sample-data option; it never silently substitutes samples for real stats.

## AI controls
The friend code grants only AI access, never editing. The owner credential grants only owner operations. Sessions expire after eight hours and are held only in browser session storage. Login is limited to five attempts per IP/role/minute. AI is limited to six queries/IP/minute and 200/day globally, plus the US$5 monthly allowance. The backend reserves a conservative maximum cost atomically before each request, limits output to 2,048 tokens and tool rounds to three. Unknown provider outcomes are conservatively charged against the local allowance. Failed or abandoned reservations must never be automatically refunded without checking whether the provider billed them. The app never runs model-generated SQL: only allowlisted parameterized read queries.

## Backups and disaster recovery
Use Manage data → Download backup after publication. This includes current exports and historical import payloads. Keep at least two private copies. For a full relational backup including revisions and bookkeeping:

```
npx wrangler d1 export hoops --remote --output=hoops-backup.sql
```

Restore into a NEW empty database to verify before switching the live binding:

```
npx wrangler d1 create hoops-restored
npx wrangler d1 execute hoops-restored --remote --file=hoops-backup.sql
```

Inspect row counts, game scores, player statistics, and revision history. Update the Worker binding to the restored ID only after verification, then redeploy. For current-game-only recovery from JSON into an empty database, set each exported game's base_revision to 0 and publish each current pack. This reconstructs current games but does not preserve historical revision numbering. For complete history use SQL backup restoration. Never restore auth or budget bookkeeping into a public demo database.

## Future charts and maintenance
Add explicit metrics in shared/model.ts and shared/stats.ts; update per-category denominators and tests. Rebuild player_game_stats from original game revisions when formulas change. Use normalized events and shot_defenders for new relationships. Never infer unavailable measures such as minutes or shot positions. New import formats need a new schema_version and an explicit migration. Do not rewrite old imports silently.

Keep backend dependencies pinned through package-lock.json. Check Workers/D1 quota dashboards, Worker error logs and ai_budget. Public aggregate cache keys include the data version; publication and player edits invalidate them. Remove expired auth_sessions and limits periodically with a maintenance query. Monitor errors without logging credentials or raw commentary. Free-plan quota exhaustion shows a recoverable error; the app does not automatically upgrade paid hosting.
