// Regenerates the FAQ section + FAQPage structured data in index.html from
// scripts/faq-data.mjs. Run via `npm run build` (before build-css / build-zh).

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { applyFaq } from "./faq-data.mjs";

const path = join(dirname(fileURLToPath(import.meta.url)), "..", "index.html");
const html = readFileSync(path, "utf8");
const next = applyFaq(html, "en");
if (next !== html) writeFileSync(path, next, "utf8");
console.log("FAQ section + structured data up to date");
