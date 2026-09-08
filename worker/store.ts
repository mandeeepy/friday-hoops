import {
  validateImport,
  type Import,
  type GameRecord,
  type Player,
  type Filters,
  type StatRow,
} from "../shared/model";
import {
  aggregate,
  gameRows,
  publicGame,
  score,
  teammatePairs,
} from "../shared/stats";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const hash = async (s: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  )
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
export async function players(db: D1Database): Promise<Player[]> {
  const r = await db.prepare("SELECT * FROM players ORDER BY name").all<any>();
  return r.results.map((p) => ({ ...p, aliases: JSON.parse(p.aliases) }));
}
export async function meta(db: D1Database) {
  return db
    .prepare(
      "SELECT version,updated_at,(SELECT MIN(date) FROM games) earliest,(SELECT MAX(date) FROM games) latest,(SELECT COUNT(*) FROM games) games,(SELECT COUNT(*) FROM players) players FROM metadata WHERE id=1",
    )
    .first();
}
export async function listGames(
  db: D1Database,
  f: Filters,
  limit = 100,
  offset = 0,
  pair = false,
) {
  const condition = pair && f.players.length===2 ? " AND EXISTS (SELECT 1 FROM participants a JOIN participants b ON a.game_id=b.game_id AND a.team=b.team WHERE a.game_id=games.id AND a.player_id=? AND b.player_id=?)" : f.players.length
    ? ` AND EXISTS (SELECT 1 FROM participants p WHERE p.game_id=games.id AND p.player_id IN (${f.players.map(() => "?").join(",")}))`
    : "";
  const r = await db
    .prepare(
      `SELECT summary FROM games WHERE date BETWEEN ? AND ?${condition} ORDER BY date DESC,id LIMIT ? OFFSET ?`,
    )
    .bind(f.from, f.to, ...f.players, limit, offset)
    .all<any>();
  return r.results.map((r) => JSON.parse(r.summary));
}
export async function snapshot(db: D1Database, f: Filters) {
  const ps = await players(db);
  const condition = f.players.length
    ? ` AND player_id IN (${f.players.map(() => "?").join(",")})`
    : "";
  const raw = await db
    .prepare(
      `SELECT * FROM player_game_stats WHERE date BETWEEN ? AND ?${condition} ORDER BY date,game_id`,
    )
    .bind(f.from, f.to, ...f.players)
    .all<any>();
  const rows: StatRow[] = raw.results.map((r) => ({
    player_id: r.player_id,
    game_id: r.game_id,
    date: r.date,
    coverage: JSON.parse(r.coverage),
    values: JSON.parse(r.stats),
  }));
  const records = await db
    .prepare(
      "SELECT summary FROM games WHERE date BETWEEN ? AND ? ORDER BY date DESC,id",
    )
    .bind(f.from, f.to)
    .all<any>();
  const games = records.results.map((r) => JSON.parse(r.summary));
  const trends = [...new Set(rows.map((r) => r.date))].sort().map((date) => {
    const s = aggregate(
      rows.filter((r) => r.date === date),
      ps,
      f.mode,
    );
    return {
      date,
      ...Object.fromEntries(
        ["points", "assistedPoints", "steals", "blocks", "dreb"].map((k) => [
          k,
          s.reduce((a, r) => a + (Number((r as any)[k]) || 0), 0),
        ]),
      ),
    };
  });
  const visible = games.filter(
    (g) =>
      !f.players.length ||
      g.roster.some((p: any) => f.players.includes(p.player_id)),
  );
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
    stats: aggregate(rows, ps, f.mode),
    trends,
    pairs: teammatePairs(games, ps).filter(
      (p) =>
        !f.players.length || f.players.includes(p.a) || f.players.includes(p.b),
    ),
    games: visible.slice(0, 100),
    totalGames: visible.length,
    coverage: {
      shots: games.reduce((n, g) => n + g.shots, 0),
      assigned: games.reduce((n, g) => n + g.assigned, 0),
      partial: games.some((g) => !g.coverage.defense),
    },
  };
}
export async function validate(db: D1Database, input: unknown) {
  const v = validateImport(input);
  if (!v.ok) return v;
  const duplicate = await db
    .prepare("SELECT id FROM imports WHERE id=?")
    .bind(await hash(JSON.stringify(v.data)))
    .first();
  if (duplicate)
    return {
      ...v,
      changes: v.data.games.map((g) => ({
        id: g.id,
        description: "Already published. Publishing again makes no changes.",
      })),
    };
  const errors: string[] = [];
  const changes: any[] = [];
  const current = await players(db);
  const names = new Map(
    current.flatMap((p) =>
      [p.name, ...p.aliases].map((n) => [n.toLowerCase(), p.id] as const),
    ),
  );
  for (const p of v.data.players) {
    const existing = current.find((x) => x.id === p.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(p))
      errors.push(
        `${p.name}: directory differs from current player. Export the current directory or edit the player in Manage data first.`,
      );
    for (const name of [p.name, ...p.aliases])
      if (
        names.has(name.toLowerCase()) &&
        names.get(name.toLowerCase()) !== p.id
      )
        errors.push(`Name or alias already belongs to another player: ${name}`);
  }
  const session: any = await db
    .prepare("SELECT date FROM sessions WHERE id=?")
    .bind(v.data.session.id)
    .first();
  if (session && session.date !== v.data.session.date)
    errors.push("Existing session date cannot change through an import.");
  const existingGames = await db
    .prepare(
      `SELECT id,revision,session_id,payload FROM games WHERE id IN (${v.data.games.map(() => "?").join(",")})`,
    )
    .bind(...v.data.games.map((g) => g.id))
    .all<any>();
  for (const g of v.data.games) {
    const old = existingGames.results.find((r) => r.id === g.id);
    if (old?.session_id && old.session_id !== v.data.session.id)
      errors.push(`${g.label}: game belongs to another session.`);
    if ((old?.revision || 0) !== g.base_revision)
      errors.push(
        `${g.label}: revision conflict; current revision is ${old?.revision || 0}. Export the current game before correcting it.`,
      );
    const prior = old ? JSON.parse(old.payload) : null;
    changes.push({
      id: g.id,
      description: prior
        ? `${prior.events.length} → ${g.events.length} plays; ${prior.roster.length} → ${g.roster.length} roster entries.`
        : "New game; no existing data replaced.",
    });
  }
  return {
    ...v,
    ok: !errors.length,
    errors: [...v.errors, ...errors],
    changes,
  };
}
export async function publish(db: D1Database, input: unknown) {
  const structural = validateImport(input);
  if (!structural.ok) throw new HttpError(400, structural.errors.join("\n"));
  const payload = structural.data;
  const key = await hash(JSON.stringify(payload));
  const already = await db
    .prepare("SELECT id FROM imports WHERE id=?")
    .bind(key)
    .first();
  if (already)
    return {
      message:
        "This exact import is already published. No data was duplicated.",
      duplicate: true,
    };
  const baseline: any = await meta(db);
  const v = await validate(db, payload);
  if (!v.ok) throw new HttpError(409, v.errors.join("\n"));
  const now = new Date().toISOString(),
    guard = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [];
  const add = (sql: string, ...args: any[]) =>
    statements.push(db.prepare(sql).bind(...args));
  // A single version guard covers all games AND player identity validation. A competing
  // edit fails the CHECK and rolls back this entire batch before any publication.
  add(
    "INSERT INTO publication_guard(id,ok) SELECT ?,CASE WHEN (SELECT version FROM metadata WHERE id=1)=? THEN 1 ELSE 0 END",
    guard,
    baseline.version,
  );
  add(
    "INSERT INTO imports(id,payload,published_at) VALUES(?,?,?)",
    key,
    JSON.stringify(payload),
    now,
  );
  add(
    "INSERT OR IGNORE INTO players(id,name,aliases) SELECT json_extract(value,'$.id'),json_extract(value,'$.name'),json_extract(value,'$.aliases') FROM json_each(?)",
    JSON.stringify(payload.players),
  );
  const aliases = payload.players.flatMap((p) =>
    [...new Set([p.name, ...p.aliases].map((n) => n.toLowerCase()))].map(
      (name) => ({ name, id: p.id }),
    ),
  );
  add(
    "INSERT OR IGNORE INTO player_names(name,player_id) SELECT json_extract(value,'$.name'),json_extract(value,'$.id') FROM json_each(?)",
    JSON.stringify(aliases),
  );
  add(
    "INSERT OR IGNORE INTO sessions(id,date,label) VALUES(?,?,?)",
    payload.session.id,
    payload.session.date,
    payload.session.label,
  );
  const records = payload.games.map((g) => ({
    ...g,
    date: payload.session.date,
    session_id: payload.session.id,
    revision: g.base_revision + 1,
  }));
  const summaries = records.map((record) => {
    const { events, ...rest } = publicGame(record);
    return {
      record,
      summary: {
        ...rest,
        score: score(record),
        shots: events.filter((e) => e.type === "shot").length,
        assigned: events.filter((e) => e.type === "shot" && e.defenders.length)
          .length,
      },
    };
  });
  add(
    "INSERT INTO revisions(game_id,revision,payload,import_id,published_at) SELECT json_extract(value,'$.id'),json_extract(value,'$.revision'),value,?,? FROM json_each(?)",
    key,
    now,
    JSON.stringify(records),
  );
  add(
    "INSERT INTO games(id,session_id,date,label,revision,payload,summary) SELECT json_extract(value,'$.record.id'),json_extract(value,'$.record.session_id'),json_extract(value,'$.record.date'),json_extract(value,'$.record.label'),json_extract(value,'$.record.revision'),json_extract(value,'$.record'),json_extract(value,'$.summary') FROM json_each(?) WHERE true ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload,summary=excluded.summary,label=excluded.label",
    JSON.stringify(summaries),
  );
  const ids = JSON.stringify(records.map((g) => g.id));
  for (const table of [
    "participants",
    "events",
    "shot_defenders",
    "player_game_stats",
  ])
    add(
      `DELETE FROM ${table} WHERE game_id IN (SELECT value FROM json_each(?))`,
      ids,
    );
  const roster = records.flatMap((g) =>
    g.roster.map((p) => ({ ...p, game_id: g.id })),
  );
  const events = records.flatMap((g) =>
    publicGame(g).events.map((e) => ({ ...e, game_id: g.id })),
  );
  const defenders = events.flatMap((e) =>
    e.defenders.map((d) => ({
      game_id: e.game_id,
      event_id: e.id,
      participant_id: d,
      weight: 1 / e.defenders.length,
    })),
  );
  add(
    "INSERT INTO participants(game_id,id,player_id,team,outsider) SELECT json_extract(value,'$.game_id'),json_extract(value,'$.id'),json_extract(value,'$.player_id'),json_extract(value,'$.team'),json_extract(value,'$.outsider') FROM json_each(?)",
    JSON.stringify(roster),
  );
  add(
    "INSERT INTO events(game_id,id,sequence,type,actor,payload) SELECT json_extract(value,'$.game_id'),json_extract(value,'$.id'),json_extract(value,'$.sequence'),json_extract(value,'$.type'),json_extract(value,'$.actor'),json_remove(value,'$.game_id') FROM json_each(?)",
    JSON.stringify(events),
  );
  add(
    "INSERT INTO shot_defenders(game_id,event_id,participant_id,weight) SELECT json_extract(value,'$.game_id'),json_extract(value,'$.event_id'),json_extract(value,'$.participant_id'),json_extract(value,'$.weight') FROM json_each(?)",
    JSON.stringify(defenders),
  );
  add(
    "INSERT INTO player_game_stats(game_id,player_id,date,coverage,stats) SELECT json_extract(value,'$.game_id'),json_extract(value,'$.player_id'),json_extract(value,'$.date'),json_extract(value,'$.coverage'),json_extract(value,'$.values') FROM json_each(?)",
    JSON.stringify(records.flatMap(gameRows)),
  );
  add("UPDATE metadata SET version=version+1,updated_at=? WHERE id=1", now);
  add("DELETE FROM publication_guard WHERE id=?", guard);
  try {
    await db.batch(statements);
  } catch (e) {
    if (/constraint|UNIQUE|CHECK/i.test(String(e)))
      throw new HttpError(
        409,
        "Another publication changed the data. Reload current revisions and review again.",
      );
    throw e;
  }
  return {
    message: `Published ${payload.games.length} game${payload.games.length === 1 ? "" : "s"}. Your dashboard is updated.`,
    duplicate: false,
  };
}
export async function exportGame(db: D1Database, id: string): Promise<Import> {
  const row: any = await db
    .prepare("SELECT payload,session_id FROM games WHERE id=?")
    .bind(id)
    .first();
  if (!row) throw new HttpError(404, "Game not found.");
  const record: GameRecord = JSON.parse(row.payload);
  const session: any = await db
    .prepare("SELECT * FROM sessions WHERE id=?")
    .bind(row.session_id)
    .first();
  const { date, session_id, revision, ...g } = record;
  return {
    schema_version: 1,
    session,
    players: await players(db),
    games: [{ ...g, base_revision: revision }],
    unresolved: [],
  };
}
