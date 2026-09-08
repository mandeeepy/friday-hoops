import { z } from "zod";

export const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Invalid calendar date",
  );
export const categories = [
  "shooting",
  "assists",
  "oreb",
  "turnovers",
  "defense",
  "deflections",
  "steals",
  "blocks",
  "dreb",
] as const;
export type Category = (typeof categories)[number];
export const coverageSchema = z
  .object(
    Object.fromEntries(categories.map((k) => [k, z.boolean()])) as Record<
      Category,
      z.ZodBoolean
    >,
  )
  .strict();
export const playerSchema = z
  .object({
    id,
    name: z.string().trim().min(1).max(60),
    aliases: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  })
  .strict();
export const participantSchema = z
  .object({
    id,
    player_id: id.nullable(),
    team: z.enum(["A", "B"]),
    outsider: z.boolean(),
  })
  .strict();
export const eventSchema = z
  .object({
    id,
    sequence: z.number().int().nonnegative(),
    type: z.enum([
      "shot",
      "oreb",
      "dreb",
      "turnover",
      "steal",
      "block",
      "deflection",
    ]),
    actor: id,
    value: z.union([z.literal(2), z.literal(3)]).optional(),
    made: z.boolean().optional(),
    assist: id.optional(),
    defenders: z.array(id).max(10).default([]),
    related_event_id: id.optional(),
    video_seconds: z.number().nonnegative().optional(),
    source: z.string().max(2000).optional(),
  })
  .strict();
export const gameSchema = z
  .object({
    id,
    label: z.string().min(1).max(100),
    base_revision: z.number().int().nonnegative(),
    completed: z.boolean(),
    scoring_complete: z.boolean(),
    coverage: coverageSchema,
    roster: z.array(participantSchema).min(2).max(30),
    events: z.array(eventSchema).max(10000),
    video_url: z
      .string()
      .url()
      .refine((v) => /^https?:\/\//.test(v))
      .optional(),
  })
  .strict();
export const importSchema = z
  .object({
    schema_version: z.literal(1),
    session: z.object({ id, date, label: z.string().min(1).max(100) }).strict(),
    players: z.array(playerSchema).max(200),
    games: z.array(gameSchema).min(1).max(50),
    unresolved: z.array(z.string().max(2000)).max(100),
    transcript: z.string().max(200000).optional(),
  })
  .strict();
export type Player = z.infer<typeof playerSchema>;
export type Participant = z.infer<typeof participantSchema>;
export type Play = z.infer<typeof eventSchema>;
export type Game = z.infer<typeof gameSchema>;
export type Import = z.infer<typeof importSchema>;
export type GameRecord = Game & {
  date: string;
  session_id: string;
  revision: number;
};
export const metrics = [
  "points",
  "twoMade",
  "twoAtt",
  "threeMade",
  "threeAtt",
  "fgMade",
  "fgAtt",
  "assists",
  "assistedPoints",
  "contribution",
  "oreb",
  "turnovers",
  "oppMade",
  "oppAtt",
  "deflections",
  "steals",
  "blocks",
  "dreb",
] as const;
export type Metric = (typeof metrics)[number];
export const metricCategory: Record<Metric, Category> = {
  points: "shooting",
  twoMade: "shooting",
  twoAtt: "shooting",
  threeMade: "shooting",
  threeAtt: "shooting",
  fgMade: "shooting",
  fgAtt: "shooting",
  assists: "assists",
  assistedPoints: "assists",
  contribution: "assists",
  oreb: "oreb",
  turnovers: "turnovers",
  oppMade: "defense",
  oppAtt: "defense",
  deflections: "deflections",
  steals: "steals",
  blocks: "blocks",
  dreb: "dreb",
};
export type Numbers = Record<Metric, number>;
export type StatRow = {
  player_id: string;
  game_id: string;
  date: string;
  coverage: Game["coverage"];
  values: Numbers;
};
export type Stats = Numbers & {
  id: string;
  name: string;
  games: number;
  eligible: Record<Metric, number>;
  fgPct: number | null;
  twoPct: number | null;
  threePct: number | null;
  oppPct: number | null;
  pps: number | null;
  incomplete: boolean;
};
export type Filters = {
  from: string;
  to: string;
  players: string[];
  mode: "totals" | "per-game";
};
export const filtersSchema = z
  .object({
    from: date,
    to: date,
    players: z.array(id).max(100).default([]),
    mode: z.enum(["totals", "per-game"]).default("totals"),
  })
  .refine((v) => v.from <= v.to, "Start date must precede end date");

export function validateImport(input: unknown) {
  const parsed = importSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false as const,
      errors: parsed.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`,
      ),
      warnings: [],
    };
  const data = parsed.data,
    errors: string[] = [],
    warnings: string[] = [];
  const unique = (values: string[], label: string) => {
    if (new Set(values).size !== values.length)
      errors.push(`Duplicate ${label}`);
  };
  unique(
    data.players.map((p) => p.id),
    "player IDs",
  );
  unique(
    data.games.map((g) => g.id),
    "game IDs",
  );
  const names = new Map<string, string>();
  for (const p of data.players)
    for (const name of [p.name, ...p.aliases]) {
      const key = name.toLowerCase();
      if (names.has(key) && names.get(key) !== p.id)
        errors.push(`Ambiguous name or alias: ${name}`);
      names.set(key, p.id);
    }
  if (data.unresolved.length)
    errors.push("Resolve all unresolved items before publication.");
  const players = new Set(data.players.map((p) => p.id));
  for (const g of data.games) {
    const fail = (m: string) => errors.push(`${g.label}: ${m}`);
    unique(
      g.roster.map((p) => p.id),
      `${g.id} participant IDs`,
    );
    unique(
      g.roster.filter((p) => p.player_id).map((p) => p.player_id!),
      `${g.id} roster player IDs`,
    );
    unique(
      g.events.map((e) => e.id),
      `${g.id} event IDs`,
    );
    unique(
      g.events.map((e) => String(e.sequence)),
      `${g.id} sequences`,
    );
    const roster = new Map(g.roster.map((p) => [p.id, p]));
    const events = new Map(g.events.map((e) => [e.id, e]));
    if (
      !g.roster.some((p) => p.team === "A") ||
      !g.roster.some((p) => p.team === "B")
    )
      fail("Both teams need participants.");
    for (const p of g.roster) {
      if (p.outsider !== (p.player_id === null))
        fail(
          "Outsiders must have null player_id; tracked players require an ID.",
        );
      if (p.player_id && !players.has(p.player_id))
        fail(`Unknown player ${p.player_id}`);
    }
    const linked = new Set<string>();
    for (const e of g.events) {
      const actor = roster.get(e.actor);
      if (!actor) {
        fail(`${e.id}: unknown actor`);
        continue;
      }
      if (actor.outsider && e.type !== "shot")
        fail(`${e.id}: outsiders only permit anonymous shots`);
      if (e.type === "shot") {
        if (e.value === undefined || e.made === undefined)
          fail(`${e.id}: shots need value and made`);
        if (e.related_event_id)
          fail(`${e.id}: shots cannot link to another event`);
        if (e.assist) {
          const a = roster.get(e.assist);
          if (
            !e.made ||
            !a ||
            a.team !== actor.team ||
            a.id === actor.id ||
            a.outsider
          )
            fail(
              `${e.id}: assist must identify a tracked teammate on a made shot`,
            );
        }
        unique(e.defenders, `${e.id} defenders`);
        for (const d of e.defenders)
          if (!roster.has(d) || roster.get(d)!.team === actor.team)
            fail(`${e.id}: defender must be on the other team`);
      } else {
        if (
          e.value !== undefined ||
          e.made !== undefined ||
          e.assist ||
          e.defenders.length
        )
          fail(`${e.id}: shot-only fields on ${e.type}`);
        if (e.related_event_id) {
          const related = events.get(e.related_event_id);
          const key = `${e.type}:${e.related_event_id}`;
          if (linked.has(key))
            fail(`${e.id}: duplicate credit for linked play`);
          linked.add(key);
          if (!["block", "steal", "oreb", "dreb"].includes(e.type))
            fail(`${e.id}: unsupported relationship`);
          if (!related || related.sequence >= e.sequence)
            fail(`${e.id}: related event must precede this action`);
          else {
            const target = roster.get(related.actor);
            if (
              e.type === "steal" &&
              (related.type !== "turnover" || target?.team === actor.team)
            )
              fail(`${e.id}: steal must link to opponent turnover`);
            if (
              ["block", "oreb", "dreb"].includes(e.type) &&
              (related.type !== "shot" || related.made !== false)
            )
              fail(`${e.id}: link must identify a missed shot`);
            if (
              ["block", "dreb"].includes(e.type) &&
              target?.team === actor.team
            )
              fail(`${e.id}: action requires opponent shot`);
            if (e.type === "oreb" && target?.team !== actor.team)
              fail(`${e.id}: offensive rebound requires own-team shot`);
          }
        }
      }
    }
    if (!Object.values(g.coverage).every(Boolean))
      warnings.push(
        `${g.label}: partial tracking; per-game averages exclude incomplete categories.`,
      );
    const missing = g.events.filter(
      (e) => e.type === "shot" && !e.defenders.length,
    ).length;
    if (missing)
      warnings.push(
        `${g.label}: ${missing} recorded shots have no assigned defender.`,
      );
    if (!g.completed || !g.scoring_complete)
      warnings.push(`${g.label}: final score and outcome unavailable.`);
  }
  return errors.length
    ? { ok: false as const, errors, warnings }
    : { ok: true as const, data, errors, warnings };
}
