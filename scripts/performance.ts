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
