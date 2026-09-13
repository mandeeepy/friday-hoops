import { z } from "zod";
import { date, eventSchema, gameSchema, id, playerSchema, validateImport } from "./model";
import { publicGame } from "./stats";

// The public file has an explicit schema that rejects private commentary.
export const publishedSchema = z.object({
  version: z.number().int().positive(),
  updated_at: z.string().datetime(),
  players: z.array(playerSchema),
  games: z.array(gameSchema.extend({
    date,
    session_id: id,
    revision: z.number().int().positive(),
    events: z.array(eventSchema.omit({ source: true }).strict()),
  }).strict()),
}).strict();
export type PublishedData = z.infer<typeof publishedSchema>;

export function publishStatic(input: unknown, previous?: PublishedData): PublishedData {
  const valid = validateImport(input);
  if (!valid.ok) throw new Error(valid.errors.join("\n"));
  const pack = valid.data;
  const players = new Map(previous?.players.map(p => [p.id, p]));
  const games = new Map(previous?.games.map(g => [g.id, g]));
  for (const p of pack.players) players.set(p.id, p);
  for (const game of pack.games) {
    const old = games.get(game.id);
    const record = publicGame({ ...game, date: pack.session.date, session_id: pack.session.id, revision: game.base_revision + 1 });
    if (old && JSON.stringify(old) === JSON.stringify(record)) continue;
    if ((old?.revision || 0) !== game.base_revision) throw new Error(`${game.id}: revision conflict; current revision is ${old?.revision || 0}.`);
    if (old && (old.session_id !== record.session_id || old.date !== record.date)) throw new Error(`${game.id}: existing game date and session cannot change.`);
    games.set(game.id, record);
  }
  const next = {
    players: [...players.values()].sort((a,b) => a.id.localeCompare(b.id)),
    games: [...games.values()].sort((a,b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)),
  };
  if (previous && JSON.stringify(next) === JSON.stringify({players:previous.players,games:previous.games})) return previous;
  return publishedSchema.parse({ version: (previous?.version || 0)+1, updated_at: new Date().toISOString(), ...next });
}
