import { z } from "zod";
import { filtersSchema, playerSchema, type GameRecord } from "../shared/model";
import { publicGame } from "../shared/stats";
import {
  players,
  meta,
  snapshot,
  listGames,
  validate,
  publish,
  exportGame,
  HttpError,
} from "./store";
import { login, authorize, type Env } from "./auth";
import { ask } from "./ai";
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
async function body(request: Request) {
  if (Number(request.headers.get("content-length")) > 1024 * 1024)
    throw new HttpError(413, "Import must be under 1 MB.");
  const text = await request.text();
  if (new TextEncoder().encode(text).length > 1024 * 1024)
    throw new HttpError(413, "Import must be under 1 MB.");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
}
function filters(url: URL) {
  const f = filtersSchema.safeParse({
    from: url.searchParams.get("from") || "1970-01-01",
    to: url.searchParams.get("to") || "2100-12-31",
    players: url.searchParams.get("players")?.split(",").filter(Boolean) || [],
    mode: url.searchParams.get("mode") || "totals",
  });
  if (!f.success) throw new HttpError(400, "Invalid dates or player filters.");
  return f.data;
}
async function route(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url),
    path = url.pathname.replace(/^\/api/, "");
  const method = request.method;
  if (method === "OPTIONS") return new Response(null, { status: 204 });
  if (path === "/health") return json({ ok: true });
  if (method === "GET" && path === "/meta") return json(await meta(env.DB));
  if (method === "GET" && path === "/players")
    return json(await players(env.DB));
  if (
    method === "GET" &&
    ["/snapshot", "/stats", "/teammates"].includes(path)
  ) {
    const f = filters(url);
    const m: any = await meta(env.DB);
    const cacheKey = new Request(
      `https://hoops-cache.invalid/${m.version}${path}?${new URLSearchParams({ from: f.from, to: f.to, players: f.players.join(","), mode: f.mode })}`,
    );
    const cache = (caches as CacheStorage & { default: Cache }).default;
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    const data = await snapshot(env.DB, f);
    const response = json(
      path === "/stats"
        ? data.stats
        : path === "/teammates"
          ? data.pairs
          : data,
    );
    const stored = response.clone();
    stored.headers.set("Cache-Control", "public,max-age=86400");
    ctx.waitUntil(cache.put(cacheKey, stored));
    return response;
  }
  if (method === "GET" && /^\/players\/[^/]+\/history$/.test(path)) {
    const f = filters(url);
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
    const result = await env.DB.prepare(
      "SELECT * FROM player_game_stats WHERE player_id=? AND date BETWEEN ? AND ? ORDER BY date DESC,game_id LIMIT 100 OFFSET ?",
    )
      .bind(decodeURIComponent(path.split("/")[2]), f.from, f.to, offset)
      .all<any>();
    return json(
      result.results.map((r) => ({
        player_id: r.player_id,
        game_id: r.game_id,
        date: r.date,
        coverage: JSON.parse(r.coverage),
        values: JSON.parse(r.stats),
      })),
    );
  }
  if (method === "GET" && path === "/games") {
    const limit = Math.max(
      1,
      Math.min(100, Number(url.searchParams.get("limit")) || 30),
    );
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
    return json(
      await listGames(
        env.DB,
        filters(url),
        limit,
        offset,
        url.searchParams.get("pair") === "1",
      ),
    );
  }
  if (method === "GET" && /^\/games\/[^/]+\/events$/.test(path)) {
    const id = decodeURIComponent(path.split("/")[2]);
    const after = Math.max(-1, Number(url.searchParams.get("after") || -1));
    const result = await env.DB.prepare(
      "SELECT payload FROM events WHERE game_id=? AND sequence>? ORDER BY sequence LIMIT 100",
    )
      .bind(id, after)
      .all<any>();
    const events = result.results.map((r) => JSON.parse(r.payload));
    return json({
      events,
      next: events.length === 100 ? events[events.length - 1].sequence : null,
    });
  }
  if (method === "GET" && /^\/games\/[^/]+$/.test(path)) {
    const row: any = await env.DB.prepare(
      "SELECT payload FROM games WHERE id=?",
    )
      .bind(decodeURIComponent(path.split("/")[2]))
      .first();
    if (!row) throw new HttpError(404, "Game not found.");
    return json(publicGame(JSON.parse(row.payload)));
  }
  if (method === "POST" && ["/auth/owner", "/auth/friend"].includes(path))
    return json(
      await login(
        request,
        env,
        path.endsWith("owner") ? "owner" : "friend",
        await body(request),
      ),
    );
  if (method === "POST" && path === "/ai") {
    await authorize(request, env, "friend");
    return json(await ask(request, env, await body(request)));
  }
  if (path.startsWith("/owner/")) {
    await authorize(request, env, "owner");
    if (method === "GET" && path === "/owner/players")
      return json(await players(env.DB));
    if (method === "POST" && path === "/owner/players") {
      const parsed = playerSchema.safeParse(await body(request));
      if (!parsed.success)
        throw new HttpError(400, "Invalid player name, ID or aliases.");
      const p = parsed.data;
      const names = [
        ...new Set([p.name, ...p.aliases].map((n) => n.toLowerCase())),
      ];
      for (const n of names) {
        const existing: any = await env.DB.prepare(
          "SELECT player_id FROM player_names WHERE name=?",
        )
          .bind(n)
          .first();
        if (existing && existing.player_id !== p.id)
          throw new HttpError(
            409,
            "That name or alias belongs to another player.",
          );
      }
      const stmts = [
        env.DB.prepare(
          "INSERT INTO players(id,name,aliases) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,aliases=excluded.aliases",
        ).bind(p.id, p.name, JSON.stringify(p.aliases)),
        env.DB.prepare("DELETE FROM player_names WHERE player_id=?").bind(p.id),
        ...names.map((n) =>
          env.DB.prepare(
            "INSERT INTO player_names(name,player_id) VALUES(?,?)",
          ).bind(n, p.id),
        ),
        env.DB.prepare(
          "UPDATE metadata SET version=version+1,updated_at=? WHERE id=1",
        ).bind(new Date().toISOString()),
      ];
      try {
        await env.DB.batch(stmts);
      } catch {
        throw new HttpError(
          409,
          "Player identity changed concurrently. Reload and try again.",
        );
      }
      return json(p);
    }
    if (method === "POST" && path === "/owner/imports/validate")
      return json(await validate(env.DB, await body(request)));
    if (method === "POST" && path === "/owner/imports/publish")
      return json(await publish(env.DB, await body(request)));
    if (method === "GET" && path === "/owner/revisions") {
      const r = await env.DB.prepare(
        "SELECT r.game_id,r.revision,r.published_at,g.label,g.revision current_revision FROM revisions r JOIN games g ON g.id=r.game_id ORDER BY r.published_at DESC LIMIT 200",
      ).all();
      return json(r.results);
    }
    if (method === "GET" && /^\/owner\/games\/[^/]+\/export$/.test(path))
      return json(
        await exportGame(env.DB, decodeURIComponent(path.split("/")[3])),
      );
    if (method === "POST" && path === "/owner/restore") {
      const input = z
        .object({
          game_id: z.string(),
          revision: z.number().int().positive(),
          base_revision: z.number().int().positive(),
        })
        .parse(await body(request));
      const old: any = await env.DB.prepare(
        "SELECT payload FROM revisions WHERE game_id=? AND revision=?",
      )
        .bind(input.game_id, input.revision)
        .first();
      if (!old) throw new HttpError(404, "Revision not found.");
      const pack = await exportGame(env.DB, input.game_id);
      const { date, session_id, revision, ...g } = JSON.parse(
        old.payload,
      ) as GameRecord;
      pack.games = [{ ...g, base_revision: input.base_revision }];
      return json(await publish(env.DB, pack));
    }
    if (method === "GET" && path === "/owner/export") {
      const current = await env.DB.prepare(
        "SELECT payload FROM games ORDER BY date,id",
      ).all<any>();
      const sessions = (
        await env.DB.prepare("SELECT * FROM sessions").all<any>()
      ).results;
      const directory = await players(env.DB);
      const packs = current.results.map((row) => {
        const { date, session_id, revision, ...game } = JSON.parse(row.payload);
        return {
          schema_version: 1,
          session: sessions.find((s) => s.id === session_id),
          players: directory,
          games: [{ ...game, base_revision: revision }],
          unresolved: [],
        };
      });
      const history = await env.DB.prepare(
        "SELECT * FROM imports ORDER BY published_at",
      ).all();
      return json({
        backup_version: 1,
        exported_at: new Date().toISOString(),
        players: directory,
        current: packs,
        history: history.results.map((r: any) => ({
          ...r,
          payload: JSON.parse(r.payload),
        })),
      });
    }
  }
  throw new HttpError(404, "Endpoint not found.");
}
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    let response: Response;
    try {
      const origin = request.headers.get("Origin");
      const allowed = env.ALLOWED_ORIGIN.split(",").map((s) => s.trim());
      if (origin && !allowed.includes(origin))
        throw new HttpError(403, "This site origin is not allowed.");
      response = await route(request, env, ctx);
    } catch (e) {
      response = json(
        {
          error:
            e instanceof HttpError
              ? e.message
              : e instanceof z.ZodError
                ? "Invalid request."
                : "The data service is temporarily unavailable. Please try again shortly.",
        },
        e instanceof HttpError ? e.status : e instanceof z.ZodError ? 400 : 503,
      );
      if (!(e instanceof HttpError))
        console.error(
          "Request failed",
          e instanceof Error ? e.message : "Unknown error",
        );
    }
    const headers = new Headers(response.headers);
    const origin = request.headers.get("Origin");
    if (
      origin &&
      env.ALLOWED_ORIGIN.split(",")
        .map((s) => s.trim())
        .includes(origin)
    )
      headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Allow-Headers", "Content-Type,Authorization");
    headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    headers.set("Access-Control-Max-Age", "86400");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(response.body, { status: response.status, headers });
  },
};
