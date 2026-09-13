import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { publishedSchema, publishStatic } from "../shared/published";

const path = process.argv[2];
if (!path) throw new Error("Usage: npm run stats:publish -- path/to/reviewed.import.json");
const destination = "public/stats.json";
const previous = existsSync(destination) ? publishedSchema.parse(JSON.parse(readFileSync(destination,"utf8"))) : undefined;
const data = publishStatic(JSON.parse(readFileSync(path,"utf8")), previous);
writeFileSync(destination, JSON.stringify(data,null,2)+"\n");
console.log(`Public stats version ${data.version}: ${data.games.length} game(s), ${data.players.length} players. Private commentary excluded.`);
