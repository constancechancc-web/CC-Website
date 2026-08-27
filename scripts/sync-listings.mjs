// Syncs the Featured Listings section in index.html with the agent's live
// NextSix profile. Run via `npm run sync-listings` or the scheduled
// GitHub Action in .github/workflows/sync-listings.yml.
//
// How it works: NextSix server-renders listing cards into the HTML (no
// headless browser needed), so we fetch the profile page, parse the cards
// with cheerio, and regenerate the two listing grids in index.html between
// fixed marker comments. If a listing disappears from NextSix it simply
// stops appearing here; nothing else in the file is touched.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as cheerio from "cheerio";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX_HTML_PATH = join(__dirname, "..", "index.html");
const NEXTSIX_URL =
  "https://nextsix.com/agent/constance-chan/5e0d9b2841d64f2b2823e6d6";
const AGENT_SLUG = "-constance-chan-";
const FEATURED_SALE_COUNT = 4;
const FEATURED_RENT_COUNT = 2;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function titleCaseWord(w) {
  return w ? w[0].toUpperCase() + w.slice(1) : w;
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// NextSix titles often repeat the sale/rent status and location that we
// already show on the eyebrow line, e.g. "... For Sale, Ulu Tiram". Strip
// that redundancy so cards read like a hand-edited title.
function cleanTitle(rawTitle, loc) {
  let t = rawTitle;
  const locCity = (loc.split(",")[0] || "").trim();
  if (locCity) {
    const suffixRe = new RegExp(
      `,?\\s*For (?:Sale|Rent)\\s*,?\\s*${escapeRegExp(locCity)}\\s*$`,
      "i",
    );
    t = t.replace(suffixRe, "");
  }
  t = t.replace(/,?\s*\bFor (?:Sale|Rent)\b\s*,?\s*/i, ", ");
  t = t
    .replace(/^,\s*/, "")
    .replace(/,\s*$/, "")
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
  return t || rawTitle;
}

async function fetchListings() {
  const res = await fetch(NEXTSIX_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    },
  });
  if (!res.ok) {
    throw new Error(`NextSix fetch failed: HTTP ${res.status}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const seen = new Set();
  const listings = [];

  $('a[href^="/property-listing/"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href || !href.includes(AGENT_SLUG) || seen.has(href)) return;
    seen.add(href);

    const card = $(el).find(".property-list-card-body").first();
    if (!card.length) return;

    const title = card.find(".property-row-nameText2").first().text().trim();
    const loc = card.find(".property-row-locText2").first().text().trim();
    const priceText = card
      .find(".property-row-priceText2")
      .first()
      .text()
      .trim();
    const tag = card.find(".property-row-saleTag2").first().text().trim();
    const imgSrc = card.find("img").first().attr("src");
    const imgAlt = card.find("img").first().attr("alt") || "";

    if (!title || !loc || !priceText || !imgSrc) return;

    let beds = null;
    let baths = null;
    let sqft = null;
    card.find(".property-row-iconsGroup2").each((_, g) => {
      const $g = $(g);
      const val = $g.find(".property-row-iconText2").first().text().trim();
      const icon = $g.find("i").first();
      if (icon.length) {
        const cls = icon.attr("class") || "";
        if (cls.includes("fa-bed")) beds = val;
        else if (cls.includes("fa-shower")) baths = val;
      } else if ($g.find("b").length) {
        sqft = val.replace(/\s*sqft$/i, "").trim();
      }
    });

    // NextSix's own alt text reads like "2-sty Terrace/Link House For Sale in Ulu Tiram Johor"
    const typeMatch = imgAlt.match(/^(.*?)\s+For (Sale|Rent) in /i);
    const typeLabel = typeMatch ? typeMatch[1].trim() : "Property";

    const isRent = tag.toLowerCase() === "rent";
    const priceNum = priceText.replace(/^RM\s*/i, "").replace(/\/month$/i, "");

    listings.push({
      href,
      title: cleanTitle(title, loc),
      loc,
      priceText,
      priceNum,
      isRent,
      beds,
      baths,
      sqft,
      imgSrc: imgSrc.split("?")[0],
      typeLabel,
    });
  });

  return listings;
}

function metaLine(l) {
  if (l.beds) {
    const bathWord = l.baths === "1" ? "Bath" : "Baths";
    const bedsLabel = l.beds.toLowerCase() === "studio" ? "Studio" : `${l.beds} Beds`;
    return `${bedsLabel} &middot; ${l.baths || "0"} ${bathWord} &middot; ${l.sqft} sqft`;
  }
  return `Commercial &middot; ${l.sqft} sqft`;
}

function altText(l) {
  const bedPrefix = l.beds
    ? l.beds.toLowerCase() === "studio"
      ? "Studio "
      : `${l.beds}-bedroom `
    : "";
  const saleWord = l.isRent ? "rent" : "sale";
  const priceSuffix = l.isRent
    ? `RM${l.priceNum} per month`
    : `RM${l.priceNum}`;
  return escapeHtml(
    `${bedPrefix}${titleCaseWord(l.typeLabel)} for ${saleWord} in ${l.title}, ${l.loc} – ${priceSuffix}, listed by Constance Chan`,
  );
}

function renderCard(l, { reveal }) {
  const statusLabel = l.isRent ? "For Rent" : "For Sale";
  const price = l.isRent ? `RM ${l.priceNum}/month` : `RM ${l.priceNum}`;
  const revealClass = reveal ? " reveal" : "";
  return `      <a href="https://nextsix.com${l.href}" target="_blank" rel="noopener" class="listing-card${revealClass} block focus-ring group">
        <div class="listing-media aspect-[4/3]">
          <img src="${escapeHtml(l.imgSrc)}" alt="${altText(l)}" loading="lazy" onerror="this.closest('a').remove()" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.06]">
          <span class="listing-view">View Property<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 17 17 7M9 7h8v8"/></svg></span>
        </div>
        <div class="pt-5">
          <p class="text-[11px] tracking-wide-eyebrow uppercase text-[var(--gold-deep)] mb-2">${statusLabel} &middot; ${escapeHtml(l.loc)}</p>
          <h3 class="font-display text-xl leading-snug mb-2 group-hover:text-[var(--gold-deep)] transition-colors">${escapeHtml(l.title)}</h3>
          <p class="font-display italic text-lg text-[var(--ink)] mb-2">${escapeHtml(price)}</p>
          <p class="text-[11px] text-[var(--ink)]/65 uppercase tracking-wide-eyebrow">${metaLine(l)}</p>
        </div>
      </a>`;
}

function renderHeroCard(l) {
  const statusLabel = l.isRent ? "For Rent" : "For Sale";
  const price = l.isRent ? `RM ${l.priceNum}/month` : `RM ${l.priceNum}`;
  return `    <a href="https://nextsix.com${l.href}" target="_blank" rel="noopener" class="feature-listing reveal group focus-ring">
      <div class="feature-listing-media">
        <img src="${escapeHtml(l.imgSrc)}" alt="${altText(l)}" loading="lazy" onerror="this.closest('a').remove()" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]">
        <span class="feature-listing-tag">Featured</span>
      </div>
      <div class="feature-listing-body">
        <p class="text-xs tracking-wide-eyebrow uppercase text-[var(--gold-deep)] mb-3">${statusLabel} &middot; ${escapeHtml(l.loc)}</p>
        <h3 class="font-display text-3xl md:text-4xl leading-tight mb-4">${escapeHtml(l.title)}</h3>
        <p class="font-display italic text-2xl text-[var(--ink)] mb-4">${escapeHtml(price)}</p>
        <p class="text-xs text-[var(--ink)]/65 uppercase tracking-wide-eyebrow mb-8">${metaLine(l)}</p>
        <span class="listing-view static-view">View Property<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 17 17 7M9 7h8v8"/></svg></span>
      </div>
    </a>`;
}

function pickFeatured(listings) {
  const sale = listings.filter((l) => !l.isRent);
  const rent = listings.filter((l) => l.isRent);

  let featuredSale = sale.slice(0, FEATURED_SALE_COUNT);
  let featuredRent = rent.slice(0, FEATURED_RENT_COUNT);

  // Backfill from whichever pool is short so we still aim for 6 featured
  // when the agent has fewer listings in one category.
  const target = FEATURED_SALE_COUNT + FEATURED_RENT_COUNT;
  let combined = [...featuredSale, ...featuredRent];
  if (combined.length < target) {
    const usedHrefs = new Set(combined.map((l) => l.href));
    const rest = listings.filter((l) => !usedHrefs.has(l.href));
    combined = combined.concat(rest.slice(0, target - combined.length));
  }

  const featuredHrefs = new Set(combined.map((l) => l.href));
  const more = listings.filter((l) => !featuredHrefs.has(l.href));

  // The first featured listing gets the large "hero" treatment at the top
  // of the Listings section; the rest sit in the regular grid below it.
  const [hero, ...featured] = combined;
  return { hero, featured, more };
}

function replaceBetweenMarkers(html, startMarker, endMarker, newInner) {
  const pattern = new RegExp(
    `(${startMarker}\\n)([\\s\\S]*?)(\\n\\s*${endMarker})`,
  );
  if (!pattern.test(html)) {
    throw new Error(`Markers not found: ${startMarker} / ${endMarker}`);
  }
  return html.replace(pattern, `$1${newInner}$3`);
}

async function main() {
  const listings = await fetchListings();
  if (listings.length === 0) {
    throw new Error(
      "No listings parsed from NextSix — page structure may have changed. Aborting without touching index.html.",
    );
  }

  const { hero, featured, more } = pickFeatured(listings);

  const heroHtml = renderHeroCard(hero);
  const featuredHtml = featured
    .map((l) => renderCard(l, { reveal: true }))
    .join("\n");
  const moreHtml = more.map((l) => renderCard(l, { reveal: false })).join("\n");

  let html = readFileSync(INDEX_HTML_PATH, "utf8");
  html = replaceBetweenMarkers(
    html,
    "<!-- LISTINGS:HERO:START -->",
    "<!-- LISTINGS:HERO:END -->",
    heroHtml,
  );
  html = replaceBetweenMarkers(
    html,
    "<!-- LISTINGS:FEATURED:START -->",
    "<!-- LISTINGS:FEATURED:END -->",
    featuredHtml,
  );
  html = replaceBetweenMarkers(
    html,
    "<!-- LISTINGS:MORE:START -->",
    "<!-- LISTINGS:MORE:END -->",
    moreHtml,
  );

  writeFileSync(INDEX_HTML_PATH, html, "utf8");
  console.log(
    `Synced ${listings.length} listings (1 hero, ${featured.length} featured, ${more.length} more).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
