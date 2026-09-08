import { describe, it, expect } from "vitest";
import { sampleImport, demoGames, demoPlayers } from "../shared/demo";
import {
  validateImport,
  importSchema,
  categories,
  type GameRecord,
} from "../shared/model";
import { gameRows, aggregate, teammatePairs, score } from "../shared/stats";
import { range, shiftDate } from "../shared/dates";
function fixture(): GameRecord {
  return {
    id: "g1",
    label: "Game 1",
    base_revision: 0,
    revision: 1,
    date: "2026-09-04",
    session_id: "s1",
    completed: true,
    scoring_complete: true,
    coverage: Object.fromEntries(
      categories.map((k) => [k, true]),
    ) as GameRecord["coverage"],
    roster: [
      { id: "a", player_id: "a", team: "A", outsider: false },
      { id: "b", player_id: "b", team: "A", outsider: false },
      { id: "c", player_id: "c", team: "B", outsider: false },
      { id: "d", player_id: "d", team: "B", outsider: false },
      { id: "outside", player_id: null, team: "B", outsider: true },
    ],
    events: [
      {
        id: "e1",
        sequence: 1,
        type: "shot",
        actor: "a",
        value: 3,
        made: true,
        assist: "b",
        defenders: ["c", "d"],
      },
      {
        id: "e2",
        sequence: 2,
        type: "shot",
        actor: "a",
        value: 2,
        made: false,
        defenders: ["c"],
      },
      {
        id: "e3",
        sequence: 3,
        type: "shot",
        actor: "outside",
        value: 2,
        made: true,
        defenders: ["a", "b"],
      },
      { id: "e4", sequence: 4, type: "turnover", actor: "c", defenders: [] },
      {
        id: "e5",
        sequence: 5,
        type: "steal",
        actor: "a",
        related_event_id: "e4",
        defenders: [],
      },
    ],
  };
}
const ps = ["a", "b", "c", "d"].map((id) => ({ id, name: id, aliases: [] }));
describe("counting", () => {
  it("matches hand-counted shots, assists and shared defense", () => {
    const stats = aggregate(gameRows(fixture()), ps);
    const a = stats.find((s) => s.id === "a")!,
      b = stats.find((s) => s.id === "b")!,
      c = stats.find((s) => s.id === "c")!;
    expect(a.points).toBe(3);
    expect(a.fgPct).toBe(50);
    expect(a.pps).toBe(1.5);
    expect(a.steals).toBe(1);
    expect(a.deflections).toBe(0);
    expect(b.assists).toBe(1);
    expect(b.assistedPoints).toBe(3);
    expect(b.contribution).toBe(3);
    expect(c.oppAtt).toBe(1.5);
    expect(c.oppMade).toBe(0.5);
    expect(c.oppPct).toBeCloseTo(100 / 3);
    expect(stats).toHaveLength(4);
    expect(score(fixture())).toEqual({ A: 3, B: 2 });
  });
  it("counts all defenders, including outsiders, in equal weights", () => {
    const g = fixture();
    g.events[0].defenders = ["c", "d", "outside"];
    const s = aggregate(gameRows(g), ps);
    expect(s.find((s) => s.id === "d")!.oppAtt).toBeCloseTo(1 / 3);
    expect(s.find((s) => s.id === "outside")).toBeUndefined();
  });
  it("credits tracked assists on outsider baskets", () => {
    const g = fixture();
    g.events[2].assist = "c";
    expect(
      aggregate(gameRows(g), ps).find((s) => s.id === "c")!.assistedPoints,
    ).toBe(2);
  });
  it("preserves zero-event participants and zero attempts as null", () => {
    const g = fixture();
    g.events = [];
    const s = aggregate(gameRows(g), ps);
    expect(s).toHaveLength(4);
    expect(s[0].fgPct).toBeNull();
    expect(s[0].games).toBe(1);
  });
  it("uses category-specific complete games for averages", () => {
    const full = fixture(),
      partial = fixture();
    partial.id = "g2";
    partial.coverage = { ...partial.coverage, shooting: false };
    partial.events[0] = { ...partial.events[0], value: 2 };
    const all = aggregate(
      [...gameRows(full), ...gameRows(partial)],
      ps,
      "per-game",
    );
    const a = all.find((s) => s.id === "a")!;
    expect(a.points).toBe(3);
    expect(a.eligible.points).toBe(1);
    expect(a.games).toBe(2);
    expect(a.fgPct).toBe(50);
  });
  it("does not average percentages across games", () => {
    const a = fixture(),
      b = fixture();
    b.events = b.events.filter((e) => e.type !== "shot" || e.made);
    expect(
      aggregate([...gameRows(a), ...gameRows(b)], ps).find((p) => p.id === "a")!
        .fgPct,
    ).toBeCloseTo(200 / 3);
  });
  it("hides scores unless complete", () => {
    const g = fixture();
    g.scoring_complete = false;
    expect(score(g)).toBeNull();
  });
  it("tracks same-team and never-teammate pairs only across shared sessions", () => {
    const pairs = teammatePairs([fixture()], ps);
    expect(pairs.find((p) => p.a === "a" && p.b === "b")!.games).toBe(1);
    expect(pairs.find((p) => p.a === "a" && p.b === "c")!.games).toBe(0);
    expect(
      teammatePairs(
        [fixture()],
        [...ps, { id: "absent", name: "Absent", aliases: [] }],
      ).some((p) => p.a === "absent" || p.b === "absent"),
    ).toBe(false);
  });
  it("renaming preserves counts", () => {
    const s = aggregate(
      gameRows(fixture()),
      ps.map((p) => ({ ...p, name: "Renamed " + p.id })),
    );
    expect(s.find((p) => p.id === "a")!.points).toBe(3);
  });
});
describe("contract", () => {
  it("accepts all generated sample games", () => {
    expect(validateImport(sampleImport()).ok).toBe(true);
  });
  it("rejects duplicates and unresolved questions", () => {
    const p = sampleImport();
    p.games[0].events.push(p.games[0].events[0]);
    p.unresolved = ["Who shot?"];
    expect(validateImport(p).ok).toBe(false);
  });
  it("rejects assists on misses and wrong-team defenders", () => {
    const p = sampleImport();
    p.games[0].events[0].made = false;
    p.games[0].events[0].assist = p.games[0].events[0].actor;
    p.games[0].events[0].defenders = [p.games[0].events[0].actor];
    expect(validateImport(p).ok).toBe(false);
  });
  it("rejects impossible dates and hidden extra fields", () => {
    const p: any = sampleImport();
    p.session.date = "2026-02-30";
    expect(validateImport(p).ok).toBe(false);
    p.session.date = "2026-09-04";
    p.extra = "secret";
    expect(validateImport(p).ok).toBe(false);
  });
  it("rejects outsider personal statistics", () => {
    const p = sampleImport();
    const r = p.games[0].roster[0];
    r.player_id = null;
    r.outsider = true;
    p.games[0].events = [
      { id: "out", sequence: 1, type: "steal", actor: r.id, defenders: [] },
    ];
    expect(validateImport(p).ok).toBe(false);
  });
});
describe("dates", () => {
  it("uses Monday–Sunday across year boundaries", () => {
    expect(range("week", "2026-01-01", "2025-01-01")).toEqual({
      from: "2025-12-29",
      to: "2026-01-04",
    });
  });
  it("handles leap years and calendar months", () => {
    expect(range("month", "2024-02-10", "")).toEqual({
      from: "2024-02-01",
      to: "2024-02-29",
    });
    expect(shiftDate("2024-02-28", 1)).toBe("2024-02-29");
  });
  it("uses latest game for all-time end", () => {
    expect(range("all", "2026-09-04", "2026-08-07")).toEqual({
      from: "2026-08-07",
      to: "2026-09-04",
    });
  });
});
