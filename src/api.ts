import { demoGames, demoPlayers } from "../shared/demo";
import { aggregate, gameRows, teammatePairs, score } from "../shared/stats";
import { filtersSchema } from "../shared/model";
import { publishedSchema, type PublishedData } from "../shared/published";
import type {
  Filters,
  GameRecord,
  Player,
  StatRow,
  Stats,
} from "../shared/model";
export const API = import.meta.env.VITE_API_URL || "";
export const STATIC_DATA = !API && import.meta.env.VITE_STATIC_DATA === "true";
let published: Promise<PublishedData> | undefined;
async function loadPublished() {
  if (!published) {
    published = fetch(`${import.meta.env.BASE_URL}stats.json`, { cache: "no-cache" })
      .then(async response => {
        if (!response.ok) throw new Error("Published stats could not be loaded. Please refresh to try again.");
        return publishedSchema.parse(await response.json());
      })
      .catch(error => { published = undefined; throw error; });
  }
  return published;
}
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
  if (STATIC_DATA) {
    if (options.method && options.method.toUpperCase() !== "GET") throw new Error("This site shows published stats. Website uploads and AI chat are not enabled.");
    return publishedRequest(await loadPublished(), path) as T;
  }
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

export function publishedRequest(data: PublishedData, path: string): unknown {
  const url = new URL(path, "https://published.invalid");
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const f = filtersSchema.parse({
    from: url.searchParams.get("from") || "1970-01-01",
    to: url.searchParams.get("to") || "2100-12-31",
    players: url.searchParams.get("players")?.split(",").filter(Boolean) || [],
    mode: url.searchParams.get("mode") || "totals",
  });
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const games = data.games.filter(g => g.date >= f.from && g.date <= f.to);
  if (url.pathname === "/meta") {
    const dates = data.games.map(g => g.date).sort();
    return { version:data.version, updated_at:data.updated_at, earliest:dates[0] || null, latest:dates.at(-1) || null, games:data.games.length, players:data.players.length };
  }
  if (url.pathname === "/players") return data.players;
  if (parts[0] === "games" && parts[1]) {
    const game = data.games.find(g => g.id === parts[1]);
    if (!game) throw new Error("Game not found.");
    if (parts.length === 2) return game;
    if (parts[2] === "events" && parts.length === 3) {
      const after = Math.max(-1, Number(url.searchParams.get("after") ?? -1));
      const events = game.events.filter(e => e.sequence > after).sort((a,b) => a.sequence-b.sequence).slice(0,100);
      return {events,next:events.length === 100 ? events.at(-1)!.sequence : null};
    }
  }
  if (parts[0] === "players" && parts.length === 3 && parts[2] === "history") {
    return games.flatMap(gameRows).filter(r => r.player_id === parts[1]).slice(offset,offset+100);
  }
  const rows = games.flatMap(gameRows).filter(r => !f.players.length || f.players.includes(r.player_id));
  const snapshot = makeSnapshot(games, rows, data.players, f);
  if (url.pathname === "/snapshot") return {...snapshot,games:snapshot.games.slice(0,100)};
  if (url.pathname === "/stats") return snapshot.stats;
  if (url.pathname === "/teammates") return snapshot.pairs;
  if (url.pathname === "/games") {
    const limit = Math.max(1,Math.min(100,Number(url.searchParams.get("limit")) || 30));
    const filtered = snapshot.games.filter(g => {
      if (url.searchParams.get("pair") !== "1" || f.players.length !== 2) return true;
      const a = g.roster.find(p => p.player_id === f.players[0]);
      const b = g.roster.find(p => p.player_id === f.players[1]);
      return a && b && a.team === b.team;
    });
    return filtered.slice(offset,offset+limit);
  }
  throw new Error("This site shows published stats. Website uploads and AI chat are not enabled.");
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
