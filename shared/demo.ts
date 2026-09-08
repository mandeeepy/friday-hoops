import {
  categories,
  type Import,
  type GameRecord,
  type Player,
  type Play,
} from "./model";
export const demoPlayers: Player[] = [
  ["kai", "Kai Chen"],
  ["alex", "Alex Wong"],
  ["sam", "Sam Lee"],
  ["jordan", "Jordan Ho"],
  ["marcus", "Marcus Lau"],
  ["ryan", "Ryan Lam"],
  ["dan", "Dan Wu"],
  ["ash", "Ash Singh"],
].map(([id, name]) => ({ id, name, aliases: [name.split(" ")[0]] }));
export function sampleImport(
  date = "2026-09-04",
  sessionId = "friday-2026-09-04",
): Import {
  let seed = Number(date.replaceAll("-", ""));
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const games: Import["games"] = Array.from({ length: 4 }, (_, gi) => {
    const offset = gi % 3;
    const roster = demoPlayers.map((p, i) => ({
      id: p.id,
      player_id: p.id,
      outsider: false,
      team: ((i + offset) % 8 < 4 ? "A" : "B") as "A" | "B",
    }));
    const events: Play[] = [];
    let seq = 0;
    const add = (
      e: Omit<Play, "id" | "sequence" | "defenders"> & { defenders?: string[] },
    ) => {
      const play = {
        ...e,
        defenders: e.defenders || [],
        id: `e${++seq}`,
        sequence: seq,
      };
      events.push(play);
      return play;
    };
    for (let i = 0; i < 46; i++) {
      const shooter = roster[Math.floor(random() * 8)],
        team = roster.filter(
          (p) => p.team === shooter.team && p.id !== shooter.id,
        ),
        opps = roster.filter((p) => p.team !== shooter.team);
      const defender = opps[Math.floor(random() * 4)];
      const made = random() < 0.48;
      const shot = add({
        type: "shot",
        actor: shooter.id,
        value: random() < 0.3 ? 3 : 2,
        made,
        assist:
          made && random() < 0.57
            ? team[Math.floor(random() * 3)].id
            : undefined,
        defenders:
          random() < 0.12
            ? []
            : random() < 0.18
              ? [defender.id, opps.find((p) => p.id !== defender.id)!.id]
              : [defender.id],
        video_seconds: i * 23,
      });
      if (!made) {
        if (random() < 0.1)
          add({ type: "block", actor: defender.id, related_event_id: shot.id });
        const offensive = random() < 0.26;
        add({
          type: offensive ? "oreb" : "dreb",
          actor: offensive ? team[Math.floor(random() * 3)].id : defender.id,
          related_event_id: shot.id,
        });
      }
      if (random() < 0.15) {
        const to = add({ type: "turnover", actor: shooter.id });
        if (random() < 0.65)
          add({ type: "steal", actor: defender.id, related_event_id: to.id });
      }
      if (random() < 0.17) add({ type: "deflection", actor: defender.id });
    }
    return {
      id: `${sessionId}-g${gi + 1}`,
      label: `Game ${gi + 1}`,
      base_revision: 0,
      completed: true,
      scoring_complete: true,
      coverage: Object.fromEntries(
        categories.map((k) => [k, true]),
      ) as Import["games"][number]["coverage"],
      roster,
      events,
    };
  });
  return {
    schema_version: 1,
    session: { id: sessionId, date, label: "Friday run" },
    players: demoPlayers,
    games,
    unresolved: [],
  };
}
export const demoImports = [
  "2026-08-07",
  "2026-08-14",
  "2026-08-21",
  "2026-08-28",
  "2026-09-04",
].map((d) => sampleImport(d, `friday-${d}`));
export const demoGames: GameRecord[] = demoImports.flatMap((i) =>
  i.games.map((g) => ({
    ...g,
    date: i.session.date,
    session_id: i.session.id,
    revision: 1,
  })),
);
