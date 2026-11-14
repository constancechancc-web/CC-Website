// Syncs the Featured Listings section in index.html with the agent's live
// NextSix profile. Run via `npm run sync-listings` or the scheduled
// GitHub Action in .github/workflows/sync-listings.yml.
//
// How it works: NextSix server-renders listing cards into the HTML (no
// headless browser needed), so we fetch the profile page, parse the cards
// with cheerio, and regenerate the two listing grids in index.html between
// fixed marker comments. If a listing disappears from NextSix it simply
// stops appearing here; nothing else in the file is touched.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as cheerio from "cheerio";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX_HTML_PATH = join(__dirname, "..", "index.html");
const SITEMAP_PATH = join(__dirname, "..", "sitemap.xml");
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
    const category = categorize(typeLabel, beds);
    const priceNum = priceText.replace(/^RM\s*/i, "").replace(/\/month$/i, "");

    listings.push({
      href,
      title: cleanTitle(title, loc),
      loc,
      priceText,
      priceNum,
      isRent,
      category,
      beds,
      baths,
      sqft,
      imgSrc: imgSrc.split("?")[0],
      typeLabel,
    });
  });

  return listings;
}

// Drives the filter tabs on the site: Commercial / Industrial. Land that is
// neither (e.g. agricultural) gets no type tab but still appears under Buy/Rent.
function categorize(typeLabel, beds) {
  if (beds) return "residential";
  if (/factory|warehouse|industrial/i.test(typeLabel)) return "industrial";
  if (/land/i.test(typeLabel)) return "land";
  return "commercial";
}

function metaLine(l) {
  if (l.beds) {
    const bathWord = l.baths === "1" ? "Bath" : "Baths";
    const bedsLabel = l.beds.toLowerCase() === "studio" ? "Studio" : `${l.beds} Beds`;
    return `${bedsLabel} &middot; ${l.baths || "0"} ${bathWord} &middot; ${l.sqft} sqft`;
  }
  const label = { industrial: "Industrial", land: "Land" }[l.category] || "Commercial";
  return `${label} &middot; ${l.sqft} sqft`;
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

// "Skudai, Johor" -> "Skudai"; used for the area chips and filter.
function areaOf(loc) {
  return (loc.split(",")[0] || loc).trim();
}

function renderAreaChips(listings) {
  const counts = new Map();
  for (const l of listings) {
    const a = areaOf(l.loc);
    counts.set(a, (counts.get(a) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
    .map(
      ([a, n]) =>
        `        <button type="button" class="area-chip focus-ring" data-area="${escapeHtml(a)}">${escapeHtml(a)}<span class="area-count">${n}</span></button>`,
    )
    .join("\n");
}

// schema.org ItemList of every listing, so search and AI engines can read the
// inventory as structured data.
function renderListingsLd(listings) {
  const priceOf = (l) => Number(String(l.priceNum).replace(/[^0-9.]/g, ""));
  const items = listings.map((l, i) => {
    const price = priceOf(l);
    const offer = l.isRent
      ? { "@type": "Offer", priceCurrency: "MYR", priceSpecification: { "@type": "UnitPriceSpecification", price, priceCurrency: "MYR", unitText: "MONTH" } }
      : { "@type": "Offer", priceCurrency: "MYR", price };
    return {
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "RealEstateListing",
        name: l.title,
        url: `https://nextsix.com${l.href}`,
        image: l.imgSrc,
        description: `${l.typeLabel} for ${l.isRent ? "rent" : "sale"} in ${l.loc}`,
        offers: offer,
      },
    };
  });
  const ld = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Property listings by Constance Chan, Johor Bahru",
    numberOfItems: items.length,
    itemListElement: items,
  };
  return `<script type="application/ld+json" id="listings-ld">\n${JSON.stringify(ld).replace(/</g, "\\u003c")}\n</script>`;
}

function malaysiaDate(d = new Date()) {
  return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function renderCard(l, { reveal, featured }) {
  const statusLabel = l.isRent ? "For Rent" : "For Sale";
  const price = l.isRent ? `RM ${l.priceNum}/month` : `RM ${l.priceNum}`;
  const revealClass = reveal ? " reveal" : "";
  const typeSuffix =
    l.typeLabel && l.typeLabel !== "Property" ? ` &middot; ${escapeHtml(l.typeLabel)}` : "";
  const featuredAttr = featured ? " data-featured" : "";
  const url = `https://nextsix.com${l.href}`;
  // The photo/text link and the Share / WhatsApp buttons are siblings (a link
  // can't contain buttons). The page script fills in the WhatsApp message.
  return `      <article class="prop-card${revealClass} group" data-deal="${l.isRent ? "rent" : "sale"}" data-type="${l.category}" data-area="${escapeHtml(areaOf(l.loc))}"${featuredAttr} data-url="${escapeHtml(url)}" data-title="${escapeHtml(l.title)}" data-loc="${escapeHtml(l.loc)}" data-price="${escapeHtml(price)}">
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="prop-link focus-ring">
          <div class="prop-media">
            <img src="${escapeHtml(l.imgSrc)}" alt="${altText(l)}" width="800" height="600" loading="lazy" onerror="this.closest('.prop-card').remove()" class="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]">
            <span class="prop-badge">${statusLabel}${typeSuffix}</span>
          </div>
          <div class="prop-body">
            <p class="prop-loc">${escapeHtml(l.loc)}</p>
            <h3 class="prop-title">${escapeHtml(l.title)}</h3>
            <div class="prop-meta-row">
              <span class="prop-price">${escapeHtml(price)}</span>
              <span class="prop-specs">${metaLine(l)}</span>
            </div>
            <span class="prop-view">View Property<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M7 17 17 7M9 7h8v8"/></svg></span>
          </div>
        </a>
        <div class="prop-actions">
          <button type="button" class="prop-act prop-share focus-ring" aria-label="Share this property"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8 15.8 6.2M8.2 13.2l7.6 4.6"/></svg><span class="prop-share-label">Share</span></button>
          <a href="https://wa.me/60192288249" target="_blank" rel="noopener" class="prop-act prop-wa focus-ring" aria-label="Enquire about this property on WhatsApp"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.28-1.38a9.9 9.9 0 0 0 4.76 1.21h.01c5.46 0 9.9-4.45 9.9-9.91C21.96 6.45 17.5 2 12.04 2zm5.8 14.16c-.24.68-1.4 1.33-1.93 1.4-.5.08-1.09.11-1.76-.11-.4-.13-.92-.3-1.58-.6-2.79-1.2-4.6-4.02-4.74-4.2-.14-.19-1.14-1.51-1.14-2.88 0-1.37.72-2.04.98-2.32.26-.28.56-.35.75-.35h.54c.17 0 .4-.03.63.48.24.55.8 1.9.87 2.04.07.14.11.3.02.49-.09.19-.14.3-.27.46-.14.16-.29.36-.41.49-.14.14-.28.29-.12.57.16.28.72 1.19 1.55 1.93 1.06.95 1.96 1.24 2.24 1.38.28.14.44.12.6-.07.16-.19.68-.79.87-1.06.19-.28.37-.23.62-.14.26.09 1.6.75 1.87.89.28.14.46.21.53.32.07.12.07.66-.17 1.34z"/></svg>WhatsApp</a>
        </div>
      </article>`;
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
  return { featured: combined, more };
}

function replaceBetweenMarkers(html, startMarker, endMarker, newInner) {
  // \r?\n rather than \n: the repo has picked up CRLF line endings before
  // (Windows checkouts convert LF -> CRLF), which silently broke this match
  // since "marker-->\n" no longer immediately followed the marker.
  const pattern = new RegExp(
    `(${startMarker}\\r?\\n)([\\s\\S]*?)(\\r?\\n\\s*${endMarker})`,
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

  const { featured, more } = pickFeatured(listings);

  const featuredHtml = featured
    .map((l) => renderCard(l, { reveal: true, featured: true }))
    .join("\n");
  const moreHtml = more.map((l) => renderCard(l, { reveal: false, featured: false })).join("\n");

  const original = readFileSync(INDEX_HTML_PATH, "utf8");
  let html = original;
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

  html = replaceBetweenMarkers(
    html,
    "<!-- LISTINGS:AREAS:START -->",
    "<!-- LISTINGS:AREAS:END -->",
    renderAreaChips(listings),
  );
  html = replaceBetweenMarkers(
    html,
    "<!-- LISTINGS:LD:START -->",
    "<!-- LISTINGS:LD:END -->",
    renderListingsLd(listings),
  );

  // Only bump the "updated" date when the listings really changed, so the daily
  // run doesn't create a commit on days with no new or removed listings.
  if (html !== original) {
    const today = malaysiaDate();
    const [y, m, d] = today.split("-").map(Number);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    html = replaceBetweenMarkers(
      html,
      "<!-- LISTINGS:UPDATED:START -->",
      "<!-- LISTINGS:UPDATED:END -->",
      `      Listings updated ${d} ${months[m - 1]} ${y}`,
    );
    html = html.replace(/("dateModified": ")[0-9-]+(")/, `$1${today}$2`);
    if (existsSync(SITEMAP_PATH)) {
      const sm = readFileSync(SITEMAP_PATH, "utf8");
      const next = sm.replace(/<lastmod>[^<]*<\/lastmod>/g, "").replace(/(<loc>[^<]*<\/loc>)/g, `$1<lastmod>${today}</lastmod>`);
      if (next !== sm) writeFileSync(SITEMAP_PATH, next, "utf8");
    }
  }

  writeFileSync(INDEX_HTML_PATH, html, "utf8");
  console.log(
    `Synced ${listings.length} listings (${featured.length} featured, ${more.length} more).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
