import { demoGames, demoPlayers } from "../shared/demo";
import { aggregate, gameRows, teammatePairs, score } from "../shared/stats";
import type {
  Filters,
  GameRecord,
  Player,
  StatRow,
  Stats,
} from "../shared/model";
export const API = import.meta.env.VITE_API_URL || "";
export type Meta = {
  version: number;
  updated_at: string | null;
  latest: string | null;
  earliest: string | null;
  players: number;
  games: number;
};
export type Snapshot = {
  shooting: { fgMade: number; fgAtt: number };
  stats: Stats[];
  trends: {
    date: string;
    points: number;
    assistedPoints: number;
    steals: number;
    blocks: number;
    dreb: number;
  }[];
  pairs: ReturnType<typeof teammatePairs>;
  games: (Omit<GameRecord, "events"> & { score: ReturnType<typeof score> })[];
  coverage: { shots: number; assigned: number; partial: boolean };
  totalGames: number;
};
export async function request<T>(
  path: string,
  options: RequestInit = {},
  role: "owner" | "friend" = "friend",
): Promise<T> {
  const token = sessionStorage.getItem(`hoops-${role}`);
  const response = await fetch(`${API}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  let body: any;
  try {
    body = await response.json();
  } catch {
    throw new Error(
      "The data service is unavailable. Please try again shortly.",
    );
  }
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
}
export const qs = (f: Filters) =>
  new URLSearchParams({
    from: f.from,
    to: f.to,
    players: f.players.join(","),
    mode: f.mode,
  }).toString();
export function demoSnapshot(f: Filters): Snapshot {
  const games = demoGames.filter((g) => g.date >= f.from && g.date <= f.to);
  const rows = games
    .flatMap(gameRows)
    .filter((r) => !f.players.length || f.players.includes(r.player_id));
  return makeSnapshot(games, rows, demoPlayers, f);
}
export function makeSnapshot(
  games: GameRecord[],
  rows: StatRow[],
  players: Player[],
  f: Filters,
): Snapshot {
  const trends = [...new Set(rows.map((r) => r.date))].sort().map((date) => {
    const stats = aggregate(
      rows.filter((r) => r.date === date),
      players,
      f.mode,
    );
    return {
      date,
      ...Object.fromEntries(
        ["points", "assistedPoints", "steals", "blocks", "dreb"].map((k) => [
          k,
          stats.reduce((a, s) => a + (Number((s as any)[k]) || 0), 0),
        ]),
      ),
    };
  }) as Snapshot["trends"];
  const visibleGames = games.filter(
    (g) =>
      !f.players.length ||
      g.roster.some((p) => p.player_id && f.players.includes(p.player_id)),
  );
  const shots = games.flatMap((g) => g.events).filter((e) => e.type === "shot");
  return {
    shooting: rows
      .filter((r) => f.mode === "totals" || r.coverage.shooting)
      .reduce(
        (a, r) => ({
          fgMade: a.fgMade + r.values.fgMade,
          fgAtt: a.fgAtt + r.values.fgAtt,
        }),
        { fgMade: 0, fgAtt: 0 },
      ),
    stats: aggregate(rows, players, f.mode),
    trends,
    pairs: teammatePairs(games, players).filter(
      (p) =>
        !f.players.length || f.players.includes(p.a) || f.players.includes(p.b),
    ),
    games: visibleGames.map((g) => {
      const { events, ...rest } = g;
      return { ...rest, score: score(g) };
    }),
    coverage: {
      shots: shots.length,
      assigned: shots.filter((e) => e.defenders.length).length,
      partial: games.some((g) => !g.coverage.defense),
    },
    totalGames: visibleGames.length,
  };
}
