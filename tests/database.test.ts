import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { publish, validate, exportGame, snapshot } from "../worker/store";
import { reserve } from "../worker/ai";
import { login, authorize } from "../worker/auth";
import { sampleImport } from "../shared/demo";
function adapter() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync("migrations/0001_initial.sql", "utf8"));
  const api: any = {
    prepare(sql: string) {
      let args: any[] = [];
      const stmt: any = {
        bind(...values: any[]) {
          args = values;
          return stmt;
        },
        async first() {
          return db.prepare(sql).get(...args) || null;
        },
        async all() {
          return { results: db.prepare(sql).all(...args) };
        },
        async run() {
          return { meta: db.prepare(sql).run(...args) };
        },
      };
      return stmt;
    },
    async batch(stmts: any[]) {
      db.exec("BEGIN");
      try {
        const results = [];
        for (const s of stmts) results.push(await s.run());
        db.exec("COMMIT");
        return results;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return { db, api: api as D1Database };
}
describe("relational publication", () => {
  it("publishes, is idempotent, rejects stale revisions, and restores", async () => {
    const { api, db } = adapter();
    const p = sampleImport();
    await publish(api, p);
    expect(db.prepare("SELECT COUNT(*) n FROM games").get()!.n).toBe(4);
    const originalCount = db.prepare("SELECT COUNT(*) n FROM events").get()!.n;
    expect((await publish(api, p)).duplicate).toBe(true);
    expect(db.prepare("SELECT COUNT(*) n FROM events").get()!.n).toBe(
      originalCount,
    );
    const edit = await exportGame(api, p.games[0].id);
    edit.games[0].events = [];
    await publish(api, edit);
    expect(
      db.prepare("SELECT revision FROM games WHERE id=?").get(p.games[0].id)!
        .revision,
    ).toBe(2);
    const stale = structuredClone(p);
    stale.games[0].label = "Stale";
    await expect(publish(api, stale)).rejects.toThrow("revision conflict");
    const restore = await exportGame(api, p.games[0].id);
    restore.games[0] = { ...p.games[0], base_revision: 2 };
    await publish(api, restore);
    expect(
      db.prepare("SELECT revision FROM games WHERE id=?").get(p.games[0].id)!
        .revision,
    ).toBe(3);
    expect(db.prepare("SELECT COUNT(*) n FROM events").get()!.n).toBe(
      originalCount,
    );
  });
  it("rejects malformed imports without writes", async () => {
    const { api, db } = adapter();
    const p = sampleImport();
    p.unresolved = ["Unknown shooter"];
    await expect(publish(api, p)).rejects.toThrow("Resolve");
    expect(db.prepare("SELECT COUNT(*) n FROM imports").get()!.n).toBe(0);
  });
  it("guard constraints roll back an entire batch", async () => {
    const { api, db } = adapter();
    await expect(
      api.batch([
        api.prepare(
          "INSERT INTO sessions(id,date,label) VALUES('test','2026-01-01','Test')",
        ),
        api.prepare(
          "INSERT INTO publication_guard(id,ok) VALUES('conflict',0)",
        ),
      ]),
    ).rejects.toThrow();
    expect(db.prepare("SELECT COUNT(*) n FROM sessions").get()!.n).toBe(0);
  });
  it("materialized rows match shared stats and private source stays private", async () => {
    const { api, db } = adapter();
    const p = sampleImport();
    p.transcript = "private words";
    p.games[0].events[0].source = "private source";
    await publish(api, p);
    const data = await snapshot(api, {
      from: "2026-09-04",
      to: "2026-09-04",
      players: [],
      mode: "totals",
    });
    expect(data.stats).toHaveLength(8);
    expect(data.totalGames).toBe(4);
    expect(JSON.stringify(data)).not.toContain("private");
    const event: any = db.prepare("SELECT payload FROM events LIMIT 1").get();
    expect(event.payload).not.toContain("private source");
    expect(
      db.prepare("SELECT payload FROM imports LIMIT 1").get()!
        .payload as string,
    ).toContain("private words");
  });
  it("SQL backup restores event and revision counts", async () => {
    const { api, db } = adapter();
    await publish(api, sampleImport());
    const dest = new DatabaseSync(":memory:");
    const tables = db
      .prepare(
        "SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      )
      .all();
    dest.exec("PRAGMA foreign_keys=OFF");
    for (const t of tables) dest.exec(String(t.sql));
    for (const t of tables) {
      const rows = db.prepare(`SELECT * FROM ${t.name}`).all();
      for (const row of rows) {
        const cols = Object.keys(row);
        dest
          .prepare(
            `INSERT INTO ${t.name} (${cols.join(",")}) VALUES(${cols.map(() => "?").join(",")})`,
          )
          .run(...Object.values(row));
      }
    }
    expect(dest.prepare("SELECT COUNT(*) n FROM events").get()!.n).toBe(
      db.prepare("SELECT COUNT(*) n FROM events").get()!.n,
    );
    expect(dest.prepare("SELECT COUNT(*) n FROM revisions").get()!.n).toBe(4);
  });
});
describe("auth and budget boundaries", () => {
  it("separates owner and friend sessions and revokes on code rotation", async () => {
    const { api } = adapter();
    const env: any = {
      DB: api,
      OWNER_PASSPHRASE: "owner-test-secret",
      FRIEND_ACCESS_CODE: "friend-test-secret",
    };
    const request = new Request("http://test/api/auth/friend");
    const friend = await login(request, env, "friend", {
      code: "friend-test-secret",
    });
    const authed = new Request("http://test/api/owner/export", {
      headers: { Authorization: `Bearer ${friend.token}` },
    });
    await expect(authorize(authed, env, "owner")).rejects.toThrow("expired");
    await expect(authorize(authed, env, "friend")).resolves.toBeTruthy();
    env.FRIEND_ACCESS_CODE = "rotated";
    await expect(authorize(authed, env, "friend")).rejects.toThrow("expired");
  });
  it("does not overspend under simultaneous reservations", async () => {
    const { api, db } = adapter();
    const calls = await Promise.allSettled(
      Array.from({ length: 20 }, () => reserve(api, "2026-09", 0.4, 5)),
    );
    expect(calls.filter((c) => c.status === "fulfilled")).toHaveLength(12);
    const b: any = db.prepare("SELECT reserved FROM ai_budget").get();
    expect(b.reserved).toBeCloseTo(4.8);
    expect(b.reserved).toBeLessThanOrEqual(5);
  });
});
