import {
  categories,
  metrics,
  metricCategory,
  type GameRecord,
  type StatRow,
  type Numbers,
  type Player,
  type Stats,
  type Filters,
} from "./model";
const zeros = () => Object.fromEntries(metrics.map((k) => [k, 0])) as Numbers;
const ratio = (a: number, b: number, scale = 100) =>
  b ? (a / b) * scale : null;
export function gameRows(game: GameRecord): StatRow[] {
  const map = new Map(
    game.roster
      .filter((p) => !p.outsider)
      .map((p) => [
        p.id,
        {
          player_id: p.player_id!,
          game_id: game.id,
          date: game.date,
          coverage: game.coverage,
          values: zeros(),
        },
      ]),
  );
  for (const e of game.events) {
    const row = map.get(e.actor)?.values;
    if (e.type === "shot") {
      if (row) {
        row.fgAtt++;
        row[e.value === 2 ? "twoAtt" : "threeAtt"]++;
        if (e.made) {
          row.fgMade++;
          row[e.value === 2 ? "twoMade" : "threeMade"]++;
          row.points += e.value!;
        }
      }
      if (e.made && e.assist) {
        const a = map.get(e.assist)?.values;
        if (a) {
          a.assists++;
          a.assistedPoints += e.value!;
        }
      }
      for (const id of e.defenders) {
        const d = map.get(id)?.values;
        if (d) {
          d.oppAtt += 1 / e.defenders.length;
          if (e.made) d.oppMade += 1 / e.defenders.length;
        }
      }
    } else if (row) {
      const key =
        e.type === "turnover"
          ? "turnovers"
          : e.type === "steal"
            ? "steals"
            : e.type === "block"
              ? "blocks"
              : e.type === "deflection"
                ? "deflections"
                : e.type;
      row[key]++;
    }
  }
  return [...map.values()].map((r) => {
    r.values.contribution = r.values.points + r.values.assistedPoints;
    return r;
  });
}
export function aggregate(
  rows: StatRow[],
  players: Player[],
  mode: Filters["mode"] = "totals",
): Stats[] {
  const names = new Map(players.map((p) => [p.id, p.name]));
  const results = new Map<string, Stats>();
  const eligibleSums = new Map<string, Numbers>();
  for (const row of rows) {
    let s = results.get(row.player_id);
    if (!s) {
      s = {
        ...zeros(),
        id: row.player_id,
        name: names.get(row.player_id) || row.player_id,
        games: 0,
        eligible: zeros(),
        fgPct: null,
        twoPct: null,
        threePct: null,
        oppPct: null,
        pps: null,
        incomplete: false,
      };
      results.set(s.id, s);
      eligibleSums.set(s.id, zeros());
    }
    s.games++;
    s.incomplete ||= categories.some((k) => !row.coverage[k]);
    for (const k of metrics) {
      s[k] += row.values[k];
      const complete =
        k === "contribution"
          ? row.coverage.shooting && row.coverage.assists
          : row.coverage[metricCategory[k]];
      if (complete) {
        s.eligible[k]++;
        eligibleSums.get(s.id)![k] += row.values[k];
      }
    }
  }
  return [...results.values()]
    .map((s) => {
      const values = mode === "totals" ? s : eligibleSums.get(s.id)!;
      s.fgPct = ratio(values.fgMade, values.fgAtt);
      s.twoPct = ratio(values.twoMade, values.twoAtt);
      s.threePct = ratio(values.threeMade, values.threeAtt);
      s.oppPct = ratio(values.oppMade, values.oppAtt);
      s.pps = ratio(values.points, values.fgAtt, 1);
      if (mode === "per-game")
        for (const k of metrics)
          s[k] = s.eligible[k] ? values[k] / s.eligible[k] : NaN;
      return s;
    })
    .sort(
      (a, b) =>
        (b.points || 0) - (a.points || 0) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    );
}
export function teammatePairs(
  games: Pick<GameRecord, "id" | "session_id" | "roster">[],
  players: Player[],
) {
  const sessions = new Map<string, Set<string>>();
  for (const g of games) {
    const set = sessions.get(g.session_id) || new Set<string>();
    g.roster.forEach((p) => {
      if (p.player_id) set.add(p.player_id);
    });
    sessions.set(g.session_id, set);
  }
  const names = new Map(players.map((p) => [p.id, p.name]));
  const keys = new Set<string>();
  for (const set of sessions.values()) {
    const ids = [...set].sort();
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) keys.add(`${ids[i]}|${ids[j]}`);
  }
  return [...keys]
    .map((key) => {
      const [a, b] = key.split("|");
      const together = games.filter((g) => {
        const pa = g.roster.find((p) => p.player_id === a),
          pb = g.roster.find((p) => p.player_id === b);
        return pa && pb && pa.team === pb.team;
      });
      return {
        a,
        b,
        nameA: names.get(a) || a,
        nameB: names.get(b) || b,
        games: together.length,
        game_ids: together.map((g) => g.id),
        sharedSessions: [...sessions.values()].filter(
          (s) => s.has(a) && s.has(b),
        ).length,
      };
    })
    .sort((a, b) => b.games - a.games || a.nameA.localeCompare(b.nameA));
}
export function publicGame(game: GameRecord) {
  return { ...game, events: game.events.map(({ source, ...e }) => e) };
}
export function score(
  game: Pick<
    GameRecord,
    "completed" | "scoring_complete" | "events" | "roster"
  >,
) {
  if (!game.completed || !game.scoring_complete) return null;
  const s = { A: 0, B: 0 };
  for (const e of game.events)
    if (e.type === "shot" && e.made) {
      const p = game.roster.find((p) => p.id === e.actor);
      if (p) s[p.team] += e.value!;
    }
  return s;
}
