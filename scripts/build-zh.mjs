// Generates the Chinese page (zh/index.html -> constancechan.my/zh/) from
// index.html. index.html is the single source of truth: this only swaps text
// that has an entry in scripts/zh-dictionary.mjs and leaves everything else
// (markup, scripts, images, listing data) byte-for-byte identical.
//
// Run `npm run build-zh` after editing index.html. The daily GitHub Action
// runs it right after the NextSix listing sync.
//
//   node scripts/build-zh.mjs --report   also lists visible text left in English

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { translate, TITLE_ZH } from "./zh-dictionary.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "index.html");
const OUT = join(root, "zh", "index.html");

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  middot: "·", mdash: "—", ndash: "–", hellip: "…",
  rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", copy: "©",
};
const decode = (s) =>
  s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (m, dec, hex, name) => {
    if (dec) return String.fromCodePoint(+dec);
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    return Object.prototype.hasOwnProperty.call(ENTITIES, name) ? ENTITIES[name] : m;
  });
const escapeText = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (s) => escapeText(s).replace(/"/g, "&quot;");

const TOKEN = /(<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<!--[\s\S]*?-->|<[^>]+>)|([^<]+)/g;
const ATTR = /\b(aria-label|placeholder|title|content)="([^"]*)"/g;

const left = new Set();

function translateHtml(html) {
  let out = "";
  for (const m of html.matchAll(TOKEN)) {
    const [, tag, text] = m;
    if (text !== undefined) {
      const zh = translate(decode(text));
      if (zh) out += escapeText(zh);
      else {
        out += text;
        const t = decode(text).replace(/\s+/g, " ").trim();
        if (/[A-Za-z]{3,}/.test(t)) left.add(t);
      }
    } else if (/^<(script|style|!--)/.test(tag)) {
      out += tag;
    } else {
      out += tag.replace(ATTR, (full, name, value) => {
        const zh = translate(decode(value));
        return zh ? `${name}="${escapeAttr(zh)}"` : full;
      });
    }
  }
  return out;
}

function swap(html, from, to) {
  if (!html.includes(from)) throw new Error(`build-zh: expected to find: ${from.slice(0, 80)}`);
  return html.split(from).join(to);
}

let html = readFileSync(SRC, "utf8");

html = translateHtml(html);
html = swap(html, '<html lang="en">', '<html lang="zh-Hans">');
html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeText(TITLE_ZH)}</title>`);
html = swap(html, '<link rel="canonical" href="https://constancechan.my/">', '<link rel="canonical" href="https://constancechan.my/zh/">');
// Page-specific tags: URL and locale of the social-share card.
html = swap(html, '<meta property="og:url" content="https://constancechan.my/">', '<meta property="og:url" content="https://constancechan.my/zh/">');
html = swap(html, '<meta property="og:locale" content="en_MY">', '<meta property="og:locale" content="zh_CN">');
html = swap(html, '<meta property="og:locale:alternate" content="zh_CN">', '<meta property="og:locale:alternate" content="en_MY">');
html = swap(html, 'lang="en" class="active" aria-current="page">EN</a>', 'lang="en">EN</a>');
html = swap(html, 'hreflang="zh-Hans" lang="zh-Hans">', 'hreflang="zh-Hans" lang="zh-Hans" class="active" aria-current="page">');

// Runtime strings the page script sets after load (calculator note, View More button).
const runtime = {};
for (const k of ["View More Listings", "View Fewer Listings", "Based on the figures you entered"]) {
  runtime[k] = translate(k);
}
html = swap(html, "/*CC_T*/{}", JSON.stringify(runtime));

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html, "utf8");
console.log(`Wrote ${OUT}`);

if (process.argv.includes("--report")) {
  console.log(`\nVisible text left in English (${left.size}):`);
  for (const t of [...left].sort()) console.log("  " + t.slice(0, 90));
}
