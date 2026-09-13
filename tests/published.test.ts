import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { publishedSchema, publishStatic } from "../shared/published";
import { publishedRequest, type Snapshot } from "../src/api";
import { sampleImport } from "../shared/demo";

const data = publishedSchema.parse(JSON.parse(readFileSync("public/stats.json","utf8")));
describe("published stats without a backend", () => {
  it("shows the real game and six tracked players, with guests only in the roster", () => {
    const snapshot = publishedRequest(data,"/snapshot?from=2026-09-11&to=2026-09-11") as Snapshot;
    expect(snapshot.totalGames).toBe(1);
    expect(snapshot.stats).toHaveLength(6);
    expect(snapshot.games[0].score).toEqual({A:21,B:27});
    expect(snapshot.stats.find(p=>p.id === "saad")?.points).toBe(15);
    expect(snapshot.games[0].roster.filter(p=>p.outsider)).toHaveLength(2);
  });
  it("filters dates and players, and distinguishes teammates from opponents", () => {
    const empty = publishedRequest(data,"/snapshot?from=2026-08-01&to=2026-08-31") as Snapshot;
    expect(empty.totalGames).toBe(0);
    expect(empty.stats).toHaveLength(0);
    const selected = publishedRequest(data,"/snapshot?players=mandeep") as Snapshot;
    expect(selected.stats.map(s=>s.name)).toEqual(["Mandeep"]);
    expect(publishedRequest(data,"/games?pair=1&players=mandeep,saad")).toHaveLength(1);
    expect(publishedRequest(data,"/games?pair=1&players=mandeep,wilson")).toHaveLength(0);
    expect(publishedRequest(data,"/players/wilson/history")).toHaveLength(1);
    expect(publishedRequest(data,"/players/wilson/history?offset=1")).toHaveLength(0);
  });
  it("paginates events and respects partial per-game coverage", () => {
    const first:any = publishedRequest(data,"/games/game-2026-09-11-1/events");
    const second:any = publishedRequest(data,`/games/game-2026-09-11-1/events?after=${first.next}`);
    expect(first.events).toHaveLength(100);
    expect(second.events).toHaveLength(73);
    expect(new Set([...first.events,...second.events].map(e=>e.id)).size).toBe(173);
    expect(second.next).toBeNull();
    const snapshot = publishedRequest(data,"/snapshot?mode=per-game") as Snapshot;
    expect(snapshot.stats.find(s=>s.id === "saad")?.points).toBe(15);
    expect(snapshot.stats.every(s=>Number.isNaN(s.dreb))).toBe(true);
    expect(()=>publishedRequest(data,"/owner/export")).toThrow("not enabled");
  });
  it("rejects private fields and strips commentary on export", () => {
    expect(JSON.stringify(data)).not.toMatch(/"(?:source|transcript|OWNER_PASSPHRASE|FRIEND_ACCESS_CODE)"/);
    const bad=structuredClone(data) as any;
    bad.games[0].events[0].source="private commentary";
    expect(publishedSchema.safeParse(bad).success).toBe(false);
    const pack=sampleImport();
    pack.transcript="PRIVATE_TRANSCRIPT_MARKER";
    pack.games[0].events[0].source="PRIVATE_PLAY_MARKER";
    const result=publishStatic(pack);
    expect(JSON.stringify(result)).not.toContain("PRIVATE_");
    expect(publishStatic(pack,result)).toEqual(result);
    const correction=structuredClone(pack);
    correction.games[0].label="Changed game";
    expect(()=>publishStatic(correction,result)).toThrow("revision conflict");
    correction.games=correction.games.slice(0,1);
    correction.games[0].base_revision=1;
    const updated=publishStatic(correction,result);
    expect(updated.games).toHaveLength(result.games.length);
    expect(updated.games.find(g=>g.id===correction.games[0].id)?.revision).toBe(2);
  });
});
