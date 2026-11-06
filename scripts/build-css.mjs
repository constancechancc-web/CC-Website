// Compiles the Tailwind classes used in index.html into css/tailwind.css and
// stamps a content hash on the stylesheet link so browsers never pair stale
// CSS with new HTML. Run `npm run build-css` after adding or changing any
// Tailwind class in index.html (`npm run build` also rebuilds /zh/).

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "node_modules", "tailwindcss", "lib", "cli.js");

execFileSync(
  process.execPath,
  [cli, "-c", "tailwind.config.cjs", "-i", "scripts/tailwind.input.css", "-o", "css/tailwind.css", "--minify"],
  { cwd: root, stdio: "inherit" },
);

const hash = createHash("md5").update(readFileSync(join(root, "css", "tailwind.css"))).digest("hex").slice(0, 10);
const htmlPath = join(root, "index.html");
const html = readFileSync(htmlPath, "utf8");
const re = /\/css\/tailwind\.css\?v=[0-9a-z]+/;
if (!re.test(html)) throw new Error("build-css: stylesheet link not found in index.html");
const next = html.replace(re, `/css/tailwind.css?v=${hash}`);
if (next !== html) writeFileSync(htmlPath, next, "utf8");
console.log(`css/tailwind.css v=${hash}`);
