import { sampleImport } from "../shared/demo";
import { gameRows, aggregate, teammatePairs } from "../shared/stats";
import { shiftDate } from "../shared/dates";
import type { GameRecord } from "../shared/model";
const sample = sampleImport();
const games: GameRecord[] = [];
let plays = 0;
for (let i = 0; plays < 100000; i++) {
  const date = shiftDate("2020-01-03", Math.floor(i / 4) * 7);
  const g = {
    ...sample.games[i % 4],
    id: `perf-${i}`,
    session_id: `session-${Math.floor(i / 4)}`,
    date,
    revision: 1,
  };
  games.push(g);
  plays += g.events.length;
}
const t = performance.now();
const rows = games.flatMap(gameRows);
const stats = aggregate(rows, sample.players);
const pairs = teammatePairs(games, sample.players);
const elapsed = performance.now() - t;
console.log(
  JSON.stringify(
    {
      plays,
      games: games.length,
      rows: rows.length,
      players: stats.length,
      pairs: pairs.length,
      elapsed_ms: Math.round(elapsed),
    },
    null,
    2,
  ),
);
if (!stats.length || elapsed > 5000)
  throw new Error("Aggregation performance threshold exceeded");

// Exercise the actual SQLite schema and indexes at the same event volume.
const { DatabaseSync } = await import("node:sqlite");
const { readFileSync } = await import("node:fs");
const db = new DatabaseSync(":memory:");
db.exec(readFileSync("migrations/0001_initial.sql", "utf8"));
db.exec("BEGIN");
const insertPlayer = db.prepare(
  "INSERT INTO players(id,name,aliases) VALUES(?,?,?)",
);
for (const p of sample.players)
  insertPlayer.run(p.id, p.name, JSON.stringify(p.aliases));
const insertSession = db.prepare(
  "INSERT OR IGNORE INTO sessions(id,date,label) VALUES(?,?,?)",
);
const insertGame = db.prepare(
  "INSERT INTO games(id,session_id,date,label,revision,payload,summary) VALUES(?,?,?,?,1,?,?)",
);
const insertEvent = db.prepare(
  "INSERT INTO events(game_id,id,sequence,type,actor,payload) VALUES(?,?,?,?,?,?)",
);
const insertRow = db.prepare(
  "INSERT INTO player_game_stats(game_id,player_id,date,coverage,stats) VALUES(?,?,?,?,?)",
);
for (const g of games) {
  insertSession.run(g.session_id, g.date, "Benchmark");
  insertGame.run(g.id, g.session_id, g.date, g.label, JSON.stringify(g), "{}");
  for (const e of g.events)
    insertEvent.run(g.id, e.id, e.sequence, e.type, e.actor, JSON.stringify(e));
  for (const r of gameRows(g))
    insertRow.run(
      g.id,
      r.player_id,
      g.date,
      JSON.stringify(r.coverage),
      JSON.stringify(r.values),
    );
}
db.exec("COMMIT");
const qt = performance.now();
const queryRows = db
  .prepare("SELECT * FROM player_game_stats WHERE date BETWEEN ? AND ?")
  .all("2020-01-01", "2030-12-31");
const queried = aggregate(
  queryRows.map((r: any) => ({
    game_id: r.game_id,
    player_id: r.player_id,
    date: r.date,
    coverage: JSON.parse(r.coverage),
    values: JSON.parse(r.stats),
  })),
  sample.players,
);
const page = db
  .prepare(
    "SELECT payload FROM events WHERE game_id=? AND sequence>? ORDER BY sequence LIMIT 100",
  )
  .all(games[0].id, -1);
const queryElapsed = performance.now() - qt;
const plans = [
  db
    .prepare(
      "EXPLAIN QUERY PLAN SELECT * FROM player_game_stats WHERE date BETWEEN ? AND ?",
    )
    .all("2020-01-01", "2030-12-31"),
  db
    .prepare(
      "EXPLAIN QUERY PLAN SELECT payload FROM events WHERE game_id=? AND sequence>? ORDER BY sequence LIMIT 100",
    )
    .all(games[0].id, -1),
];
console.log(
  JSON.stringify(
    {
      indexed_query_and_aggregation_ms: Math.round(queryElapsed),
      queriedPlayers: queried.length,
      eventPageSize: page.length,
      plans,
    },
    null,
    2,
  ),
);
if (queryElapsed > 5000 || queried.length !== 8 || page.length > 100)
  throw new Error("Indexed query benchmark failed");
