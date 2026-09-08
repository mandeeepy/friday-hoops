import { writeFileSync, mkdirSync } from "node:fs";
import { zodToJsonSchema } from "zod-to-json-schema";
import { importSchema, validateImport } from "../shared/model";
import { sampleImport } from "../shared/demo";
import { extractionGuide } from "../shared/instructions";
mkdirSync("public/examples", { recursive: true });
writeFileSync(
  "public/import.schema.json",
  JSON.stringify(zodToJsonSchema(importSchema, "FridayHoopsImport"), null, 2),
);
const sample = sampleImport();
if (!validateImport(sample).ok) throw new Error("Invalid sample");
writeFileSync(
  "public/examples/friday-session.json",
  JSON.stringify(sample, null, 2),
);
writeFileSync("docs/COMMENTARY-AND-AI.md", extractionGuide);
console.log("Schema, valid sample, and commentary instructions generated.");
